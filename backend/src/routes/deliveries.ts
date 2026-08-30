import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createForOrder, myDeliveries, myBatches, updateStatus, ping, byOrder,
  recommend, assign, stats, quote,
} from '../controllers/deliveryController';

const router = Router();

router.get('/quote', quote as any);          // public: price before you commit

router.use(authenticate);

router.post('/from-order/:orderId', createForOrder as any);
router.get('/mine', myDeliveries as any);
router.get('/batches', myBatches as any);
router.get('/stats', stats as any);
router.get('/by-order/:orderId', byOrder as any);
router.get('/:id/recommend', recommend as any);
router.post('/:id/assign', assign as any);
router.post('/:id/status', updateStatus as any);
router.post('/:id/ping', ping as any);

export default router;
