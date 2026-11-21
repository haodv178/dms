import { Request, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../lib/prisma';

type StoreWithCounts = Prisma.StoreGetPayload<{
  include: { _count: { select: { orders: true; trips: true } } };
}>;

function serializeStore(store: StoreWithCounts) {
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
    createdAt: store.createdAt,
    updatedAt: store.updatedAt,
  };
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

    const defaultStore =
      allSummaryStores.find((s) => s.isDefault) ?? allSummaryStores[0] ?? null;

    res.json({
      success: true,
      data: stores.map(serializeStore),
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

    res.json({ success: true, data: serializeStore(store) });
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
