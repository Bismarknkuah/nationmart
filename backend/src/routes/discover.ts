import { Router } from 'express';
import { visualSearch } from '../controllers/discoverController';

const router = Router();
router.post('/visual', visualSearch);
export default router;
