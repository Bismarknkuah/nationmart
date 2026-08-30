import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  listFaqs, listFaqsAdmin, createFaq, updateFaq, deleteFaq,
  listAiTasks, createAiTask, chat, aiStatus, teachAssistant, feedbackAssistant,
} from '../controllers/aiController';

const router = Router();
router.use(authenticate);

// Assistant
router.get('/status', aiStatus);
router.post('/chat', chat);
router.post('/teach', teachAssistant);
router.post('/feedback', feedbackAssistant);
// Knowledge base
router.get('/faqs', listFaqs);                 // any authenticated user
router.get('/faqs/admin', listFaqsAdmin);      // executives
router.post('/faqs', createFaq);
router.patch('/faqs/:id', updateFaq);
router.delete('/faqs/:id', deleteFaq);

// Executive AI task runner
router.get('/tasks', listAiTasks);
router.post('/tasks', createAiTask);

export default router;
