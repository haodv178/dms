import { Router } from 'express';
import { Role } from '@prisma/client';
import {
  createStore,
  deleteStore,
  getStoreById,
  getStoreInventory,
  getStores,
  setDefaultStore,
  updateStore,
  updateStoreInventory,
} from '../controllers/store.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', requireRole(Role.ADMIN, Role.WAREHOUSE, Role.DRIVER), getStores);
router.get('/:id/inventory', requireRole(Role.ADMIN, Role.WAREHOUSE), getStoreInventory);
router.put('/:id/inventory', requireRole(Role.ADMIN, Role.WAREHOUSE), updateStoreInventory);
router.get('/:id', requireRole(Role.ADMIN, Role.WAREHOUSE, Role.DRIVER), getStoreById);
router.post('/', requireRole(Role.ADMIN), createStore);
router.put('/:id', requireRole(Role.ADMIN), updateStore);
router.patch('/:id/set-default', requireRole(Role.ADMIN), setDefaultStore);
router.delete('/:id', requireRole(Role.ADMIN), deleteStore);

export default router;
