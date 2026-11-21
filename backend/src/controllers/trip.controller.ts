import { Request, Response } from 'express';
import { DriverStatus, OrderStatus, Role } from '@prisma/client';
import axios from 'axios';
import prisma from '../lib/prisma';

const PYTHON_SOLVER_URL = process.env.PYTHON_SOLVER_URL || 'http://localhost:8090';

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
    const store = await prisma.store.findUnique({ where: { id: Number(storeId) } });
    if (!store) {
      return res.status(404).json({ success: false, message: 'Store (Depot) not found' });
    }

    // 2. Tìm danh sách đơn hàng được chọn ở trạng thái PACKED
    const orders = await prisma.order.findMany({
      where: {
        id: { in: orderIds.map(Number) },
        status: OrderStatus.PACKED,
      },
    });

    if (orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có đơn hàng PACKED nào hợp lệ trong danh sách đã chọn!',
      });
    }

    // Tìm và kiểm tra tài xế được chọn hoặc tự động chọn tài xế AVAILABLE
    let assignedDriverId: number | null = driverId ? Number(driverId) : null;
    if (assignedDriverId !== null) {
      const selectedDriver = await prisma.user.findFirst({
        where: { id: assignedDriverId, role: Role.DRIVER },
        include: { driverProfile: true },
      });
      if (!selectedDriver) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy tài xế được chọn!',
        });
      }
      if (selectedDriver.driverProfile && !selectedDriver.driverProfile.isActive) {
        return res.status(400).json({
          success: false,
          message: `Tài xế "${selectedDriver.name}" hiện đang ngừng hoạt động.`,
        });
      }
    } else {
      const availableDriver = await prisma.user.findFirst({
        where: {
          role: Role.DRIVER,
          driverProfile: { is: { isActive: true, status: DriverStatus.AVAILABLE } },
        },
        orderBy: { id: 'asc' },
      });
      if (availableDriver) {
        assignedDriverId = availableDriver.id;
      } else {
        const fallbackDriver = await prisma.user.findFirst({
          where: { role: Role.DRIVER },
          orderBy: { id: 'asc' },
        });
        if (fallbackDriver) assignedDriverId = fallbackDriver.id;
      }
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
      include: {
        store: true,
        driver: { select: { id: true, name: true, email: true, role: true } },
        orders: {
          include: { items: true },
          orderBy: { deliverySequence: 'asc' },
        },
      },
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

export const getTrips = async (_req: Request, res: Response) => {
  try {
    const trips = await prisma.trip.findMany({
      include: {
        store: true,
        driver: { select: { id: true, name: true, email: true, role: true } },
        orders: {
          include: { items: true },
          orderBy: { deliverySequence: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: trips });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyActiveTrip = async (req: Request, res: Response) => {
  try {
    const driverId = req.query.driverId ? Number(req.query.driverId) : undefined;
    const whereClause: any = {
      status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
    };
    if (driverId) {
      whereClause.driverId = driverId;
    }

    let activeTrip = await prisma.trip.findFirst({
      where: whereClause,
      include: {
        store: true,
        driver: { select: { id: true, name: true, email: true, role: true } },
        orders: {
          include: { items: true },
          orderBy: { deliverySequence: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Nếu không còn chuyến ASSIGNED/IN_TRANSIT thì lấy chuyến mới nhất để hiển thị trên bản đồ
    if (!activeTrip) {
      activeTrip = await prisma.trip.findFirst({
        include: {
          store: true,
          driver: { select: { id: true, name: true, email: true, role: true } },
          orders: {
            include: { items: true },
            orderBy: { deliverySequence: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    res.json({ success: true, data: activeTrip });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
