import { Router } from 'express';
import {
  cancelOrDeleteTrip,
  getMyActiveTrip,
  getTrips,
  optimizeAndCreateTrip,
  reassignTripDriver,
  reoptimizeTrip,
  startTrip,
} from '../controllers/trip.controller';

const router = Router();

router.get('/', getTrips);
router.get('/my-active', getMyActiveTrip);
router.post('/optimize', optimizeAndCreateTrip);
router.patch('/:id/start', startTrip);
router.patch('/:id/driver', reassignTripDriver);
router.post('/:id/reoptimize', reoptimizeTrip);
router.delete('/:id', cancelOrDeleteTrip);

export default router;
