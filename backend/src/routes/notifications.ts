import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  listNotifications, unreadCount, markRead, markAllRead,
} from '../controllers/notificationController';

const router = Router();
router.use(authenticate);
router.get('/', listNotifications);
router.get('/unread-count', unreadCount);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markRead);

export default router;
