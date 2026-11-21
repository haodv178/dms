import { Router } from 'express';
import { Role } from '@prisma/client';
import {
  getDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver,
} from '../controllers/driver.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth, requireRole(Role.ADMIN));

router.get('/', getDrivers);
router.get('/:id', getDriverById);
router.post('/', createDriver);
router.put('/:id', updateDriver);
router.delete('/:id', deleteDriver);

export default router;
