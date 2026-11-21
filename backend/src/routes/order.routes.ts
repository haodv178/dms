import { Router } from 'express';
import {
  getOrders,
  getOrderById,
  createOrder,
  updateOrder,
  startPicking,
  completePacking,
  completeDelivery,
  failDelivery,
  assignDriverToOrder,
  bulkOrderAction,
} from '../controllers/order.controller';

const router = Router();

router.get('/', getOrders);
router.post('/bulk-action', bulkOrderAction);
router.get('/:id', getOrderById);
router.post('/', createOrder);
router.put('/:id', updateOrder);
router.patch('/:id/start-picking', startPicking);
router.patch('/:id/complete-packing', completePacking);
router.patch('/:id/complete-delivery', completeDelivery);
router.patch('/:id/fail-delivery', failDelivery);
router.patch('/:id/assign-driver', assignDriverToOrder);

export default router;
