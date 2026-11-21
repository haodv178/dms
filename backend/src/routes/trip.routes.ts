import { Router } from 'express';
import { Role } from '@prisma/client';
import {
  cancelOrDeleteTrip,
  getMyActiveTrip,
  getTrips,
  optimizeAndCreateTrip,
  reassignTripDriver,
  reoptimizeTrip,
  startTrip,
} from '../controllers/trip.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', requireRole(Role.ADMIN, Role.WAREHOUSE, Role.DRIVER), getTrips);
router.get('/my-active', requireRole(Role.ADMIN, Role.DRIVER), getMyActiveTrip);
router.post('/optimize', requireRole(Role.ADMIN), optimizeAndCreateTrip);
router.patch('/:id/start', requireRole(Role.ADMIN, Role.DRIVER), startTrip);
router.patch('/:id/driver', requireRole(Role.ADMIN), reassignTripDriver);
router.post('/:id/reoptimize', requireRole(Role.ADMIN), reoptimizeTrip);
router.delete('/:id', requireRole(Role.ADMIN), cancelOrDeleteTrip);

export default router;
