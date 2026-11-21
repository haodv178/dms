import { Request, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import prisma from '../lib/prisma';
import {
  hashPassword,
  revokeUserRefreshTokens,
  validatePasswordStrength,
} from '../lib/auth';

const VALID_ROLES = new Set<string>(Object.values(Role));

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  driverProfile: {
    select: {
      id: true,
      phone: true,
      licensePlate: true,
      vehicleType: true,
      status: true,
      storeId: true,
    },
  },
  _count: {
    select: {
      trips: true,
    },
  },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

function serializeUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    hasDriverProfile: Boolean(user.driverProfile),
    driverProfile: user.driverProfile,
    tripsCount: user._count.trips,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const getUsers = async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const roleFilter = typeof req.query.role === 'string' ? req.query.role.trim() : '';
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';

    const rawPage = Number(req.query.page ?? 1);
    const rawLimit = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(100, Math.max(1, Math.floor(rawLimit)))
      : 20;
    const requestedPage = Number.isFinite(rawPage)
      ? Math.max(1, Math.floor(rawPage))
      : 1;

    const where: Prisma.UserWhereInput = {};
    if (roleFilter && roleFilter !== 'ALL' && VALID_ROLES.has(roleFilter)) {
      where.role = roleFilter as Role;
    }
    if (statusFilter === 'ACTIVE') {
      where.isActive = true;
    } else if (statusFilter === 'INACTIVE') {
      where.isActive = false;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [
      total,
      totalUsers,
      activeUsers,
      inactiveUsers,
      adminCount,
      warehouseCount,
      driverCount,
    ] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.user.count({ where: { role: Role.ADMIN } }),
      prisma.user.count({ where: { role: Role.WAREHOUSE } }),
      prisma.user.count({ where: { role: Role.DRIVER } }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(requestedPage, totalPages);

    const rows = await prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: [{ isActive: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    });

    return res.json({
      success: true,
      data: rows.map(serializeUser),
      pagination: { page, limit, total, totalPages },
      summary: {
        totalUsers,
        activeUsers,
        inactiveUsers,
        adminCount,
        warehouseCount,
        driverCount,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email =
      typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const role = typeof req.body?.role === 'string' ? req.body.role.trim() : Role.WAREHOUSE;
    const isActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : true;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ họ tên và email.',
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Định dạng email không hợp lệ.',
      });
    }

    if (!VALID_ROLES.has(role)) {
      return res.status(400).json({
        success: false,
        message: 'Vai trò không hợp lệ.',
      });
    }

    const passwordErr = validatePasswordStrength(password);
    if (passwordErr) {
      return res.status(400).json({ success: false, message: passwordErr });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Email "${email}" đã được sử dụng.`,
      });
    }

    const hashedPassword = await hashPassword(password);
    const created = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role as Role,
        isActive,
      },
      select: USER_SELECT,
    });

    return res.status(201).json({
      success: true,
      message: `Đã tạo tài khoản "${created.name}" thành công!`,
      data: serializeUser(created),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID người dùng không hợp lệ.' });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    const name =
      typeof req.body?.name === 'string' ? req.body.name.trim() : existing.name;
    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : existing.email;
    const role =
      typeof req.body?.role === 'string' ? req.body.role.trim() : existing.role;
    const isActive =
      req.body?.isActive !== undefined ? Boolean(req.body.isActive) : existing.isActive;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Họ tên và email không được để trống.',
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Định dạng email không hợp lệ.',
      });
    }

    if (!VALID_ROLES.has(role)) {
      return res.status(400).json({
        success: false,
        message: 'Vai trò không hợp lệ.',
      });
    }

    // Prevent an admin from locking themselves out
    if (req.user?.id === id) {
      if (!isActive) {
        return res.status(400).json({
          success: false,
          message: 'Bạn không thể tự vô hiệu hóa tài khoản của chính mình.',
        });
      }
      if (role !== Role.ADMIN) {
        return res.status(400).json({
          success: false,
          message: 'Bạn không thể tự hạ quyền ADMIN của chính mình.',
        });
      }
    }

    if (email !== existing.email) {
      const duplicate = await prisma.user.findUnique({ where: { email } });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: `Email "${email}" đã được sử dụng.`,
        });
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        role: role as Role,
        isActive,
      },
      select: USER_SELECT,
    });

    // Keep driverProfile.isActive in sync when deactivating a driver user
    if (existing.isActive !== isActive && updated.driverProfile) {
      await prisma.driverProfile.update({
        where: { userId: id },
        data: { isActive },
      });
    }

    // Revoke active sessions if deactivated or role changed
    if (!isActive || existing.role !== role) {
      await revokeUserRefreshTokens(id);
    }

    return res.json({
      success: true,
      message: `Đã cập nhật tài khoản "${updated.name}" thành công!`,
      data: serializeUser(updated),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const resetUserPassword = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID người dùng không hợp lệ.' });
    }

    const newPassword =
      typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    const passwordErr = validatePasswordStrength(newPassword);
    if (passwordErr) {
      return res.status(400).json({ success: false, message: passwordErr });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    const hashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    await revokeUserRefreshTokens(id);

    return res.json({
      success: true,
      message: `Đã đặt lại mật khẩu cho "${existing.name}" và thu hồi các phiên đăng nhập cũ.`,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID người dùng không hợp lệ.' });
    }

    if (req.user?.id === id) {
      return res.status(400).json({
        success: false,
        message: 'Bạn không thể tự xóa tài khoản của chính mình.',
      });
    }

    const existing = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        _count: { select: { trips: true } },
      },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    if (existing._count.trips > 0) {
      return res.status(400).json({
        success: false,
        message: `Tài khoản "${existing.name}" đã có ${existing._count.trips} chuyến xe lịch sử. Hãy vô hiệu hóa thay vì xóa.`,
      });
    }

    await prisma.user.delete({ where: { id } });

    return res.json({
      success: true,
      message: `Đã xóa tài khoản "${existing.name}".`,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
