import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createStaff, listStaff, moderateUser, pendingRiders, approveRider,
  applyDiscount, createStoreFor, regionalIntelligence,
  userRisk, aiApproveRiders, createPromotion, discountRecommendations, reportUser, bulkCreateStaff,
  listUsers, deleteUser, enrollBuyer, listActivity, getPlatformStats, getOfficeStats, migrateSubscriptions,
  getJurisdictionLogistics, getRegionalOverview,
} from '../controllers/managementController';

const router = Router();
router.use(authenticate);

router.get('/staff', listStaff);
router.get('/users', listUsers);
router.delete('/users/:id', deleteUser);
router.post('/buyers/enroll', enrollBuyer);
router.get('/activity', listActivity);
router.get('/platform-stats', getPlatformStats);
router.get('/office-stats', getOfficeStats);
router.post('/migrate-subscriptions', migrateSubscriptions);
router.get('/jurisdiction-logistics', getJurisdictionLogistics);
router.get('/regional-overview', getRegionalOverview);
router.post('/staff', createStaff);
router.post('/staff/bulk', bulkCreateStaff);
router.post('/users/:id/moderate', moderateUser);
router.get('/users/:id/risk', userRisk);
router.get('/riders/pending', pendingRiders);
router.post('/riders/:id/approve', approveRider);
router.post('/riders/ai-approve', aiApproveRiders);
router.post('/users/:id/discount', applyDiscount);
router.post('/discount', applyDiscount);                 // by email in body
router.post('/promotions', createPromotion);
router.get('/discount-recommendations', discountRecommendations);
router.post('/report', reportUser);                      // by email in body
router.post('/stores', createStoreFor);
router.get('/regional-intelligence', regionalIntelligence);

export default router;
