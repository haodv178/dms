import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { Role } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthTokenPayload, verifyAccessToken } from '../lib/auth';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.',
  },
});

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Chưa đăng nhập hoặc thiếu token xác thực.',
      });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token xác thực không hợp lệ.',
      });
    }

    let decoded: AuthTokenPayload;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      return res.status(401).json({
        success: false,
        message: 'Phiên đăng nhập đã hết hạn hoặc token không hợp lệ.',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản không tồn tại.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.',
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    return next();
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi xác thực người dùng.',
    });
  }
};

export const requireRole = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Chưa đăng nhập.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền thực hiện thao tác này.',
      });
    }

    return next();
  };
};
