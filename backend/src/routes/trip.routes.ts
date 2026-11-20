import { Router } from 'express';
import { optimizeAndCreateTrip, getTrips, getMyActiveTrip } from '../controllers/trip.controller';

const router = Router();

router.get('/', getTrips);
router.get('/my-active', getMyActiveTrip);
router.post('/optimize', optimizeAndCreateTrip);

export default router;
