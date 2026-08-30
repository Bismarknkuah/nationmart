import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  raiseDispute, myDisputes, getDispute, addEvidence, withdrawDispute,
  disputeQueue, claimDispute, resolveDispute, sellerRecord, overdueDisputes,
} from '../controllers/disputeController';

const router = Router();

// A shop's dispute record is public — buyers deserve to see it before they buy.
router.get('/record/:sellerId', sellerRecord as any);

router.use(authenticate);

router.post('/', raiseDispute as any);
router.get('/mine', myDisputes as any);

// Officer desk.
router.get('/queue', disputeQueue as any);
router.get('/overdue', overdueDisputes as any);

router.post('/:id/evidence', addEvidence as any);
router.post('/:id/withdraw', withdrawDispute as any);
router.post('/:id/claim', claimDispute as any);
router.post('/:id/resolve', resolveDispute as any);

// Last, so it doesn't swallow /mine, /queue, /overdue.
router.get('/:id', getDispute as any);

export default router;
