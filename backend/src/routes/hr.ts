import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  submitLeave, myLeave, cancelLeave, listLeave, decideLeave,
  listOnboarding, startOnboarding, toggleOnboardingTask,
} from '../controllers/hrController';

const router = Router();
router.use(authenticate);

// Leave
router.post('/leave', submitLeave);
router.get('/leave/mine', myLeave);
router.post('/leave/:id/cancel', cancelLeave);
router.get('/leave', listLeave);
router.post('/leave/:id/decide', decideLeave);

// Onboarding
router.get('/onboarding', listOnboarding);
router.post('/onboarding/start', startOnboarding);
router.post('/onboarding/:id/task', toggleOnboardingTask);

export default router;
