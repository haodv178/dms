import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { runSeed } from '../lib/seeder';

const JWT_SECRET = process.env.JWT_SECRET || 'dms-secret-key';

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || (password && user.password !== password)) {
      return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng!' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
      const user = await prisma.user.findUnique({ where: { id: decoded.id } });
      if (user) {
        return res.json({
          success: true,
          data: { id: user.id, email: user.email, name: user.name, role: user.role },
        });
      }
    }

    // Fallback: return default ADMIN user or all available users for easy role switching
    const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });
    res.json({
      success: true,
      data: users[0] || null,
      users,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getSystemOverview = async (_req: Request, res: Response) => {
  try {
    const [stores, users] = await Promise.all([
      prisma.store.findMany({ orderBy: { id: 'asc' } }),
      prisma.user.findMany({
        select: { id: true, email: true, name: true, role: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    res.json({ success: true, data: { stores, users } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const seedSampleData = async (_req: Request, res: Response) => {
  try {
    const result = await runSeed(prisma, true);
    res.json({
      success: true,
      message: `Đã nạp thành công 1 Kho (Depot), ${result.users.length} Users và ${result.ordersCount} Đơn hàng mẫu!`,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
