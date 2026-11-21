import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { LOW_STOCK_THRESHOLD } from '../lib/inventory';

type StoreSummaryRow = {
  id: number;
  code: string | null;
  name: string;
  isDefault: boolean;
  isActive: boolean;
};

type ProductWithDepotStocks = Prisma.ProductGetPayload<{
  include: { depotStocks: true };
}>;

function serializeProduct(
  product: ProductWithDepotStocks,
  stores: StoreSummaryRow[],
  selectedStoreId: number | null
) {
  const qtyByStore = new Map<number, number>();
  for (const row of product.depotStocks) {
    qtyByStore.set(row.storeId, row.quantity);
  }

  const depotStocks = stores.map((store) => ({
    storeId: store.id,
    storeCode: store.code || `DEP-${String(store.id).padStart(3, '0')}`,
    storeName: store.name,
    isDefault: store.isDefault,
    isActive: store.isActive,
    quantity: qtyByStore.get(store.id) ?? 0,
  }));

  const totalStock = depotStocks.reduce((sum, entry) => sum + entry.quantity, 0);
  const stock =
    selectedStoreId !== null ? (qtyByStore.get(selectedStoreId) ?? 0) : totalStock;

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    unit: product.unit,
    price: product.price,
    stock,
    totalStock,
    depotStocks,
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function parseSelectedStoreId(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '' || raw === 'ALL') {
    return null;
  }
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return null;
}

function parseDepotStocksInput(
  rawDepotStocks: unknown,
  rawFallbackStock: unknown,
  stores: StoreSummaryRow[]
): { entries?: Array<{ storeId: number; quantity: number }>; error?: string } {
  const validStoreIds = new Set(stores.map((s) => s.id));

  if (Array.isArray(rawDepotStocks)) {
    const dedup = new Map<number, number>();
    for (const item of rawDepotStocks) {
      const storeId = Number((item as Record<string, unknown>)?.storeId);
      const rawQty = (item as Record<string, unknown>)?.quantity;
      const quantity = rawQty === undefined || rawQty === '' ? 0 : Number(rawQty);

      if (!Number.isInteger(storeId) || !validStoreIds.has(storeId)) {
        return { error: `Depot ID "${String(storeId)}" không hợp lệ.` };
      }
      if (!Number.isInteger(quantity) || quantity < 0) {
        return { error: 'Tồn kho tại mỗi depot phải là số nguyên >= 0.' };
      }
      dedup.set(storeId, quantity);
    }

    return {
      entries: Array.from(dedup.entries()).map(([storeId, quantity]) => ({
        storeId,
        quantity,
      })),
    };
  }

  if (rawFallbackStock !== undefined && rawFallbackStock !== '') {
    const parsedStock = Number(rawFallbackStock);
    if (!Number.isInteger(parsedStock) || parsedStock < 0) {
      return { error: 'Tồn kho phải là số nguyên >= 0.' };
    }
    const defaultStore = stores.find((s) => s.isDefault) ?? stores[0];
    if (defaultStore) {
      return {
        entries: [{ storeId: defaultStore.id, quantity: parsedStock }],
      };
    }
  }

  return { entries: [] };
}

async function fetchAllStoresOrdered(): Promise<StoreSummaryRow[]> {
  return prisma.store.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      isDefault: true,
      isActive: true,
    },
    orderBy: [{ isDefault: 'desc' }, { isActive: 'desc' }, { id: 'asc' }],
  });
}

