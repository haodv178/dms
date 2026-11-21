import { Request, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../lib/prisma';
import { LOW_STOCK_THRESHOLD } from '../lib/inventory';

type StoreWithCounts = Prisma.StoreGetPayload<{
  include: { _count: { select: { orders: true; trips: true } } };
}>;

interface StoreInventoryMetrics {
  totalStock: number;
  inStockSkuCount: number;
  lowStockSkuCount: number;
}

function serializeStore(
  store: StoreWithCounts,
  inventory: StoreInventoryMetrics = {
    totalStock: 0,
    inStockSkuCount: 0,
    lowStockSkuCount: 0,
  }
) {
  return {
    id: store.id,
    code: store.code || `DEP-${String(store.id).padStart(3, '0')}`,
    name: store.name,
    address: store.address,
    latitude: store.latitude,
    longitude: store.longitude,
    phone: store.phone || '',
    isDefault: store.isDefault,
    isActive: store.isActive,
    notes: store.notes || '',
    ordersCount: store._count.orders,
    tripsCount: store._count.trips,
    totalStock: inventory.totalStock,
    inStockSkuCount: inventory.inStockSkuCount,
    lowStockSkuCount: inventory.lowStockSkuCount,
    createdAt: store.createdAt,
    updatedAt: store.updatedAt,
  };
}

async function computeInventoryMetricsForStores(
  storeIds: number[]
): Promise<Map<number, StoreInventoryMetrics>> {
  const result = new Map<number, StoreInventoryMetrics>();
  if (storeIds.length === 0) return result;

  const [totalProducts, sumRows, inStockRows, aboveLowRows] = await Promise.all([
    prisma.product.count(),
    prisma.depotStock.groupBy({
      by: ['storeId'],
      where: { storeId: { in: storeIds } },
      _sum: { quantity: true },
    }),
    prisma.depotStock.groupBy({
      by: ['storeId'],
      where: { storeId: { in: storeIds }, quantity: { gt: 0 } },
      _count: { _all: true },
    }),
    prisma.depotStock.groupBy({
      by: ['storeId'],
      where: { storeId: { in: storeIds }, quantity: { gt: LOW_STOCK_THRESHOLD } },
      _count: { _all: true },
    }),
  ]);

  const sumByStore = new Map(sumRows.map((r) => [r.storeId, r._sum.quantity ?? 0]));
  const inStockByStore = new Map(inStockRows.map((r) => [r.storeId, r._count._all]));
  const aboveLowByStore = new Map(aboveLowRows.map((r) => [r.storeId, r._count._all]));

  for (const storeId of storeIds) {
    result.set(storeId, {
      totalStock: sumByStore.get(storeId) ?? 0,
      inStockSkuCount: inStockByStore.get(storeId) ?? 0,
      lowStockSkuCount: Math.max(0, totalProducts - (aboveLowByStore.get(storeId) ?? 0)),
    });
  }

  return result;
}

function validateCoordinates(
  latitude: unknown,
  longitude: unknown
): { lat: number; lng: number } | { error: string } {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (
    latitude === undefined ||
    latitude === null ||
    latitude === '' ||
    longitude === undefined ||
    longitude === null ||
    longitude === '' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return { error: 'Tọa độ GPS (latitude, longitude) không hợp lệ.' };
  }
  return { lat, lng };
}

async function generateNextStoreCode(client: PrismaClient | Prisma.TransactionClient): Promise<string> {
  const existing = await client.store.findMany({
    select: { code: true, id: true },
    orderBy: { id: 'desc' },
  });
  let maxNum = existing.length;
  for (const s of existing) {
    if (s.code) {
      const m = /^DEP-(\d+)$/i.exec(s.code.trim());
      if (m) {
        const num = Number(m[1]);
        if (Number.isFinite(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  let candidateNum = maxNum + 1;
  const existingSet = new Set(
    existing.map((s) => (s.code ? s.code.trim().toUpperCase() : '')).filter(Boolean)
  );
  while (existingSet.has(`DEP-${String(candidateNum).padStart(3, '0')}`)) {
    candidateNum++;
  }
  return `DEP-${String(candidateNum).padStart(3, '0')}`;
}

export async function ensureStoreDefaults(client: PrismaClient) {
  const stores = await client.store.findMany({ orderBy: { id: 'asc' } });
  if (stores.length === 0) return;

  for (const s of stores) {
    if (!s.code) {
      const fallbackCode = `DEP-${String(s.id).padStart(3, '0')}`;
      try {
        await client.store.update({
          where: { id: s.id },
          data: { code: fallbackCode },
        });
      } catch {
        const nextCode = await generateNextStoreCode(client);
        await client.store.update({
          where: { id: s.id },
          data: { code: nextCode },
        });
      }
    }
  }

  const hasDefault = stores.some((s) => s.isDefault);
  if (!hasDefault) {
    const firstActive = stores.find((s) => s.isActive) ?? stores[0];
    await client.store.update({
      where: { id: firstActive.id },
      data: { isDefault: true, isActive: true },
    });
  }
}

export const getStores = async (req: Request, res: Response) => {
  try {
    const {
      search = '',
      status = 'ALL',
      activeOnly,
      page: rawPage = '1',
      limit: rawLimit = '20',
    } = req.query;

    const searchStr = typeof search === 'string' ? search.trim() : '';
    const statusStr = typeof status === 'string' ? status.trim().toUpperCase() : 'ALL';
    const isActiveOnly = activeOnly === 'true' || activeOnly === '1';

    const where: Prisma.StoreWhereInput = {};
    if (isActiveOnly || statusStr === 'ACTIVE') {
      where.isActive = true;
    } else if (statusStr === 'INACTIVE') {
      where.isActive = false;
    }

    if (searchStr) {
      where.OR = [
        { code: { contains: searchStr, mode: 'insensitive' } },
        { name: { contains: searchStr, mode: 'insensitive' } },
        { address: { contains: searchStr, mode: 'insensitive' } },
        { phone: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    const parsedLimit = Math.min(Math.max(Number(rawLimit) || 20, 1), 100);
    const total = await prisma.store.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / parsedLimit));
    const parsedPage = Math.min(Math.max(Number(rawPage) || 1, 1), totalPages);
    const skip = (parsedPage - 1) * parsedLimit;

    const [stores, allSummaryStores, totalOrders, totalTrips] = await Promise.all([
      prisma.store.findMany({
        where,
        include: {
          _count: {
            select: { orders: true, trips: true },
          },
        },
        orderBy: [{ isDefault: 'desc' }, { isActive: 'desc' }, { id: 'asc' }],
        skip,
        take: parsedLimit,
      }),
      prisma.store.findMany({
        select: { id: true, name: true, isActive: true, isDefault: true },
        orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
      }),
      prisma.order.count(),
      prisma.trip.count(),
    ]);

    const inventoryByStore = await computeInventoryMetricsForStores(
      stores.map((s) => s.id)
    );

    const defaultStore =
      allSummaryStores.find((s) => s.isDefault) ?? allSummaryStores[0] ?? null;

    res.json({
      success: true,
      data: stores.map((s) => serializeStore(s, inventoryByStore.get(s.id))),
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages,
      },
      summary: {
        totalStores: allSummaryStores.length,
        activeStores: allSummaryStores.filter((s) => s.isActive).length,
        inactiveStores: allSummaryStores.filter((s) => !s.isActive).length,
        defaultStoreId: defaultStore?.id ?? null,
        defaultStoreName: defaultStore?.name ?? 'Chưa thiết lập',
        totalOrders,
        totalTrips,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getStoreById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID điểm xuất phát không hợp lệ.' });
    }

    const store = await prisma.store.findUnique({
      where: { id },
      include: { _count: { select: { orders: true, trips: true } } },
    });

    if (!store) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy điểm xuất phát.' });
    }

    const metrics = await computeInventoryMetricsForStores([store.id]);
    res.json({ success: true, data: serializeStore(store, metrics.get(store.id)) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createStore = async (req: Request, res: Response) => {
  try {
    const {
      code,
      name,
      address,
      latitude,
      longitude,
      phone = '',
      isDefault = false,
      isActive = true,
      notes = '',
    } = req.body;

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedAddress = typeof address === 'string' ? address.trim() : '';
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    const trimmedNotes = typeof notes === 'string' ? notes.trim() : '';
    const trimmedCode = typeof code === 'string' ? code.trim().toUpperCase() : '';

    if (!trimmedName || !trimmedAddress) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ tên và địa chỉ điểm xuất phát.',
      });
    }

    const coords = validateCoordinates(latitude, longitude);
    if ('error' in coords) {
      return res.status(400).json({ success: false, message: coords.error });
    }

    if (trimmedCode) {
      const dup = await prisma.store.findUnique({ where: { code: trimmedCode } });
      if (dup) {
        return res.status(400).json({
          success: false,
          message: `Mã kho "${trimmedCode}" đã tồn tại. Vui lòng chọn mã khác.`,
        });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.store.count();
      const shouldBeDefault = Boolean(isDefault) || existingCount === 0;
      const effectiveActive = shouldBeDefault ? true : Boolean(isActive);

      if (shouldBeDefault) {
        await tx.store.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      const finalCode = trimmedCode || (await generateNextStoreCode(tx));

      return tx.store.create({
        data: {
          code: finalCode,
          name: trimmedName,
          address: trimmedAddress,
          latitude: coords.lat,
          longitude: coords.lng,
          phone: trimmedPhone,
          isDefault: shouldBeDefault,
          isActive: effectiveActive,
          notes: trimmedNotes || null,
        },
        include: {
          _count: { select: { orders: true, trips: true } },
        },
      });
    });

    res.status(201).json({
      success: true,
      message: `Đã thêm điểm xuất phát "${created.name}" thành công!`,
      data: serializeStore(created),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateStore = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID điểm xuất phát không hợp lệ.' });
    }

    const existing = await prisma.store.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy điểm xuất phát.' });
    }

    const {
      code,
      name,
      address,
      latitude,
      longitude,
      phone,
      isDefault,
      isActive,
      notes,
    } = req.body;

    const trimmedName = typeof name === 'string' ? name.trim() : existing.name;
    const trimmedAddress = typeof address === 'string' ? address.trim() : existing.address;
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : existing.phone;
    const trimmedNotes =
      notes !== undefined ? (typeof notes === 'string' ? notes.trim() : '') : existing.notes || '';
    const trimmedCode =
      code !== undefined && typeof code === 'string'
        ? code.trim().toUpperCase()
        : existing.code || '';

    if (!trimmedName || !trimmedAddress) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ tên và địa chỉ điểm xuất phát.',
      });
    }

    const coords = validateCoordinates(
      latitude !== undefined ? latitude : existing.latitude,
      longitude !== undefined ? longitude : existing.longitude
    );
    if ('error' in coords) {
      return res.status(400).json({ success: false, message: coords.error });
    }

    const nextIsDefault = isDefault !== undefined ? Boolean(isDefault) : existing.isDefault;
    const nextIsActive = isActive !== undefined ? Boolean(isActive) : existing.isActive;

    if (existing.isDefault && !nextIsDefault) {
      return res.status(400).json({
        success: false,
        message:
          'Hệ thống cần ít nhất 1 điểm xuất phát mặc định. Hãy đặt một điểm khác làm mặc định thay vì bỏ chọn.',
      });
    }

    if (nextIsDefault && !nextIsActive) {
      return res.status(400).json({
        success: false,
        message:
          'Không thể ngừng hoạt động điểm xuất phát mặc định. Hãy chuyển mặc định sang điểm khác trước.',
      });
    }

    if (trimmedCode && trimmedCode !== existing.code) {
      const dup = await prisma.store.findFirst({
        where: { code: trimmedCode, NOT: { id } },
      });
      if (dup) {
        return res.status(400).json({
          success: false,
          message: `Mã kho "${trimmedCode}" đã tồn tại. Vui lòng chọn mã khác.`,
        });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (nextIsDefault && !existing.isDefault) {
        await tx.store.updateMany({
          where: { isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }

      const finalCode = trimmedCode || existing.code || (await generateNextStoreCode(tx));

      return tx.store.update({
        where: { id },
        data: {
          code: finalCode,
          name: trimmedName,
          address: trimmedAddress,
          latitude: coords.lat,
          longitude: coords.lng,
          phone: trimmedPhone,
          isDefault: nextIsDefault,
          isActive: nextIsDefault ? true : nextIsActive,
          notes: trimmedNotes || null,
        },
        include: {
          _count: { select: { orders: true, trips: true } },
        },
      });
    });

    res.json({
      success: true,
      message: `Đã cập nhật điểm xuất phát "${updated.name}" thành công!`,
      data: serializeStore(updated),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const setDefaultStore = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID điểm xuất phát không hợp lệ.' });
    }

    const existing = await prisma.store.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy điểm xuất phát.' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.store.updateMany({
        where: { isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
      return tx.store.update({
        where: { id },
        data: { isDefault: true, isActive: true },
        include: { _count: { select: { orders: true, trips: true } } },
      });
    });

    res.json({
      success: true,
      message: `Đã đặt "${updated.name}" làm điểm xuất phát mặc định!`,
      data: serializeStore(updated),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteStore = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID điểm xuất phát không hợp lệ.' });
    }

    const existing = await prisma.store.findUnique({
      where: { id },
      include: { _count: { select: { orders: true, trips: true } } },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy điểm xuất phát.' });
    }

    if (existing.isDefault) {
      return res.status(400).json({
        success: false,
        message:
          'Không thể xóa điểm xuất phát mặc định. Hãy đặt một điểm xuất phát khác làm mặc định trước.',
      });
    }

    if (existing._count.orders > 0 || existing._count.trips > 0) {
      return res.status(400).json({
        success: false,
        message: `Không thể xóa điểm xuất phát "${existing.name}" vì đang gắn với ${existing._count.orders} đơn hàng và ${existing._count.trips} chuyến xe. Hãy chuyển sang trạng thái "Ngừng hoạt động" thay vì xóa.`,
      });
    }

    await prisma.store.delete({ where: { id } });

    res.json({
      success: true,
      message: `Đã xóa điểm xuất phát "${existing.name}" thành công!`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getStoreInventory = async (req: Request, res: Response) => {
  try {
    const storeId = Number(req.params.id);
    if (!Number.isInteger(storeId) || storeId <= 0) {
      return res.status(400).json({ success: false, message: 'ID depot không hợp lệ.' });
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, code: true, name: true, isDefault: true, isActive: true },
    });
    if (!store) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy depot.' });
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const stockFilter =
      typeof req.query.stockFilter === 'string'
        ? req.query.stockFilter.trim().toUpperCase()
        : 'ALL';

    const rawPage = Number(req.query.page ?? 1);
    const rawLimit = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(100, Math.max(1, Math.floor(rawLimit)))
      : 20;
    const requestedPage = Number.isFinite(rawPage)
      ? Math.max(1, Math.floor(rawPage))
      : 1;

    const where: Prisma.ProductWhereInput = {};
    if (category && category !== 'ALL') {
      where.category = category;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (stockFilter === 'IN_STOCK') {
      where.depotStocks = { some: { storeId, quantity: { gt: 0 } } };
    } else if (stockFilter === 'OUT_OF_STOCK') {
      where.NOT = { depotStocks: { some: { storeId, quantity: { gt: 0 } } } };
    } else if (stockFilter === 'LOW_STOCK') {
      where.NOT = { depotStocks: { some: { storeId, quantity: { gt: LOW_STOCK_THRESHOLD } } } };
    }

    const [total, totalProducts, stockAgg, inStockSkuCount, aboveLowCount] =
      await Promise.all([
        prisma.product.count({ where }),
        prisma.product.count(),
        prisma.depotStock.aggregate({
          where: { storeId },
          _sum: { quantity: true },
        }),
        prisma.depotStock.count({
          where: { storeId, quantity: { gt: 0 } },
        }),
        prisma.depotStock.count({
          where: { storeId, quantity: { gt: LOW_STOCK_THRESHOLD } },
        }),
      ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(requestedPage, totalPages);

    const products = await prisma.product.findMany({
      where,
      include: {
        depotStocks: {
          where: { storeId },
          select: { quantity: true, updatedAt: true },
        },
      },
      orderBy: [{ id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    });

    res.json({
      success: true,
      store: {
        id: store.id,
        code: store.code || `DEP-${String(store.id).padStart(3, '0')}`,
        name: store.name,
        isDefault: store.isDefault,
        isActive: store.isActive,
      },
      data: products.map((p) => ({
        productId: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        unit: p.unit,
        price: p.price,
        isActive: p.isActive,
        quantity: p.depotStocks[0]?.quantity ?? 0,
        updatedAt: p.depotStocks[0]?.updatedAt ?? p.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      summary: {
        totalProducts,
        inStockSkuCount,
        outOfStockSkuCount: Math.max(0, totalProducts - inStockSkuCount),
        lowStockSkuCount: Math.max(0, totalProducts - aboveLowCount),
        totalStock: stockAgg._sum.quantity ?? 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateStoreInventory = async (req: Request, res: Response) => {
  try {
    const storeId = Number(req.params.id);
    if (!Number.isInteger(storeId) || storeId <= 0) {
      return res.status(400).json({ success: false, message: 'ID depot không hợp lệ.' });
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy depot.' });
    }

    const rawItems = req.body?.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp danh sách sản phẩm cần cập nhật tồn kho.',
      });
    }

    const updates = new Map<number, number>();
    for (const raw of rawItems) {
      const productId = Number((raw as Record<string, unknown>)?.productId);
      const quantity = Number((raw as Record<string, unknown>)?.quantity);
      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ success: false, message: 'ID sản phẩm không hợp lệ.' });
      }
      if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({
          success: false,
          message: 'Số lượng tồn kho phải là số nguyên >= 0.',
        });
      }
      updates.set(productId, quantity);
    }

    const productIds = Array.from(updates.keys());
    const existingProducts = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });
    if (existingProducts.length !== productIds.length) {
      return res.status(404).json({
        success: false,
        message: 'Một hoặc nhiều sản phẩm không tồn tại trong hệ thống.',
      });
    }

    await prisma.$transaction(async (tx) => {
      for (const [productId, quantity] of updates.entries()) {
        await tx.depotStock.upsert({
          where: {
            storeId_productId: {
              storeId,
              productId,
            },
          },
          update: { quantity },
          create: { storeId, productId, quantity },
        });
      }
    });

    res.json({
      success: true,
      message: `Đã cập nhật tồn kho ${updates.size} sản phẩm tại "${store.name}" thành công!`,
      data: {
        storeId,
        updatedCount: updates.size,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
