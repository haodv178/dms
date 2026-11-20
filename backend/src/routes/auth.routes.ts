import { Router } from 'express';
import { login, getMe, getSystemOverview, seedSampleData } from '../controllers/auth.controller';

const router = Router();

router.post('/auth/login', login);
router.get('/auth/me', getMe);
router.get('/system/overview', getSystemOverview);
router.post('/seed', seedSampleData);

export default router;
