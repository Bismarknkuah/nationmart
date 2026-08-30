import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  searchProducts, suggest, storesNear, trending,
  unmetDemand, addAlias, listAliases,
} from '../controllers/searchController';

const router = Router();

/**
 * Search is PUBLIC — a buyer must be able to look before they sign up. If a
 * token happens to be present we attach the user (so the search log knows who
 * searched), but we never require one.
 */
const optionalAuth = (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return next();
  return (authenticate as any)(req, res, (err: any) => next());
};

router.get('/', optionalAuth, searchProducts as any);
router.get('/suggest', suggest as any);
router.get('/stores-near', optionalAuth, storesNear as any);
router.get('/trending', trending as any);
router.get('/aliases', listAliases as any);

// Officer only.
router.get('/unmet-demand', authenticate, unmetDemand as any);
router.post('/aliases', authenticate, addAlias as any);

export default router;
