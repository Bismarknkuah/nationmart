import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { aiAssist, createReport, forwardReport, compileReports, inbox, reviewReport } from '../controllers/reportingController';
import {
  listSalaryStructure, upsertSalaryStructure, payOfficer, listSalaryPayments,
  financialSummary, aiMonthlyAnalysis, bulkPayOfficers,
  overview as financeOverviewH, integrity as financeIntegrityH,
  paymentsOverview, paymentsFeed,
} from '../controllers/financeController';

const router = Router();
router.use(authenticate);

// Officer reporting chain
router.get('/reports/inbox', inbox);
router.post('/reports', createReport);
router.post('/reports/ai-assist', aiAssist);
router.post('/reports/compile', compileReports);
router.post('/reports/:id/forward', forwardReport);
router.post('/reports/:id/review', reviewReport);

// Finance office
router.get('/finance/structure', listSalaryStructure);
router.post('/finance/structure', upsertSalaryStructure);
router.post('/finance/pay', payOfficer);
router.post('/finance/pay/bulk', bulkPayOfficers);
router.get('/finance/payments', listSalaryPayments);
router.get('/finance/summary', financialSummary);
router.get('/finance/ai-analysis', aiMonthlyAnalysis);

// Payment management console
router.get('/finance/overview', financeOverviewH);
router.get('/finance/integrity', financeIntegrityH);
router.get('/finance/payments/overview', paymentsOverview);
router.get('/finance/payments/transactions', paymentsFeed);

export default router;
