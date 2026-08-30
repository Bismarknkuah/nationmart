import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  createReport, myReports, reportsAgainstMe, listReports, reviewReport,
} from '../controllers/reportController';

const router = Router();
router.use(authenticate);

// Any authenticated user (buyer or seller) can file / view their reports
router.post('/', createReport);
router.get('/mine', myReports);
router.get('/against-me', reportsAgainstMe);

// District admins + super admins review reports
router.get('/', authorize('admin', 'district_admin'), listReports);
router.patch('/:id/review', authorize('admin', 'district_admin'), reviewReport);

export default router;
