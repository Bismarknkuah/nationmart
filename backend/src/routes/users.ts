import { Router } from 'express';
import { getPublicProfile } from '../controllers/userController';

const router = Router();
// Public profile incl. 1-5 score, verification & report count
router.get('/:id', getPublicProfile);

export default router;
