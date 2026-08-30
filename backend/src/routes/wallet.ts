import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { myWallet, settleWallet, walletOverview, walletIntegrity } from '../controllers/walletController';

const router = Router();
router.use(authenticate);
router.get('/mine', myWallet);
router.post('/settle', settleWallet);
router.get('/overview', walletOverview);
router.get('/integrity', walletIntegrity);
export default router;
