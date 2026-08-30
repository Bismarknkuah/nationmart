import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  listMethods, addMomo, banks, resolveBankAccount, addBankAccount,
  setDefaultMethod, removeMethod, myPayouts, requestPayout, inFlight,
} from '../controllers/payoutController';

const router = Router();
router.use(authenticate);

// ─── The seller's / rider's payments office ───────────────────────────────
// Add, change, remove. They can always swap a destination; they just cannot
// end up with none while they are still earning.
router.get('/methods', listMethods as any);
router.post('/methods/momo', addMomo as any);
router.post('/methods/bank', addBankAccount as any);
router.post('/methods/:id/default', setDefaultMethod as any);
router.delete('/methods/:id', removeMethod as any);

// Banks we can pay out to, and the name-check before we send money anywhere.
router.get('/banks', banks as any);
router.post('/banks/resolve', resolveBankAccount as any);

// ─── Withdrawals ──────────────────────────────────────────────────────────
router.get('/', myPayouts as any);
router.post('/', requestPayout as any);
router.get('/in-flight', inFlight as any);

export default router;
