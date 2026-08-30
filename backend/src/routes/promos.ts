import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createPromo, listStorePromos, validatePromo, togglePromo,
} from '../controllers/promoController';

const router = Router();
router.use(authenticate);
router.post('/', createPromo);
router.get('/store/:storeId', listStorePromos);
router.post('/validate', validatePromo);
router.patch('/:id', togglePromo);

export default router;
