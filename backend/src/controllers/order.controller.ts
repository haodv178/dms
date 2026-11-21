import { Request, Response } from 'express';
import { DriverStatus, OrderStatus } from '@prisma/client';
import prisma from '../lib/prisma';

const EDITABLE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.PICKING,
  OrderStatus.PACKED,
];

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
      include: {
        items: true,
        store: true,
        trip: {
          include: { driver: { select: { id: true, name: true, email: true, role: true } } },
        },
      },
      orderBy: [{ deliverySequence: 'asc' }, { id: 'asc' }],
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
