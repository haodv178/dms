import { Router } from 'express';
import { Role } from '@prisma/client';
import {
  getOrders,
  getOrderById,
  createOrder,
  updateOrder,
  updateOrderPaymentStatus,
  cancelOrder,
  startPicking,
  completePacking,
  completeDelivery,
  failDelivery,
  rejectDelivery,
  assignDriverToOrder,
  bulkOrderAction,
} from '../controllers/order.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', requireRole(Role.ADMIN, Role.WAREHOUSE, Role.DRIVER), getOrders);
router.post('/bulk-action', requireRole(Role.ADMIN, Role.WAREHOUSE), bulkOrderAction);
router.get('/:id', requireRole(Role.ADMIN, Role.WAREHOUSE, Role.DRIVER), getOrderById);
router.post('/', requireRole(Role.ADMIN), createOrder);
router.put('/:id', requireRole(Role.ADMIN), updateOrder);
router.patch('/:id/payment-status', requireRole(Role.ADMIN), updateOrderPaymentStatus);
router.patch('/:id/cancel', requireRole(Role.ADMIN), cancelOrder);
router.patch('/:id/start-picking', requireRole(Role.ADMIN, Role.WAREHOUSE), startPicking);
router.patch('/:id/complete-packing', requireRole(Role.ADMIN, Role.WAREHOUSE), completePacking);
router.patch('/:id/complete-delivery', requireRole(Role.ADMIN, Role.DRIVER), completeDelivery);
router.patch('/:id/fail-delivery', requireRole(Role.ADMIN, Role.DRIVER), failDelivery);
router.patch('/:id/reject-delivery', requireRole(Role.ADMIN, Role.DRIVER), rejectDelivery);
router.patch('/:id/assign-driver', requireRole(Role.ADMIN), assignDriverToOrder);

export default router;
