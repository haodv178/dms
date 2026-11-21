import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../lib/prisma';
import { runSeed } from '../lib/seeder';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_DAYS,
  clearRefreshTokenCookie,
  generateRawRefreshToken,
  hashPassword,
  hashRefreshToken,
  issueRefreshToken,
  revokeUserRefreshTokens,
  setRefreshTokenCookie,
  signAccessToken,
  validatePasswordStrength,
  verifyPassword,
} from '../lib/auth';

export const login = async (req: Request, res: Response) => {
  try {
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!rawEmail || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ email và mật khẩu.',
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: rawEmail },
      select: {
        id: true,
        email: true,
        password: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không đúng!',
      });
    }

    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không đúng!',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.',
      });
    }

    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const accessToken = signAccessToken(payload);
    const rawRefreshToken = await issueRefreshToken(user.id);
    setRefreshTokenCookie(res, rawRefreshToken);

    return res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      accessToken,
      token: accessToken,
      user: payload,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const refreshSession = async (req: Request, res: Response) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!rawToken || typeof rawToken !== 'string') {
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy phiên làm việc. Vui lòng đăng nhập lại.',
      });
    }

    const tokenHash = hashRefreshToken(rawToken);
    const existing = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!existing) {
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        success: false,
        message: 'Phiên làm việc không hợp lệ. Vui lòng đăng nhập lại.',
      });
    }

    // Reuse detection: if an already-revoked token is replayed, revoke all sessions for that user
    if (existing.revokedAt) {
      await revokeUserRefreshTokens(existing.userId);
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        success: false,
        message: 'Phiên làm việc đã bị thu hồi. Vui lòng đăng nhập lại.',
      });
    }

    if (existing.expiresAt <= new Date()) {
      await prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        success: false,
        message: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
      });
    }

    if (!existing.user.isActive) {
      await revokeUserRefreshTokens(existing.userId);
      clearRefreshTokenCookie(res);
      return res.status(403).json({
        success: false,
        message: 'Tài khoản đã bị vô hiệu hóa.',
      });
    }

    // Rotate refresh token atomically
    const newRawToken = generateRawRefreshToken();
    const newTokenHash = hashRefreshToken(newRawToken);
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      }),
      prisma.refreshToken.create({
        data: {
          tokenHash: newTokenHash,
          userId: existing.user.id,
          expiresAt: newExpiresAt,
        },
      }),
    ]);

    const payload = {
      id: existing.user.id,
      email: existing.user.email,
      name: existing.user.name,
      role: existing.user.role,
    };

    const accessToken = signAccessToken(payload);
    setRefreshTokenCookie(res, newRawToken);

    return res.json({
      success: true,
      accessToken,
      token: accessToken,
      user: payload,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (rawToken && typeof rawToken === 'string') {
      const tokenHash = hashRefreshToken(rawToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearRefreshTokenCookie(res);
    return res.json({
      success: true,
      message: 'Đăng xuất thành công.',
    });
  } catch (error: any) {
    clearRefreshTokenCookie(res);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getMe = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Chưa đăng nhập.',
    });
  }

  return res.json({
    success: true,
    data: req.user,
  });
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });
    }

    const currentPassword =
      typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword =
      typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.',
      });
    }

    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      return res.status(400).json({ success: false, message: strengthError });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true, password: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
    }

    const valid = await verifyPassword(currentPassword, user.password);
    if (!valid) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu hiện tại không đúng.',
      });
    }

    const hashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // Revoke all previous sessions and issue a fresh one for the current device
    await revokeUserRefreshTokens(user.id);
    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    const accessToken = signAccessToken(payload);
    const rawRefreshToken = await issueRefreshToken(user.id);
    setRefreshTokenCookie(res, rawRefreshToken);

    return res.json({
      success: true,
      message: 'Đổi mật khẩu thành công!',
      accessToken,
      user: payload,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getSystemOverview = async (req: Request, res: Response) => {
  try {
    const stores = await prisma.store.findMany({
      orderBy: [{ isDefault: 'desc' }, { isActive: 'desc' }, { id: 'asc' }],
    });

    const isAdmin = req.user?.role === Role.ADMIN;
    const users = isAdmin
      ? await prisma.user.findMany({
          select: { id: true, email: true, name: true, role: true, isActive: true },
          orderBy: { id: 'asc' },
        })
      : [];

    return res.json({ success: true, data: { stores, users } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const seedSampleData = async (_req: Request, res: Response) => {
  try {
    const result = await runSeed(prisma, true);
    return res.json({
      success: true,
      message: `Đã nạp thành công 1 Kho (Depot), ${result.users.length} Users và ${result.ordersCount} Đơn hàng mẫu!`,
      data: result,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
