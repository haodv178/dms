import { Request, Response } from 'express';
import { DriverStatus, OrderStatus, Prisma, Role } from '@prisma/client';
import prisma from '../lib/prisma';
import { checkDeliveryRadius, MAX_DELIVERY_DISTANCE_KM } from '../lib/geo';
import {
  InsufficientStockError,
  deductDepotStock,
  restoreDepotStock,
} from '../lib/inventory';

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
      storeId,
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

    const parsedLat = Number(latitude);
    const parsedLng = Number(longitude);
    if (
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

    // Resolve target departure point (Store)
    const targetStore = storeId
      ? await prisma.store.findUnique({ where: { id: Number(storeId) } })
      : await prisma.store.findFirst({
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
        });

    if (!targetStore) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy điểm xuất phát được chọn.',
      });
    }

    if (!targetStore.isActive) {
      return res.status(400).json({
        success: false,
        message: `Điểm xuất phát "${targetStore.name}" hiện đang ngừng hoạt động.`,
      });
    }

    const radiusCheck = checkDeliveryRadius(
      targetStore.latitude,
      targetStore.longitude,
      parsedLat,
      parsedLng
    );
    if (!radiusCheck.ok) {
      return res.status(400).json({
        success: false,
        message: `Điểm giao hàng cách điểm xuất phát "${targetStore.name}" ${radiusCheck.distanceKm.toFixed(
          2
        )} km, vượt quá bán kính giao hàng tối đa ${MAX_DELIVERY_DISTANCE_KM} km!`,
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

    const newOrder = await prisma.$transaction(async (tx) => {
      await deductDepotStock(tx, targetStore.id, targetStore.name, normalizedItems);

      return tx.order.create({
        data: {
          orderCode: orderCode || `ORD-${Math.floor(100 + Math.random() * 900)}-${Date.now().toString().slice(-3)}`,
          storeId: targetStore.id,
          customerName: String(customerName).trim(),
          customerPhone: (customerPhone || '0900000000').trim(),
          customerAddress: String(customerAddress).trim(),
          latitude: parsedLat,
          longitude: parsedLng,
          totalAmount: computedTotal,
          status: OrderStatus.NEW,
          items: {
            create: normalizedItems,
          },
        },
        include: ORDER_WITH_RELATIONS_INCLUDE,
      });
    });

    res.status(201).json({
      success: true,
      message: 'Tạo đơn hàng mới thành công!',
      data: newOrder,
    });
  } catch (error: any) {
    if (error instanceof InsufficientStockError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        details: error.details,
      });
    }
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
      storeId,
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

    const targetStoreId = storeId ? Number(storeId) : existingOrder.storeId;
    const targetStore = await prisma.store.findUnique({ where: { id: targetStoreId } });
    if (!targetStore) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy điểm xuất phát được chọn.',
      });
    }
    if (targetStoreId !== existingOrder.storeId && !targetStore.isActive) {
      return res.status(400).json({
        success: false,
        message: `Điểm xuất phát "${targetStore.name}" hiện đang ngừng hoạt động.`,
      });
    }

    const radiusCheck = checkDeliveryRadius(
      targetStore.latitude,
      targetStore.longitude,
      parsedLat,
      parsedLng
    );
    if (!radiusCheck.ok) {
      return res.status(400).json({
        success: false,
        message: `Điểm giao hàng cách điểm xuất phát "${targetStore.name}" ${radiusCheck.distanceKm.toFixed(
          2
        )} km, vượt quá bán kính giao hàng tối đa ${MAX_DELIVERY_DISTANCE_KM} km!`,
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

    const updatedOrder = await prisma.$transaction(async (tx) => {
      // Restore old items back to the original depot, then deduct new items from the target depot
      await restoreDepotStock(tx, existingOrder.storeId, existingOrder.items);
      await deductDepotStock(tx, targetStore.id, targetStore.name, normalizedItems);

      return tx.order.update({
        where: { id },
        data: {
          storeId: targetStore.id,
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
        include: ORDER_WITH_RELATIONS_INCLUDE,
      });
    });

    res.json({
      success: true,
      message: `Đã cập nhật đơn hàng ${updatedOrder.orderCode} thành công!`,
      data: updatedOrder,
    });
  } catch (error: any) {
    if (error instanceof InsufficientStockError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        details: error.details,
      });
    }
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

async function checkAndCompleteTrip(
  tripId: number | null,
  db: Prisma.TransactionClient | typeof prisma = prisma
) {
  if (!tripId) return;
  const remainingDelivering = await db.order.count({
    where: {
      tripId,
      status: OrderStatus.DELIVERING,
    },
  });
  if (remainingDelivering === 0) {
    const completedTrip = await db.trip.update({
      where: { id: tripId },
      data: { status: 'COMPLETED' },
      select: { driverId: true },
    });

    if (completedTrip.driverId) {
      const otherActiveTrips = await db.trip.count({
        where: {
          driverId: completedTrip.driverId,
          status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
        },
      });
      if (otherActiveTrips === 0) {
        await db.driverProfile.updateMany({
          where: {
            userId: completedTrip.driverId,
            isActive: true,
          },
          data: { status: DriverStatus.AVAILABLE },
        });
      }
    }
  } else {
    await db.trip.update({
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
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ success: false, message: 'ID đơn hàng không hợp lệ.' });
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!existing) {
        return null;
      }

      if (existing.status !== OrderStatus.FAILED) {
        await restoreDepotStock(tx, existing.storeId, existing.items);
      }

      const order = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.FAILED },
        include: { items: true, store: true, trip: true },
      });

      await checkAndCompleteTrip(order.tripId, tx);
      return order;
    });

    if (!updatedOrder) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    }

    res.json({
      success: true,
      message: 'Đã ghi nhận giao hàng thất bại và hoàn tồn kho về depot!',
      data: updatedOrder,
    });
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
      if (isRetry) {
        await deductDepotStock(
          tx,
          existingOrder.storeId,
          existingOrder.store.name,
          existingOrder.items
        );
      }

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
    if (error instanceof InsufficientStockError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        details: error.details,
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

type BulkOrderActionType =
  | 'START_PICKING'
  | 'COMPLETE_PACKING'
  | 'ASSIGN_DRIVER'
  | 'UNASSIGN_DRIVER'
  | 'COMPLETE_DELIVERY'
  | 'FAIL_DELIVERY';

const VALID_BULK_ACTIONS: readonly BulkOrderActionType[] = [
  'START_PICKING',
  'COMPLETE_PACKING',
  'ASSIGN_DRIVER',
  'UNASSIGN_DRIVER',
  'COMPLETE_DELIVERY',
  'FAIL_DELIVERY',
];

interface BulkSkippedOrder {
  id: number;
  orderCode: string | null;
  reason: string;
}

export const bulkOrderAction = async (req: Request, res: Response) => {
  try {
    const rawAction = req.body?.action;
    const rawOrderIds = req.body?.orderIds;
    const rawDriverId = req.body?.driverId;

    if (
      typeof rawAction !== 'string' ||
      !VALID_BULK_ACTIONS.includes(rawAction as BulkOrderActionType)
    ) {
      return res.status(400).json({
        success: false,
        message: `Thao tác hàng loạt không hợp lệ. Hỗ trợ: ${VALID_BULK_ACTIONS.join(', ')}.`,
      });
    }
    const action = rawAction as BulkOrderActionType;

    if (!Array.isArray(rawOrderIds) || rawOrderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn ít nhất 1 đơn hàng để thực hiện thao tác hàng loạt.',
      });
    }

    const uniqueOrderIds = Array.from(
      new Set(
        rawOrderIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )
    );

    if (uniqueOrderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Danh sách ID đơn hàng không hợp lệ.',
      });
    }

    let targetDriver: {
      id: number;
      name: string;
      driverProfile: { isActive: boolean; status: DriverStatus } | null;
    } | null = null;

    if (action === 'ASSIGN_DRIVER') {
      const parsedDriverId = Number(rawDriverId);
      if (!Number.isInteger(parsedDriverId) || parsedDriverId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng chọn tài xế hợp lệ để gán hàng loạt.',
        });
      }

      targetDriver = await prisma.user.findFirst({
        where: { id: parsedDriverId, role: Role.DRIVER },
        select: {
          id: true,
          name: true,
          driverProfile: {
            select: {
              isActive: true,
              status: true,
            },
          },
        },
      });

      if (!targetDriver) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy tài xế được chọn.',
        });
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
    }

    const foundOrders = await prisma.order.findMany({
      where: { id: { in: uniqueOrderIds } },
      include: ORDER_WITH_RELATIONS_INCLUDE,
    });
    const orderById = new Map(foundOrders.map((o) => [o.id, o]));

    const eligibleOrders: typeof foundOrders = [];
    const skipped: BulkSkippedOrder[] = [];

    for (const id of uniqueOrderIds) {
      const order = orderById.get(id);
      if (!order) {
        skipped.push({
          id,
          orderCode: null,
          reason: 'Không tìm thấy đơn hàng',
        });
        continue;
      }

      switch (action) {
        case 'START_PICKING':
          if (order.status === OrderStatus.NEW) {
            eligibleOrders.push(order);
          } else {
            skipped.push({
              id: order.id,
              orderCode: order.orderCode,
              reason: `Trạng thái hiện tại là ${order.status} (chỉ hỗ trợ NEW)`,
            });
          }
          break;

        case 'COMPLETE_PACKING':
          if (order.status === OrderStatus.PICKING) {
            eligibleOrders.push(order);
          } else {
            skipped.push({
              id: order.id,
              orderCode: order.orderCode,
              reason: `Trạng thái hiện tại là ${order.status} (chỉ hỗ trợ PICKING)`,
            });
          }
          break;

        case 'ASSIGN_DRIVER':
          if (!ASSIGNABLE_ORDER_STATUSES.includes(order.status)) {
            skipped.push({
              id: order.id,
              orderCode: order.orderCode,
              reason: `Trạng thái hiện tại là ${order.status} (chỉ hỗ trợ PACKED, DELIVERING, FAILED)`,
            });
          } else if (
            order.status === OrderStatus.DELIVERING &&
            order.trip?.driverId === targetDriver!.id
          ) {
            skipped.push({
              id: order.id,
              orderCode: order.orderCode,
              reason: `Đã được gán cho tài xế ${targetDriver!.name}`,
            });
          } else {
            eligibleOrders.push(order);
          }
          break;

        case 'UNASSIGN_DRIVER':
          if (order.status === OrderStatus.DELIVERING) {
            eligibleOrders.push(order);
          } else {
            skipped.push({
              id: order.id,
              orderCode: order.orderCode,
              reason: `Trạng thái hiện tại là ${order.status} (chỉ hỗ trợ DELIVERING)`,
            });
          }
          break;

        case 'COMPLETE_DELIVERY':
        case 'FAIL_DELIVERY':
          if (order.status === OrderStatus.DELIVERING) {
            eligibleOrders.push(order);
          } else {
            skipped.push({
              id: order.id,
              orderCode: order.orderCode,
              reason: `Trạng thái hiện tại là ${order.status} (chỉ hỗ trợ DELIVERING)`,
            });
          }
          break;
      }
    }

    if (eligibleOrders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có đơn hàng nào đủ điều kiện để thực hiện thao tác này.',
        data: {
          updatedCount: 0,
          updatedOrders: [],
          skipped,
        },
      });
    }

    const eligibleIds = eligibleOrders.map((o) => o.id);

    const updatedOrders = await prisma.$transaction(async (tx) => {
      if (action === 'START_PICKING') {
        await tx.order.updateMany({
          where: { id: { in: eligibleIds } },
          data: { status: OrderStatus.PICKING },
        });
      } else if (action === 'COMPLETE_PACKING') {
        await tx.order.updateMany({
          where: { id: { in: eligibleIds } },
          data: { status: OrderStatus.PACKED },
        });
      } else if (action === 'COMPLETE_DELIVERY' || action === 'FAIL_DELIVERY') {
        const nextStatus =
          action === 'COMPLETE_DELIVERY' ? OrderStatus.COMPLETED : OrderStatus.FAILED;
        if (action === 'FAIL_DELIVERY') {
          for (const order of eligibleOrders) {
            await restoreDepotStock(tx, order.storeId, order.items);
          }
        }
        await tx.order.updateMany({
          where: { id: { in: eligibleIds } },
          data: { status: nextStatus },
        });

        const affectedTripIds = Array.from(
          new Set(
            eligibleOrders
              .map((o) => o.tripId)
              .filter((tripId): tripId is number => tripId !== null)
          )
        );
        for (const tripId of affectedTripIds) {
          await checkAndCompleteTrip(tripId, tx);
        }
      } else if (action === 'UNASSIGN_DRIVER') {
        const oldTripIds = Array.from(
          new Set(
            eligibleOrders
              .map((o) => o.tripId)
              .filter((tripId): tripId is number => tripId !== null)
          )
        );

        await tx.order.updateMany({
          where: { id: { in: eligibleIds } },
          data: {
            tripId: null,
            deliverySequence: null,
            status: OrderStatus.PACKED,
          },
        });

        for (const oldTripId of oldTripIds) {
          await cleanupTripAfterOrderRemoval(tx, oldTripId);
        }
      } else if (action === 'ASSIGN_DRIVER' && targetDriver) {
        let targetTrip = await tx.trip.findFirst({
          where: {
            driverId: targetDriver.id,
            status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
          },
          orderBy: { createdAt: 'desc' },
        });

        let nextSequence = 0;
        let resolvedTripId: number;

        if (targetTrip) {
          const maxSeqAgg = await tx.order.aggregate({
            where: { tripId: targetTrip.id },
            _max: { deliverySequence: true },
          });
          nextSequence = maxSeqAgg._max.deliverySequence ?? 0;

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
              storeId: eligibleOrders[0].storeId,
              driverId: targetDriver.id,
              status: 'ASSIGNED',
              totalDistance: null,
            },
          });
          resolvedTripId = createdTrip.id;
        }

        const oldTripIdsToCleanup = new Set<number>();

        for (const order of eligibleOrders) {
          if (order.status === OrderStatus.FAILED) {
            await deductDepotStock(tx, order.storeId, order.store.name, order.items);
          }
          const isRetrySameTrip =
            order.status === OrderStatus.FAILED &&
            order.tripId === resolvedTripId;

          if (isRetrySameTrip) {
            const seq = order.deliverySequence ?? ++nextSequence;
            await tx.order.update({
              where: { id: order.id },
              data: {
                status: OrderStatus.DELIVERING,
                deliverySequence: seq,
              },
            });
          } else {
            nextSequence += 1;
            await tx.order.update({
              where: { id: order.id },
              data: {
                tripId: resolvedTripId,
                deliverySequence: nextSequence,
                status: OrderStatus.DELIVERING,
              },
            });
            if (order.tripId && order.tripId !== resolvedTripId) {
              oldTripIdsToCleanup.add(order.tripId);
            }
          }
        }

        for (const oldTripId of oldTripIdsToCleanup) {
          await cleanupTripAfterOrderRemoval(tx, oldTripId);
        }

        await tx.driverProfile.updateMany({
          where: { userId: targetDriver.id },
          data: { status: DriverStatus.ON_DELIVERY },
        });
      }

      return tx.order.findMany({
        where: { id: { in: eligibleIds } },
        include: ORDER_WITH_RELATIONS_INCLUDE,
      });
    });

    const skippedSuffix =
      skipped.length > 0 ? ` (bỏ qua ${skipped.length} đơn không đủ điều kiện)` : '';

    const actionMessageMap: Record<BulkOrderActionType, string> = {
      START_PICKING: `Đã chuyển ${updatedOrders.length} đơn sang Đang nhặt (PICKING)${skippedSuffix}.`,
      COMPLETE_PACKING: `Đã đóng gói xong ${updatedOrders.length} đơn (PACKED)${skippedSuffix}.`,
      ASSIGN_DRIVER: `Đã gán tài xế ${targetDriver?.name ?? ''} cho ${updatedOrders.length} đơn hàng${skippedSuffix}.`,
      UNASSIGN_DRIVER: `Đã bỏ gán tài xế cho ${updatedOrders.length} đơn và đưa về trạng thái PACKED${skippedSuffix}.`,
      COMPLETE_DELIVERY: `Đã xác nhận giao thành công ${updatedOrders.length} đơn hàng${skippedSuffix}.`,
      FAIL_DELIVERY: `Đã đánh dấu giao thất bại ${updatedOrders.length} đơn hàng${skippedSuffix}.`,
    };

    return res.json({
      success: true,
      message: actionMessageMap[action],
      data: {
        updatedCount: updatedOrders.length,
        updatedOrders,
        skipped,
      },
    });
  } catch (error: any) {
    if (error instanceof InsufficientStockError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        details: error.details,
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};
