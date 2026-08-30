import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  listDefinitions,
  myInbox,
  getInstance,
  decide,
  listInstances,
  startInstance,
} from '../controllers/workflowController';

const router = Router();

// All workflow endpoints require an authenticated officer/admin/user.
router.use(authenticate);

router.get('/definitions', listDefinitions);
router.get('/inbox', myInbox);
router.get('/', listInstances);
router.post('/start', startInstance);
router.get('/:id', getInstance);
router.post('/:id/decide', decide);

export default router;
