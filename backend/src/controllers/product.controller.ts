import { Request, Response } from 'express';
import prisma from '../lib/prisma';

export const getProducts = async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const activeOnly = req.query.activeOnly === 'true';

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

    const where: Record<string, unknown> = {};
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

    const [total, totalProducts, activeProducts, lowStockProducts, stockAgg] =
      await Promise.all([
        prisma.product.count({ where }),
        prisma.product.count(),
        prisma.product.count({ where: { isActive: true } }),
        prisma.product.count({ where: { stock: { lte: 10 } } }),
        prisma.product.aggregate({ _sum: { stock: true } }),
      ]);

    const totalPages = hasPagination ? Math.max(1, Math.ceil(total / limit)) : 1;
    const page = hasPagination ? Math.min(requestedPage, totalPages) : 1;

    const products = await prisma.product.findMany({
      where,
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
      data: products,
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
        totalStock: stockAgg._sum.stock ?? 0,
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

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
    }

    res.json({ success: true, data: product });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const { sku, name, category, unit, price, stock, isActive = true } = req.body;

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
    const parsedStock = stock === undefined || stock === '' ? 0 : Number(stock);

    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên sản phẩm.' });
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ success: false, message: 'Đơn giá phải là số hợp lệ >= 0.' });
    }
    if (!Number.isInteger(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ success: false, message: 'Tồn kho phải là số nguyên >= 0.' });
    }

    const existingSku = await prisma.product.findUnique({ where: { sku: trimmedSku } });
    if (existingSku) {
      return res.status(409).json({
        success: false,
        message: `Mã SKU "${trimmedSku}" đã tồn tại. Vui lòng chọn mã khác.`,
      });
    }

    const product = await prisma.product.create({
      data: {
        sku: trimmedSku,
        name: trimmedName,
        category: trimmedCategory,
        unit: trimmedUnit,
        price: parsedPrice,
        stock: parsedStock,
        isActive: Boolean(isActive),
      },
    });

    res.status(201).json({
      success: true,
      message: `Đã thêm sản phẩm "${product.name}" thành công!`,
      data: product,
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

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
    }

    const { sku, name, category, unit, price, stock, isActive } = req.body;

    const trimmedName = typeof name === 'string' ? name.trim() : existing.name;
    const trimmedSku =
      typeof sku === 'string' && sku.trim() ? sku.trim().toUpperCase() : existing.sku;
    const trimmedCategory =
      typeof category === 'string' && category.trim() ? category.trim() : existing.category;
    const trimmedUnit =
      typeof unit === 'string' && unit.trim() ? unit.trim() : existing.unit;
    const parsedPrice = price !== undefined ? Number(price) : Number(existing.price);
    const parsedStock = stock !== undefined ? Number(stock) : existing.stock;

    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên sản phẩm.' });
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ success: false, message: 'Đơn giá phải là số hợp lệ >= 0.' });
    }
    if (!Number.isInteger(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ success: false, message: 'Tồn kho phải là số nguyên >= 0.' });
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

    const updated = await prisma.product.update({
      where: { id },
      data: {
        sku: trimmedSku,
        name: trimmedName,
        category: trimmedCategory,
        unit: trimmedUnit,
        price: parsedPrice,
        stock: parsedStock,
        isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive,
      },
    });

    res.json({
      success: true,
      message: `Đã cập nhật sản phẩm "${updated.name}" thành công!`,
      data: updated,
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
