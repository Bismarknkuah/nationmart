import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { generateReceipt } from '../controllers/receiptController';

const router = Router();
router.use(authenticate);
router.get('/order/:orderId', generateReceipt);

export default router;
