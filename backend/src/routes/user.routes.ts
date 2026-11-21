import { Router } from 'express';
import { Role } from '@prisma/client';
import {
  createUser,
  deleteUser,
  getUsers,
  resetUserPassword,
  updateUser,
} from '../controllers/user.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth, requireRole(Role.ADMIN));

router.get('/', getUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.patch('/:id/reset-password', resetUserPassword);
router.delete('/:id', deleteUser);

export default router;