export const getProducts = async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const activeOnly = req.query.activeOnly === 'true';
    const selectedStoreId = parseSelectedStoreId(req.query.storeId);

    const hasPagination =
      req.query.page !== undefined || req.query.limit !== undefined;
    const rawPage = Number(req.query.page ?? 1);
    const rawLimit = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(100, Math.max(1, Math.floor(rawLimit)))
      : 20;
    const requestedPage = Number.isFinite(rawPage)
      ? Math.max(1, Math.floor(rawPage))
      : 1;

    const where: Prisma.ProductWhereInput = {};
    if (activeOnly) {
      where.isActive = true;
    }
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

    const [stores, total, totalProducts, activeProducts, stockAgg, aboveLowStockCount] =
      await Promise.all([
        fetchAllStoresOrdered(),
        prisma.product.count({ where }),
        prisma.product.count(),
        prisma.product.count({ where: { isActive: true } }),
        prisma.depotStock.aggregate({
          where: selectedStoreId !== null ? { storeId: selectedStoreId } : undefined,
          _sum: { quantity: true },
        }),
        selectedStoreId !== null
          ? prisma.depotStock.count({
              where: {
                storeId: selectedStoreId,
                quantity: { gt: LOW_STOCK_THRESHOLD },
              },
            })
          : prisma.depotStock
              .groupBy({
                by: ['productId'],
                _sum: { quantity: true },
                having: {
                  quantity: {
                    _sum: { gt: LOW_STOCK_THRESHOLD },
                  },
                },
              })
              .then((rows) => rows.length),
      ]);

    const lowStockProducts = Math.max(0, totalProducts - aboveLowStockCount);

    const totalPages = hasPagination ? Math.max(1, Math.ceil(total / limit)) : 1;
    const page = hasPagination ? Math.min(requestedPage, totalPages) : 1;

    const products = await prisma.product.findMany({
      where,
      include: { depotStocks: true },
      orderBy: [{ id: 'desc' }],
      ...(hasPagination
        ? {
            skip: (page - 1) * limit,
            take: limit,
          }
        : {}),
    });

    res.json({
      success: true,
      data: products.map((p) => serializeProduct(p, stores, selectedStoreId)),
      pagination: {
        page,
        limit: hasPagination ? limit : total,
        total,
        totalPages,
      },
      summary: {
        totalProducts,
        activeProducts,
        lowStockProducts,
        totalStock: stockAgg._sum.quantity ?? 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID sản phẩm không hợp lệ.' });
    }

    const selectedStoreId = parseSelectedStoreId(req.query.storeId);
    const [product, stores] = await Promise.all([
      prisma.product.findUnique({
        where: { id },
        include: { depotStocks: true },
      }),
      fetchAllStoresOrdered(),
    ]);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
    }

    res.json({
      success: true,
      data: serializeProduct(product, stores, selectedStoreId),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const {
      sku,
      name,
      category,
      unit,
      price,
      stock,
      depotStocks,
      isActive = true,
    } = req.body;

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedSku =
      typeof sku === 'string' && sku.trim()
        ? sku.trim().toUpperCase()
        : `SKU-${Math.floor(1000 + Math.random() * 9000)}-${Date.now().toString().slice(-3)}`;
    const trimmedCategory =
      typeof category === 'string' && category.trim() ? category.trim() : 'Thực phẩm';
    const trimmedUnit =
      typeof unit === 'string' && unit.trim() ? unit.trim() : 'Cái';
    const parsedPrice = Number(price);

    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên sản phẩm.' });
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ success: false, message: 'Đơn giá phải là số hợp lệ >= 0.' });
    }

    const stores = await fetchAllStoresOrdered();
    const parsedStocks = parseDepotStocksInput(depotStocks, stock, stores);
    if (parsedStocks.error || !parsedStocks.entries) {
      return res.status(400).json({ success: false, message: parsedStocks.error });
    }

    const existingSku = await prisma.product.findUnique({ where: { sku: trimmedSku } });
    if (existingSku) {
      return res.status(409).json({
        success: false,
        message: `Mã SKU "${trimmedSku}" đã tồn tại. Vui lòng chọn mã khác.`,
      });
    }

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          sku: trimmedSku,
          name: trimmedName,
          category: trimmedCategory,
          unit: trimmedUnit,
          price: parsedPrice,
          isActive: Boolean(isActive),
          ...(parsedStocks.entries!.length > 0
            ? {
                depotStocks: {
                  create: parsedStocks.entries!.map((entry) => ({
                    storeId: entry.storeId,
                    quantity: entry.quantity,
                  })),
                },
              }
            : {}),
        },
        include: { depotStocks: true },
      });
      return created;
    });

    res.status(201).json({
      success: true,
      message: `Đã thêm sản phẩm "${product.name}" thành công!`,
      data: serializeProduct(product, stores, null),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID sản phẩm không hợp lệ.' });
    }

    const existing = await prisma.product.findUnique({
      where: { id },
      include: { depotStocks: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
    }

    const { sku, name, category, unit, price, stock, depotStocks, isActive } = req.body;

    const trimmedName = typeof name === 'string' ? name.trim() : existing.name;
    const trimmedSku =
      typeof sku === 'string' && sku.trim() ? sku.trim().toUpperCase() : existing.sku;
    const trimmedCategory =
      typeof category === 'string' && category.trim() ? category.trim() : existing.category;
    const trimmedUnit =
      typeof unit === 'string' && unit.trim() ? unit.trim() : existing.unit;
    const parsedPrice = price !== undefined ? Number(price) : Number(existing.price);

    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên sản phẩm.' });
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ success: false, message: 'Đơn giá phải là số hợp lệ >= 0.' });
    }

    const stores = await fetchAllStoresOrdered();
    const shouldUpdateStocks = depotStocks !== undefined || stock !== undefined;
    let stockEntries: Array<{ storeId: number; quantity: number }> = [];
    if (shouldUpdateStocks) {
      const parsedStocks = parseDepotStocksInput(depotStocks, stock, stores);
      if (parsedStocks.error || !parsedStocks.entries) {
        return res.status(400).json({ success: false, message: parsedStocks.error });
      }
      stockEntries = parsedStocks.entries;
    }

    if (trimmedSku !== existing.sku) {
      const duplicate = await prisma.product.findUnique({ where: { sku: trimmedSku } });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: `Mã SKU "${trimmedSku}" đã tồn tại. Vui lòng chọn mã khác.`,
        });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          sku: trimmedSku,
          name: trimmedName,
          category: trimmedCategory,
          unit: trimmedUnit,
          price: parsedPrice,
          isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive,
        },
      });

      if (shouldUpdateStocks) {
        for (const entry of stockEntries) {
          await tx.depotStock.upsert({
            where: {
              storeId_productId: {
                storeId: entry.storeId,
                productId: id,
              },
            },
            update: { quantity: entry.quantity },
            create: {
              storeId: entry.storeId,
              productId: id,
              quantity: entry.quantity,
            },
          });
        }
      }

      return tx.product.findUniqueOrThrow({
        where: { id },
        include: { depotStocks: true },
      });
    });

    res.json({
      success: true,
      message: `Đã cập nhật sản phẩm "${updated.name}" thành công!`,
      data: serializeProduct(updated, stores, null),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID sản phẩm không hợp lệ.' });
    }

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
    }

    await prisma.product.delete({ where: { id } });

    res.json({
      success: true,
      message: `Đã xóa sản phẩm "${existing.name}" thành công!`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
