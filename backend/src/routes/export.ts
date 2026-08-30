import { Router } from 'express';
import {
  generateLaceyActDeclaration,
  generateCommercialInvoice,
  getComplianceStatus,
  updateComplianceItem,
} from '../controllers/exportController';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.get('/lacey-act/:orderId', generateLaceyActDeclaration);
router.get('/commercial-invoice/:orderId', generateCommercialInvoice);
router.get('/compliance-status/:orderId', getComplianceStatus);
router.patch('/compliance/:orderId/checklist', updateComplianceItem);

export default router;
