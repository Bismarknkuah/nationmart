import { Router } from 'express';
import { authenticate, authorize, requireActiveSubscription } from '../middleware/auth';
import { requirePayoutMethod } from '../middleware/requirePayoutMethod';
import {
  listProducts, getProduct, createProduct, myProducts, updateProduct,
  approveProduct, lowStock, addTrace, getByPassportId, bulkCreateProducts,
} from '../controllers/productController';

const router = Router();

// Public browsing — no login needed.
router.get('/', listProducts as any);
router.get('/passport/:passportId', getByPassportId as any);

router.use(authenticate);

router.get('/mine', myProducts as any);
router.get('/low-stock', lowStock as any);

// Listing requires a live subscription (free for the first year).
router.post('/', requireActiveSubscription as any, requirePayoutMethod as any, createProduct as any);
router.post('/bulk', requireActiveSubscription as any, requirePayoutMethod as any, bulkCreateProducts as any);

router.post('/:id/approve', approveProduct as any);
router.post('/:id/trace', addTrace as any);
router.patch('/:id', updateProduct as any);

// Keep this last so it doesn't swallow /mine, /low-stock, etc.
router.get('/:id', getProduct as any);

export default router;
