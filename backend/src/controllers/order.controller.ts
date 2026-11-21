import { Request, Response } from 'express';
import { DriverStatus, OrderStatus, Prisma, Role } from '@prisma/client';
import prisma from '../lib/prisma';

const EDITABLE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.PICKING,
  OrderStatus.PACKED,
];

const ASSIGNABLE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PACKED,
  OrderStatus.DELIVERING,
  OrderStatus.FAILED,
];

const ORDER_WITH_RELATIONS_INCLUDE = {
  items: true,
  store: true,
  trip: {
    include: {
      driver: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          driverProfile: {
            select: {
              phone: true,
              vehicleType: true,
              licensePlate: true,
              status: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.OrderInclude;

interface NormalizedOrderItem {
  productId: number | null;
  sku: string | null;
  productName: string;
  quantity: number;
  price: number;
}

async function resolveAndValidateItems(
  items: unknown,
  allowLegacyFallback: boolean
): Promise<{
  items?: NormalizedOrderItem[];
  error?: string;
}> {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'Đơn hàng phải có ít nhất 1 sản phẩm từ danh mục.' };
  }

  const productIds = Array.from(
    new Set(
      items
        .map((raw) => Number((raw as Record<string, unknown>)?.productId))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );
  const skus = Array.from(
    new Set(
      items
        .map((raw) =>
          typeof (raw as Record<string, unknown>)?.sku === 'string'
            ? String((raw as Record<string, unknown>).sku).trim()
            : ''
        )
        .filter(Boolean)
    )
  );
  const names = Array.from(
    new Set(
      items
        .map((raw) =>
          typeof (raw as Record<string, unknown>)?.productName === 'string'
            ? String((raw as Record<string, unknown>).productName).trim()
            : ''
        )
        .filter(Boolean)
    )
  );

  const orClauses: Record<string, unknown>[] = [];
  if (productIds.length > 0) orClauses.push({ id: { in: productIds } });
  if (skus.length > 0) orClauses.push({ sku: { in: skus } });
  if (names.length > 0) orClauses.push({ name: { in: names } });

  const matchedProducts =
    orClauses.length > 0
      ? await prisma.product.findMany({ where: { OR: orClauses } })
      : [];

  const byId = new Map(matchedProducts.map((p) => [p.id, p]));
  const bySku = new Map(matchedProducts.map((p) => [p.sku.toUpperCase(), p]));
  const byName = new Map(matchedProducts.map((p) => [p.name.toLowerCase(), p]));

  const normalized: NormalizedOrderItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const raw = items[i] as Record<string, unknown>;
    const quantity = Number(raw?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { error: `Sản phẩm #${i + 1}: Số lượng (Qty) phải là số nguyên >= 1.` };
    }

    const rawProductId = Number(raw?.productId);
    const rawSku = typeof raw?.sku === 'string' ? raw.sku.trim() : '';
    const rawName = typeof raw?.productName === 'string' ? raw.productName.trim() : '';

    const catalogProduct =
      (Number.isInteger(rawProductId) && rawProductId > 0 ? byId.get(rawProductId) : undefined) ||
      (rawSku ? bySku.get(rawSku.toUpperCase()) : undefined) ||
      (rawName ? byName.get(rawName.toLowerCase()) : undefined);

    if (catalogProduct) {
      normalized.push({
        productId: catalogProduct.id,
        sku: catalogProduct.sku,
        productName: catalogProduct.name,
        quantity,
        price: Number(catalogProduct.price),
      });
    } else if (allowLegacyFallback && rawName) {
      const fallbackPrice = Number(raw?.price);
      if (!Number.isFinite(fallbackPrice) || fallbackPrice < 0) {
        return { error: `Sản phẩm "${rawName}": Đơn giá không hợp lệ.` };
      }
      normalized.push({
        productId: null,
        sku: rawSku || null,
        productName: rawName,
        quantity,
        price: fallbackPrice,
      });
    } else {
      return {
        error: `Sản phẩm #${i + 1} không tồn tại trong danh mục sản phẩm. Vui lòng chọn từ danh sách sản phẩm.`,
      };
    }
  }

  return { items: normalized };
}

export const getOrders = async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const whereClause =
      status && status !== 'ALL' ? { status: status as OrderStatus } : {};

    const orders = await prisma.order.findMany({
      where: whereClause,
      include: ORDER_WITH_RELATIONS_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    res.json({ success: true, data: orders });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const order = await prisma.order.findUnique({
      where: { id: Number(id) },
      include: { items: true, store: true, trip: true },
    });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, data: order });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createOrder = async (req: Request, res: Response) => {
  try {
    const {
      orderCode,
      storeId = 1,
      customerName,
      customerPhone,
      customerAddress,
      latitude,
      longitude,
      items = [],
    } = req.body;

    if (!customerName || !customerAddress || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ tên khách hàng, địa chỉ và tọa độ GPS (latitude, longitude).',
      });
    }

    const { items: normalizedItems, error: itemsError } = await resolveAndValidateItems(
      items,
      false
    );
    if (itemsError || !normalizedItems) {
      return res.status(400).json({ success: false, message: itemsError });
    }

    const computedTotal = normalizedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const newOrder = await prisma.order.create({
      data: {
        orderCode: orderCode || `ORD-${Math.floor(100 + Math.random() * 900)}-${Date.now().toString().slice(-3)}`,
        storeId: Number(storeId),
        customerName: String(customerName).trim(),
        customerPhone: (customerPhone || '0900000000').trim(),
        customerAddress: String(customerAddress).trim(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        totalAmount: computedTotal,
        status: OrderStatus.NEW,
        items: {
          create: normalizedItems,
        },
      },
      include: { items: true, store: true, trip: true },
    });

    res.status(201).json({
      success: true,
      message: 'Tạo đơn hàng mới thành công!',
      data: newOrder,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateOrder = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID đơn hàng không hợp lệ.' });
    }

    const existingOrder = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existingOrder) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    }

    if (!EDITABLE_ORDER_STATUSES.includes(existingOrder.status)) {
      return res.status(400).json({
        success: false,
        message: `Không thể chỉnh sửa đơn hàng ở trạng thái ${existingOrder.status}. Chỉ cho phép sửa đơn ở trạng thái NEW, PICKING hoặc PACKED.`,
      });
    }

    const {
      customerName,
      customerPhone,
      customerAddress,
      latitude,
      longitude,
      items,
    } = req.body;

    const trimmedName = typeof customerName === 'string' ? customerName.trim() : '';
    const trimmedAddress = typeof customerAddress === 'string' ? customerAddress.trim() : '';
    const trimmedPhone = typeof customerPhone === 'string' ? customerPhone.trim() : '';
    const parsedLat = Number(latitude);
    const parsedLng = Number(longitude);

    if (!trimmedName || !trimmedAddress) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ tên khách hàng và địa chỉ giao hàng.',
      });
    }

    if (
      latitude === undefined ||
      longitude === undefined ||
      !Number.isFinite(parsedLat) ||
      !Number.isFinite(parsedLng) ||
      parsedLat < -90 ||
      parsedLat > 90 ||
      parsedLng < -180 ||
      parsedLng > 180
    ) {
      return res.status(400).json({
        success: false,
        message: 'Tọa độ GPS (latitude, longitude) không hợp lệ.',
      });
    }

    const { items: normalizedItems, error: itemsError } = await resolveAndValidateItems(
      items,
      true
    );
    if (itemsError || !normalizedItems) {
      return res.status(400).json({ success: false, message: itemsError });
    }

    const computedTotal = normalizedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        customerName: trimmedName,
        customerPhone: trimmedPhone || existingOrder.customerPhone,
        customerAddress: trimmedAddress,
        latitude: parsedLat,
        longitude: parsedLng,
        totalAmount: computedTotal,
        items: {
          deleteMany: {},
          create: normalizedItems,
        },
      },
      include: {
        items: true,
        store: true,
        trip: {
          include: { driver: { select: { id: true, name: true, email: true, role: true } } },
        },
      },
    });

    res.json({
      success: true,
      message: `Đã cập nhật đơn hàng ${updatedOrder.orderCode} thành công!`,
      data: updatedOrder,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const startPicking = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updatedOrder = await prisma.order.update({
      where: { id: Number(id) },
      data: { status: OrderStatus.PICKING },
      include: { items: true, store: true, trip: true },
    });
    res.json({ success: true, message: 'Đã bắt đầu nhặt hàng', data: updatedOrder });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const completePacking = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updatedOrder = await prisma.order.update({
      where: { id: Number(id) },
      data: { status: OrderStatus.PACKED },
      include: { items: true, store: true, trip: true },
    });
    res.json({ success: true, message: 'Đã đóng gói xong, sẵn sàng giao', data: updatedOrder });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

async function checkAndCompleteTrip(tripId: number | null) {
  if (!tripId) return;
  const remainingDelivering = await prisma.order.count({
    where: {
      tripId,
      status: OrderStatus.DELIVERING,
    },
  });
  if (remainingDelivering === 0) {
    const completedTrip = await prisma.trip.update({
      where: { id: tripId },
      data: { status: 'COMPLETED' },
      select: { driverId: true },
    });

    if (completedTrip.driverId) {
      const otherActiveTrips = await prisma.trip.count({
        where: {
          driverId: completedTrip.driverId,
          status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
        },
      });
      if (otherActiveTrips === 0) {
        await prisma.driverProfile.updateMany({
          where: {
            userId: completedTrip.driverId,
            isActive: true,
          },
          data: { status: DriverStatus.AVAILABLE },
        });
      }
    }
  } else {
    await prisma.trip.update({
      where: { id: tripId },
      data: { status: 'IN_TRANSIT' },
    });
  }
}

export const completeDelivery = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updatedOrder = await prisma.order.update({
      where: { id: Number(id) },
      data: { status: OrderStatus.COMPLETED },
      include: { items: true, store: true, trip: true },
    });

    await checkAndCompleteTrip(updatedOrder.tripId);

    res.json({ success: true, message: 'Giao hàng thành công!', data: updatedOrder });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const failDelivery = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updatedOrder = await prisma.order.update({
      where: { id: Number(id) },
      data: { status: OrderStatus.FAILED },
      include: { items: true, store: true, trip: true },
    });

    await checkAndCompleteTrip(updatedOrder.tripId);

    res.json({ success: true, message: 'Đã ghi nhận giao hàng thất bại!', data: updatedOrder });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

async function cleanupTripAfterOrderRemoval(
  tx: Prisma.TransactionClient,
  tripId: number
) {
  const trip = await tx.trip.findUnique({
    where: { id: tripId },
    select: { id: true, driverId: true },
  });
  if (!trip) return;

  const remainingOrders = await tx.order.findMany({
    where: { tripId },
    orderBy: [{ deliverySequence: 'asc' }, { id: 'asc' }],
    select: { id: true, status: true },
  });

  if (remainingOrders.length === 0) {
    await tx.trip.delete({ where: { id: tripId } });
  } else {
    for (let index = 0; index < remainingOrders.length; index++) {
      await tx.order.update({
        where: { id: remainingOrders[index].id },
        data: { deliverySequence: index + 1 },
      });
    }

    const hasDeliveringOrders = remainingOrders.some(
      (o) => o.status === OrderStatus.DELIVERING
    );
    await tx.trip.update({
      where: { id: tripId },
      data: {
        totalDistance: null,
        ...(hasDeliveringOrders ? {} : { status: 'COMPLETED' }),
      },
    });
  }

  if (trip.driverId) {
    const otherActiveTrips = await tx.trip.count({
      where: {
        driverId: trip.driverId,
        status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
      },
    });
    if (otherActiveTrips === 0) {
      await tx.driverProfile.updateMany({
        where: {
          userId: trip.driverId,
          isActive: true,
        },
        data: { status: DriverStatus.AVAILABLE },
      });
    }
  }
}

export const assignDriverToOrder = async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ success: false, message: 'ID đơn hàng không hợp lệ.' });
    }

    const rawDriverId = req.body?.driverId;
    const isUnassign = rawDriverId === null || rawDriverId === undefined || rawDriverId === '';
    const parsedDriverId = isUnassign ? null : Number(rawDriverId);

    if (!isUnassign && (!Number.isInteger(parsedDriverId) || (parsedDriverId ?? 0) <= 0)) {
      return res.status(400).json({ success: false, message: 'ID tài xế không hợp lệ.' });
    }

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_WITH_RELATIONS_INCLUDE,
    });
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    }

    if (isUnassign) {
      if (existingOrder.status !== OrderStatus.DELIVERING) {
        return res.status(400).json({
          success: false,
          message: `Chỉ có thể bỏ gán tài xế cho đơn hàng đang ở trạng thái DELIVERING (hiện tại: ${existingOrder.status}).`,
        });
      }

      const oldTripId = existingOrder.tripId;
      const updatedOrder = await prisma.$transaction(async (tx) => {
        const order = await tx.order.update({
          where: { id: orderId },
          data: {
            tripId: null,
            deliverySequence: null,
            status: OrderStatus.PACKED,
          },
          include: ORDER_WITH_RELATIONS_INCLUDE,
        });

        if (oldTripId) {
          await cleanupTripAfterOrderRemoval(tx, oldTripId);
        }

        return order;
      });

      return res.json({
        success: true,
        message: `Đã bỏ gán tài xế cho đơn ${updatedOrder.orderCode} và đưa về trạng thái PACKED.`,
        data: updatedOrder,
      });
    }

    if (!ASSIGNABLE_ORDER_STATUSES.includes(existingOrder.status)) {
      return res.status(400).json({
        success: false,
        message: `Không thể gán tài xế cho đơn hàng ở trạng thái ${existingOrder.status}. Chỉ hỗ trợ đơn ở trạng thái PACKED, DELIVERING hoặc FAILED.`,
      });
    }

    const targetDriver = await prisma.user.findFirst({
      where: { id: parsedDriverId!, role: Role.DRIVER },
      include: { driverProfile: true },
    });
    if (!targetDriver) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế được chọn.' });
    }
    if (targetDriver.driverProfile && !targetDriver.driverProfile.isActive) {
      return res.status(400).json({
        success: false,
        message: `Tài xế "${targetDriver.name}" hiện đang ngừng hoạt động.`,
      });
    }
    if (
      targetDriver.driverProfile &&
      targetDriver.driverProfile.status === DriverStatus.OFFLINE
    ) {
      return res.status(400).json({
        success: false,
        message: `Tài xế "${targetDriver.name}" đang ngoại tuyến (OFFLINE), không thể gán đơn hàng.`,
      });
    }

    if (
      existingOrder.status === OrderStatus.DELIVERING &&
      existingOrder.trip?.driverId === targetDriver.id
    ) {
      return res.json({
        success: true,
        message: `Đơn hàng ${existingOrder.orderCode} hiện đã được gán cho tài xế ${targetDriver.name}.`,
        data: existingOrder,
      });
    }

    const oldTripId = existingOrder.tripId;
    const isReassign = existingOrder.status === OrderStatus.DELIVERING && oldTripId !== null;
    const isRetry = existingOrder.status === OrderStatus.FAILED;

    const updatedOrder = await prisma.$transaction(async (tx) => {
      let targetTrip = await tx.trip.findFirst({
        where: {
          driverId: targetDriver.id,
          status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      const retryingSameActiveTrip =
        isRetry && targetTrip !== null && oldTripId === targetTrip.id;

      let nextSequence = existingOrder.deliverySequence ?? 1;
      let resolvedTripId: number;

      if (retryingSameActiveTrip && targetTrip) {
        resolvedTripId = targetTrip.id;
      } else if (targetTrip) {
        const maxSeqAgg = await tx.order.aggregate({
          where: { tripId: targetTrip.id },
          _max: { deliverySequence: true },
        });
        nextSequence = (maxSeqAgg._max.deliverySequence ?? 0) + 1;

        await tx.trip.update({
          where: { id: targetTrip.id },
          data: { totalDistance: null },
        });
        resolvedTripId = targetTrip.id;
      } else {
        const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 10)}`;
        const createdTrip = await tx.trip.create({
          data: {
            tripCode: `TRIP-${suffix}`,
            storeId: existingOrder.storeId,
            driverId: targetDriver.id,
            status: 'ASSIGNED',
            totalDistance: null,
          },
        });
        nextSequence = 1;
        resolvedTripId = createdTrip.id;
      }

      const order = await tx.order.update({
        where: { id: orderId },
        data: {
          tripId: resolvedTripId,
          deliverySequence: nextSequence,
          status: OrderStatus.DELIVERING,
        },
        include: ORDER_WITH_RELATIONS_INCLUDE,
      });

      if (oldTripId && oldTripId !== resolvedTripId) {
        await cleanupTripAfterOrderRemoval(tx, oldTripId);
      }

      await tx.driverProfile.updateMany({
        where: { userId: targetDriver.id },
        data: { status: DriverStatus.ON_DELIVERY },
      });

      return order;
    });

    const actionText = isRetry
      ? `Đã gán lại tài xế ${targetDriver.name} giao lại đơn ${updatedOrder.orderCode}!`
      : isReassign
        ? `Đã đổi tài xế đơn ${updatedOrder.orderCode} sang ${targetDriver.name}!`
        : `Đã gán tài xế ${targetDriver.name} cho đơn ${updatedOrder.orderCode}!`;

    return res.json({
      success: true,
      message: actionText,
      data: updatedOrder,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
