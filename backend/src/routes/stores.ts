import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  createStore, myStores, browseStores, getStorefront, updateStore,
  storeAnalytics, addStaff, updateStaff, removeStaff, bulkUpload, listPermissions,
} from '../controllers/storeController';

const router = Router();

// Public
router.get('/', browseStores);
router.get('/permissions', listPermissions);
router.get('/mine', authenticate, myStores);
router.get('/:slug', getStorefront);

// Owner / seller-side
const sellerRoles = ['seller', 'reseller', 'manufacturer', 'admin'];
router.post('/', authenticate, authorize(...sellerRoles), createStore);
router.put('/:id', authenticate, updateStore);
router.get('/:id/analytics', authenticate, storeAnalytics);
router.post('/:id/staff', authenticate, addStaff);
router.patch('/:id/staff/:userId', authenticate, updateStaff);
router.delete('/:id/staff/:userId', authenticate, removeStaff);
router.post("/:id/products/bulk", authenticate, bulkUpload as any);

export default router;
