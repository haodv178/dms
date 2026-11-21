import { Router } from 'express';
import { Role } from '@prisma/client';
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../controllers/product.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', requireRole(Role.ADMIN, Role.WAREHOUSE), getProducts);
router.get('/:id', requireRole(Role.ADMIN, Role.WAREHOUSE), getProductById);
router.post('/', requireRole(Role.ADMIN), createProduct);
router.put('/:id', requireRole(Role.ADMIN), updateProduct);
router.delete('/:id', requireRole(Role.ADMIN), deleteProduct);

export default router;
