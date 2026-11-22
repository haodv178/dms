import { Request, Response } from 'express';
import { DriverStatus, OrderStatus, Prisma, Role } from '@prisma/client';
import axios from 'axios';
import prisma from '../lib/prisma';
import { checkDeliveryRadius, MAX_DELIVERY_DISTANCE_KM } from '../lib/geo';
import {
  formatTimeslotLabel,
  parseDeliveryDate,
  parseHourDelivery,
} from '../lib/timeslot';

const PYTHON_SOLVER_URL = process.env.PYTHON_SOLVER_URL || 'http://localhost:8090';

const TRIP_WITH_RELATIONS_INCLUDE = {
  store: true,
  driver: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      driverProfile: {
        select: {
          storeId: true,
          phone: true,
          vehicleType: true,
          licensePlate: true,
          status: true,
        },
      },
    },
  },
  orders: {
    include: { items: true },
    orderBy: [{ deliverySequence: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.TripInclude;

async function syncDriverAvailability(
  tx: Prisma.TransactionClient,
  driverId: number | null
) {
  if (!driverId) return;
  const activeCount = await tx.trip.count({
    where: {
      driverId,
      status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
    },
  });
  await tx.driverProfile.updateMany({
    where: {
      userId: driverId,
      isActive: true,
    },
    data: {
      status: activeCount > 0 ? DriverStatus.ON_DELIVERY : DriverStatus.AVAILABLE,
    },
  });
}

export const optimizeAndCreateTrip = async (req: Request, res: Response) => {
  try {
    const { storeId = 1, orderIds, driverId } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn ít nhất 1 đơn hàng PACKED để tối ưu lộ trình!',
      });
    }

    // 1. Tìm thông tin Store (Depot)
    const store = storeId
      ? await prisma.store.findUnique({ where: { id: Number(storeId) } })
      : await prisma.store.findFirst({
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
        });
    if (!store) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy điểm xuất phát (Depot).' });
    }
    if (!store.isActive) {
      return res.status(400).json({
        success: false,
        message: `Điểm xuất phát "${store.name}" hiện đang ngừng hoạt động.`,
      });
    }

    // 2. Tìm danh sách đơn hàng được chọn ở trạng thái PACKED
    const orders = await prisma.order.findMany({
      where: {
        id: { in: orderIds.map(Number) },
        status: OrderStatus.PACKED,
      },
      include: {
        store: { select: { id: true, name: true } },
      },
    });

    if (orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có đơn hàng PACKED nào hợp lệ trong danh sách đã chọn!',
      });
    }

    // 2a. Kiểm tra tất cả đơn hàng phải thuộc đúng depot xuất phát
    const wrongDepotOrders = orders.filter((o) => o.storeId !== store.id);
    if (wrongDepotOrders.length > 0) {
      const details = wrongDepotOrders
        .map((o) => `${o.orderCode} (${o.store.name})`)
        .join(', ');
      return res.status(400).json({
        success: false,
        message: `Có ${wrongDepotOrders.length} đơn hàng không thuộc depot "${store.name}": ${details}. Chuyến xe chỉ được gán các đơn cùng depot.`,
      });
    }

    // 2b. Kiểm tra bán kính giao hàng tối đa 5km từ điểm xuất phát
    const outOfRange = orders
      .map((order) => {
        const check = checkDeliveryRadius(
          store.latitude,
          store.longitude,
          order.latitude,
          order.longitude
        );
        return { order, ...check };
      })
      .filter((item) => !item.ok);

    if (outOfRange.length > 0) {
      const details = outOfRange
        .map((item) => `${item.order.orderCode} (${item.distanceKm.toFixed(2)} km)`)
        .join(', ');
      return res.status(400).json({
        success: false,
        message: `Có ${outOfRange.length} đơn hàng vượt quá bán kính tối đa ${MAX_DELIVERY_DISTANCE_KM} km từ "${store.name}": ${details}.`,
      });
    }

    // 2c. Kiểm tra tất cả đơn hàng trong chuyến phải cùng ngày giao và cùng khung giờ giao (hourDelivery)
    const distinctSlots = new Map<string, { deliveryDate: string; hourDelivery: number; codes: string[] }>();
    for (const order of orders) {
      const key = `${order.deliveryDate}|${order.hourDelivery}`;
      const existing = distinctSlots.get(key);
      if (existing) {
        existing.codes.push(order.orderCode);
      } else {
        distinctSlots.set(key, {
          deliveryDate: order.deliveryDate,
          hourDelivery: order.hourDelivery,
          codes: [order.orderCode],
        });
      }
    }
    if (distinctSlots.size > 1) {
      const slotSummary = Array.from(distinctSlots.values())
        .map(
          (s) =>
            `${s.deliveryDate} (${formatTimeslotLabel(s.hourDelivery)}): ${s.codes.join(', ')}`
        )
        .join(' | ');
      return res.status(400).json({
        success: false,
        message: `Chuyến xe chỉ được gán các đơn hàng cùng ngày và cùng khung giờ giao! Các khung giờ đang chọn bị trộn lẫn: ${slotSummary}.`,
      });
    }

    const tripDeliveryDate = orders[0].deliveryDate;
    const tripHourDelivery = orders[0].hourDelivery;

    // Tìm và kiểm tra tài xế được chọn hoặc tự động chọn tài xế rảnh trong khung giờ này cùng depot
    let assignedDriverId: number | null = driverId ? Number(driverId) : null;
    if (assignedDriverId !== null) {
      const selectedDriver = await prisma.user.findFirst({
        where: { id: assignedDriverId, role: Role.DRIVER },
        include: {
          driverProfile: {
            include: { store: { select: { id: true, name: true } } },
          },
        },
      });
      if (!selectedDriver) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy tài xế được chọn!',
        });
      }
      if (!selectedDriver.driverProfile) {
        return res.status(400).json({
          success: false,
          message: `Tài xế "${selectedDriver.name}" chưa có hồ sơ và depot phụ trách.`,
        });
      }
      if (!selectedDriver.driverProfile.isActive) {
        return res.status(400).json({
          success: false,
          message: `Tài xế "${selectedDriver.name}" hiện đang ngừng hoạt động.`,
        });
      }
      if (selectedDriver.driverProfile.status === DriverStatus.OFFLINE) {
        return res.status(400).json({
          success: false,
          message: `Tài xế "${selectedDriver.name}" hiện đang ngoại tuyến (OFFLINE).`,
        });
      }
      if (selectedDriver.driverProfile.storeId !== store.id) {
        return res.status(400).json({
          success: false,
          message: `Tài xế "${selectedDriver.name}" thuộc depot "${selectedDriver.driverProfile.store.name}", không thể nhận chuyến xuất phát từ depot "${store.name}".`,
        });
      }

      const conflictingTrip = await prisma.trip.findFirst({
        where: {
          driverId: selectedDriver.id,
          deliveryDate: tripDeliveryDate,
          hourDelivery: tripHourDelivery,
          status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
        },
        select: { id: true, tripCode: true },
      });
      if (conflictingTrip) {
        return res.status(400).json({
          success: false,
          message: `Tài xế "${selectedDriver.name}" đã có chuyến ${conflictingTrip.tripCode} trong khung giờ ${formatTimeslotLabel(tripHourDelivery)} ngày ${tripDeliveryDate}. Một tài xế không thể nhận 2 chuyến cùng khung giờ.`,
        });
      }
    } else {
      const candidateDrivers = await prisma.user.findMany({
        where: {
          role: Role.DRIVER,
          driverProfile: {
            is: {
              isActive: true,
              status: { not: DriverStatus.OFFLINE },
              storeId: store.id,
            },
          },
          trips: {
            none: {
              deliveryDate: tripDeliveryDate,
              hourDelivery: tripHourDelivery,
              status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
            },
          },
        },
        include: {
          driverProfile: { select: { status: true } },
          _count: {
            select: {
              trips: {
                where: { status: { in: ['ASSIGNED', 'IN_TRANSIT'] } },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
      });

      candidateDrivers.sort((a, b) => {
        const aAvail = a.driverProfile?.status === DriverStatus.AVAILABLE ? 0 : 1;
        const bAvail = b.driverProfile?.status === DriverStatus.AVAILABLE ? 0 : 1;
        if (aAvail !== bAvail) return aAvail - bAvail;
        if (a._count.trips !== b._count.trips) return a._count.trips - b._count.trips;
        return a.id - b.id;
      });

      const availableDriver = candidateDrivers[0];
      if (!availableDriver) {
        return res.status(400).json({
          success: false,
          message: `Depot "${store.name}" hiện không có tài xế nào rảnh cho khung giờ ${formatTimeslotLabel(tripHourDelivery)} ngày ${tripDeliveryDate}. Vui lòng chọn tài xế khác hoặc thêm tài xế cho depot này.`,
        });
      }
      assignedDriverId = availableDriver.id;
    }

    // 3. Gửi payload sang Python OR-Tools solver
    const payload = {
      depot: { lat: store.latitude, lng: store.longitude },
      orders: orders.map((o) => ({
        order_id: o.id,
        lat: o.latitude,
        lng: o.longitude,
      })),
      num_vehicles: 1,
    };

    const solverRes = await axios.post(`${PYTHON_SOLVER_URL}/solve-vrp`, payload);
    if (solverRes.data.status !== 'SUCCESS') {
      return res.status(500).json({
        success: false,
        message: 'OR-Tools solver failed to find an optimal route!',
      });
    }

    const route = solverRes.data.routes[0];

    // 4. Tạo Trip trong database và cập nhật thứ tự giao hàng
    const trip = await prisma.trip.create({
      data: {
        tripCode: `TRIP-${Date.now().toString().slice(-6)}`,
        storeId: store.id,
        driverId: assignedDriverId,
        status: 'ASSIGNED',
        totalDistance: route.total_distance_meters,
        deliveryDate: tripDeliveryDate,
        hourDelivery: tripHourDelivery,
      },
    });

    if (assignedDriverId) {
      await prisma.driverProfile.updateMany({
        where: { userId: assignedDriverId },
        data: { status: DriverStatus.ON_DELIVERY },
      });
    }

    // Cập nhật từng order: gán tripId, deliverySequence, và đổi trạng thái sang DELIVERING
    for (const stop of route.stops) {
      await prisma.order.update({
        where: { id: stop.order_id },
        data: {
          tripId: trip.id,
          deliverySequence: stop.sequence,
          status: OrderStatus.DELIVERING,
        },
      });
    }

    const finalTrip = await prisma.trip.findUnique({
      where: { id: trip.id },
      include: TRIP_WITH_RELATIONS_INCLUDE,
    });

    res.json({
      success: true,
      message: 'Đã tối ưu lộ trình bằng Google OR-Tools và gán chuyến xe thành công!',
      data: finalTrip,
      solverDetails: route,
    });
  } catch (error: any) {
    console.error('Error optimizing trip:', error?.message);
    res.status(500).json({
      success: false,
      message: `Lỗi tối ưu lộ trình: ${error?.response?.data?.message || error.message}`,
    });
  }
};

export const getTrips = async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const rawDeliveryDate =
      typeof req.query.deliveryDate === 'string' ? req.query.deliveryDate.trim() : '';
    const rawHourDelivery =
      typeof req.query.hourDelivery === 'string' ? req.query.hourDelivery.trim() : '';

    const whereClause: Prisma.TripWhereInput = {};
    if (req.user?.role === Role.DRIVER) {
      whereClause.driverId = req.user.id;
    }
    if (status && status !== 'ALL') {
      whereClause.status = status;
    }
    if (rawDeliveryDate && rawDeliveryDate !== 'ALL') {
      const parsedDate = parseDeliveryDate(rawDeliveryDate);
      if (parsedDate.error) {
        return res.status(400).json({ success: false, message: parsedDate.error });
      }
      if (parsedDate.value) {
        whereClause.deliveryDate = parsedDate.value;
      }
    }
    if (rawHourDelivery && rawHourDelivery !== 'ALL') {
      const parsedHour = parseHourDelivery(rawHourDelivery);
      if (parsedHour.error) {
        return res.status(400).json({ success: false, message: parsedHour.error });
      }
      if (parsedHour.value !== undefined) {
        whereClause.hourDelivery = parsedHour.value;
      }
    }
    if (search) {
      whereClause.OR = [
        { tripCode: { contains: search, mode: 'insensitive' } },
        { driver: { name: { contains: search, mode: 'insensitive' } } },
        {
          orders: {
            some: {
              OR: [
                { orderCode: { contains: search, mode: 'insensitive' } },
                { customerName: { contains: search, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    const trips = await prisma.trip.findMany({
      where: whereClause,
      include: TRIP_WITH_RELATIONS_INCLUDE,
      orderBy: [{ deliveryDate: 'desc' }, { hourDelivery: 'asc' }, { createdAt: 'desc' }],
    });
    res.json({ success: true, data: trips });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyActiveTrip = async (req: Request, res: Response) => {
  try {
    const driverId =
      req.user?.role === Role.DRIVER
        ? req.user.id
        : req.query.driverId
          ? Number(req.query.driverId)
          : undefined;
    const whereClause: Prisma.TripWhereInput = {
      status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
    };
    if (driverId) {
      whereClause.driverId = driverId;
    }

    let activeTrip = await prisma.trip.findFirst({
      where: whereClause,
      include: TRIP_WITH_RELATIONS_INCLUDE,
      orderBy: [{ deliveryDate: 'asc' }, { hourDelivery: 'asc' }, { createdAt: 'desc' }],
    });

    // Nếu không còn chuyến ASSIGNED/IN_TRANSIT thì lấy chuyến mới nhất để hiển thị trên bản đồ
    if (!activeTrip) {
      activeTrip = await prisma.trip.findFirst({
        where: driverId ? { driverId } : undefined,
        include: TRIP_WITH_RELATIONS_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
    }

    res.json({ success: true, data: activeTrip });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const startTrip = async (req: Request, res: Response) => {
  try {
    const tripId = Number(req.params.id);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(400).json({ success: false, message: 'ID chuyến xe không hợp lệ.' });
    }

    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy chuyến xe.' });
    }
    if (req.user?.role === Role.DRIVER && trip.driverId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Bạn chỉ có thể bắt đầu chuyến xe được phân công cho mình.',
      });
    }

    if (trip.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: 'Chuyến xe đã hoàn thành, không thể xuất phát lại.',
      });
    }

    if (trip.status === 'IN_TRANSIT') {
      const currentTrip = await prisma.trip.findUnique({
        where: { id: tripId },
        include: TRIP_WITH_RELATIONS_INCLUDE,
      });
      return res.json({
        success: true,
        message: `Chuyến ${trip.tripCode} hiện đang ở trạng thái IN_TRANSIT.`,
        data: currentTrip,
      });
    }

    const updatedTrip = await prisma.$transaction(async (tx) => {
      const updated = await tx.trip.update({
        where: { id: tripId },
        data: { status: 'IN_TRANSIT' },
        include: TRIP_WITH_RELATIONS_INCLUDE,
      });

      if (updated.driverId) {
        await tx.driverProfile.updateMany({
          where: { userId: updated.driverId },
          data: { status: DriverStatus.ON_DELIVERY },
        });
      }

      return updated;
    });

    res.json({
      success: true,
      message: `Chuyến ${updatedTrip.tripCode} đã bắt đầu xuất phát (IN_TRANSIT)!`,
      data: updatedTrip,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const reassignTripDriver = async (req: Request, res: Response) => {
  try {
    const tripId = Number(req.params.id);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(400).json({ success: false, message: 'ID chuyến xe không hợp lệ.' });
    }

    const driverId = Number(req.body?.driverId);
    if (!Number.isInteger(driverId) || driverId <= 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn tài xế hợp lệ.' });
    }

    const existingTrip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { store: { select: { id: true, name: true } } },
    });
    if (!existingTrip) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy chuyến xe.' });
    }
    if (existingTrip.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: 'Không thể đổi tài xế cho chuyến xe đã hoàn thành.',
      });
    }

    const targetDriver = await prisma.user.findFirst({
      where: { id: driverId, role: Role.DRIVER },
      include: {
        driverProfile: {
          include: { store: { select: { id: true, name: true } } },
        },
      },
    });
    if (!targetDriver) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế được chọn.' });
    }
    if (!targetDriver.driverProfile) {
      return res.status(400).json({
        success: false,
        message: `Tài xế "${targetDriver.name}" chưa có hồ sơ và depot phụ trách.`,
      });
    }
    if (!targetDriver.driverProfile.isActive) {
      return res.status(400).json({
        success: false,
        message: `Tài xế "${targetDriver.name}" hiện đang ngừng hoạt động.`,
      });
    }
    if (targetDriver.driverProfile.status === DriverStatus.OFFLINE) {
      return res.status(400).json({
        success: false,
        message: `Tài xế "${targetDriver.name}" đang ngoại tuyến (OFFLINE), không thể nhận chuyến.`,
      });
    }
    if (targetDriver.driverProfile.storeId !== existingTrip.storeId) {
      return res.status(400).json({
        success: false,
        message: `Tài xế "${targetDriver.name}" thuộc depot "${targetDriver.driverProfile.store.name}", không thể nhận chuyến ${existingTrip.tripCode} thuộc depot "${existingTrip.store.name}".`,
      });
    }

    const conflictingTrip = await prisma.trip.findFirst({
      where: {
        id: { not: existingTrip.id },
        driverId: targetDriver.id,
        deliveryDate: existingTrip.deliveryDate,
        hourDelivery: existingTrip.hourDelivery,
        status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
      },
      select: { id: true, tripCode: true },
    });
    if (conflictingTrip) {
      return res.status(400).json({
        success: false,
        message: `Tài xế "${targetDriver.name}" đã được phân công chuyến ${conflictingTrip.tripCode} trong khung giờ ${formatTimeslotLabel(existingTrip.hourDelivery)} ngày ${existingTrip.deliveryDate}. Một tài xế không thể nhận 2 chuyến cùng khung giờ.`,
      });
    }

    const oldDriverId = existingTrip.driverId;

    const updatedTrip = await prisma.$transaction(async (tx) => {
      const trip = await tx.trip.update({
        where: { id: tripId },
        data: { driverId: targetDriver.id },
        include: TRIP_WITH_RELATIONS_INCLUDE,
      });

      await tx.driverProfile.updateMany({
        where: { userId: targetDriver.id },
        data: { status: DriverStatus.ON_DELIVERY },
      });

      if (oldDriverId && oldDriverId !== targetDriver.id) {
        await syncDriverAvailability(tx, oldDriverId);
      }

      return trip;
    });

    res.json({
      success: true,
      message: `Đã đổi tài xế chuyến ${updatedTrip.tripCode} sang ${targetDriver.name}!`,
      data: updatedTrip,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const reoptimizeTrip = async (req: Request, res: Response) => {
  try {
    const tripId = Number(req.params.id);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(400).json({ success: false, message: 'ID chuyến xe không hợp lệ.' });
    }

    const existingTrip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        store: true,
        orders: {
          orderBy: [{ deliverySequence: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!existingTrip) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy chuyến xe.' });
    }
    if (existingTrip.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: 'Không thể tối ưu lại lộ trình cho chuyến xe đã hoàn thành.',
      });
    }

    const deliveringOrders = existingTrip.orders.filter(
      (o) => o.status === OrderStatus.DELIVERING
    );
    if (deliveringOrders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Chuyến xe không còn đơn hàng DELIVERING nào để tối ưu lộ trình.',
      });
    }

    const finishedOrders = existingTrip.orders.filter(
      (o) => o.status !== OrderStatus.DELIVERING
    );

    const payload = {
      depot: {
        lat: existingTrip.store.latitude,
        lng: existingTrip.store.longitude,
      },
      orders: deliveringOrders.map((o) => ({
        order_id: o.id,
        lat: o.latitude,
        lng: o.longitude,
      })),
      num_vehicles: 1,
    };

    const solverRes = await axios.post(`${PYTHON_SOLVER_URL}/solve-vrp`, payload);
    if (solverRes.data.status !== 'SUCCESS') {
      return res.status(500).json({
        success: false,
        message: 'OR-Tools solver failed to find an optimal route!',
      });
    }

    const route = solverRes.data.routes[0];
    const sequenceOffset = finishedOrders.length;

    const updatedTrip = await prisma.$transaction(async (tx) => {
      for (let i = 0; i < finishedOrders.length; i++) {
        await tx.order.update({
          where: { id: finishedOrders[i].id },
          data: { deliverySequence: i + 1 },
        });
      }

      for (const stop of route.stops) {
        await tx.order.update({
          where: { id: stop.order_id },
          data: { deliverySequence: sequenceOffset + stop.sequence },
        });
      }

      return tx.trip.update({
        where: { id: tripId },
        data: { totalDistance: route.total_distance_meters },
        include: TRIP_WITH_RELATIONS_INCLUDE,
      });
    });

    res.json({
      success: true,
      message: `Đã tối ưu lại lộ trình cho ${deliveringOrders.length} điểm giao còn lại của chuyến ${updatedTrip.tripCode}!`,
      data: updatedTrip,
      solverDetails: route,
    });
  } catch (error: any) {
    console.error('Error re-optimizing trip:', error?.message);
    res.status(500).json({
      success: false,
      message: `Lỗi tối ưu lại lộ trình: ${error?.response?.data?.message || error.message}`,
    });
  }
};

export const cancelOrDeleteTrip = async (req: Request, res: Response) => {
  try {
    const tripId = Number(req.params.id);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(400).json({ success: false, message: 'ID chuyến xe không hợp lệ.' });
    }

    const existingTrip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { orders: true },
    });
    if (!existingTrip) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy chuyến xe.' });
    }
    if (existingTrip.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: 'Không thể hủy chuyến xe đã hoàn thành.',
      });
    }

    const deliveringOrderIds = existingTrip.orders
      .filter((o) => o.status === OrderStatus.DELIVERING)
      .map((o) => o.id);
    const finishedOrdersCount = existingTrip.orders.length - deliveringOrderIds.length;

    const result = await prisma.$transaction(async (tx) => {
      if (deliveringOrderIds.length > 0) {
        await tx.order.updateMany({
          where: { id: { in: deliveringOrderIds } },
          data: {
            tripId: null,
            deliverySequence: null,
            status: OrderStatus.PACKED,
          },
        });
      }

      let deleted = false;
      if (finishedOrdersCount === 0) {
        await tx.trip.delete({ where: { id: tripId } });
        deleted = true;
      } else {
        await tx.trip.update({
          where: { id: tripId },
          data: {
            status: 'COMPLETED',
            totalDistance: null,
          },
        });
      }

      if (existingTrip.driverId) {
        await syncDriverAvailability(tx, existingTrip.driverId);
      }

      return { deleted, returnedOrdersCount: deliveringOrderIds.length };
    });

    const message = result.deleted
      ? `Đã hủy chuyến ${existingTrip.tripCode} và đưa ${result.returnedOrdersCount} đơn hàng về trạng thái PACKED.`
      : `Đã thu hồi ${result.returnedOrdersCount} đơn chưa giao về PACKED và đóng chuyến ${existingTrip.tripCode} (giữ lại lịch sử ${finishedOrdersCount} đơn đã xử lý).`;

    res.json({
      success: true,
      message,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
