import { Request, Response } from 'express';
import { OrderStatus } from '@prisma/client';
import prisma from '../lib/prisma';

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
      totalAmount,
      items = [],
    } = req.body;

    if (!customerName || !customerAddress || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ tên khách hàng, địa chỉ và tọa độ GPS (latitude, longitude).',
      });
    }

    const computedItems =
      Array.isArray(items) && items.length > 0
        ? items
        : [{ productName: 'Combo Thực phẩm Thiết yếu Lotte Mart', quantity: 1, price: Number(totalAmount || 200000) }];

    const computedTotal =
      totalAmount !== undefined
        ? Number(totalAmount)
        : computedItems.reduce((sum: number, item: any) => sum + Number(item.price) * Number(item.quantity), 0);

    const newOrder = await prisma.order.create({
      data: {
        orderCode: orderCode || `ORD-${Math.floor(100 + Math.random() * 900)}-${Date.now().toString().slice(-3)}`,
        storeId: Number(storeId),
        customerName,
        customerPhone: customerPhone || '0900000000',
        customerAddress,
        latitude: Number(latitude),
        longitude: Number(longitude),
        totalAmount: computedTotal,
        status: OrderStatus.NEW,
        items: {
          create: computedItems.map((it: any) => ({
            productName: it.productName,
            quantity: Number(it.quantity),
            price: Number(it.price),
          })),
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
    await prisma.trip.update({
      where: { id: tripId },
      data: { status: 'COMPLETED' },
    });
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
