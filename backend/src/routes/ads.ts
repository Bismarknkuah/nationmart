import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { create, mine, pause, cancel, resume, serve, click, adminOverview } from '../controllers/adController';

const router = Router();

// Public serving surface (optionalauth-free: ads show to everyone).
router.get('/serve', serve as any);
router.post('/:id/click', click as any);

router.use(authenticate);
router.post('/', create as any);
router.get('/mine', mine as any);
router.get('/admin/overview', adminOverview as any);
router.post('/:id/pause', pause as any);
router.post('/:id/cancel', cancel as any);
router.post('/:id/resume', resume as any);

export default router;
