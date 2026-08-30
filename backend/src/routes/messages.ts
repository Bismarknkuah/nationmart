import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  startConversation, listConversations, getMessages, sendMessage,
  getOrderThread, sendOrderMessage,
} from '../controllers/messageController';

const router = Router();
router.use(authenticate);
router.post('/start', startConversation);
router.get('/order/:orderId', getOrderThread);
router.post('/order/:orderId', sendOrderMessage);
router.get('/conversations', listConversations);
router.get('/:conversationId', getMessages);
router.post('/:conversationId', sendMessage);

export default router;
