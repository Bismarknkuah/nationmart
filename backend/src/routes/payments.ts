import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  initiateMomoPayment, submitOtp, verifyPayment, myPayments, initiateCardPayment, setupPayout,
  initiatePayment,
} from '../controllers/paymentController';

const router = Router();
router.use(authenticate);
// Unified, channel-aware entry point: card | mobile_money | bank_transfer, plus
// one-tap saved-card charging. This is what the app should call.
router.post('/initiate', initiatePayment);
router.post('/momo/initiate', initiateMomoPayment);
router.post('/card', initiateCardPayment);
router.post('/momo/otp', submitOtp);
router.get('/mine', myPayments);
router.post('/payout-setup', setupPayout);
router.get('/:reference/verify', verifyPayment);

export default router;
