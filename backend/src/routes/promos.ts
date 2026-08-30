import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createPromo, listStorePromos, validatePromo, togglePromo,
  promoOverview, createCampaign, setPromoActive,
} from '../controllers/promoController';

const router = Router();
router.use(authenticate);

// Admin/exec management console
router.get('/overview', promoOverview);
router.post('/campaign', createCampaign);
router.patch('/:code/active', setPromoActive);

// Seller / general
router.post('/', createPromo);
router.get('/store/:storeId', listStorePromos);
router.post('/validate', validatePromo);
router.patch('/:id', togglePromo);

export default router;
