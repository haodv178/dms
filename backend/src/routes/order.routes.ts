import { Router } from 'express';
import {
  getOrders,
  getOrderById,
  createOrder,
  startPicking,
  completePacking,
  completeDelivery,
  failDelivery,
} from '../controllers/order.controller';

const router = Router();

router.get('/', getOrders);
router.get('/:id', getOrderById);
router.post('/', createOrder);
router.patch('/:id/start-picking', startPicking);
router.patch('/:id/complete-packing', completePacking);
router.patch('/:id/complete-delivery', completeDelivery);
router.patch('/:id/fail-delivery', failDelivery);

export default router;
