import { Router } from 'express';
import { Role } from '@prisma/client';
import {
  changePassword,
  getMe,
  getSystemOverview,
  login,
  logout,
  refreshSession,
  seedSampleData,
} from '../controllers/auth.controller';
import {
  loginRateLimiter,
  requireAuth,
  requireRole,
} from '../middleware/auth.middleware';

const router = Router();

router.post('/auth/login', loginRateLimiter, login);
router.post('/auth/refresh', refreshSession);
router.post('/auth/logout', logout);
router.get('/auth/me', requireAuth, getMe);
router.post('/auth/change-password', requireAuth, changePassword);

router.get('/system/overview', requireAuth, getSystemOverview);
router.post('/seed', requireAuth, requireRole(Role.ADMIN), seedSampleData);

export default router;
