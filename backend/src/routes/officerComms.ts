import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  listChannels,
  getChannelMessages,
  sendMessage,
  markRead,
} from '../controllers/officerCommsController';

const router = Router();
router.use(authenticate);

router.get('/channels', listChannels);
router.get('/channels/:id/messages', getChannelMessages);
router.post('/channels/:id/messages', sendMessage);
router.post('/channels/:id/read', markRead);

export default router;
