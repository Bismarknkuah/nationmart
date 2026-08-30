import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { listCategories, upsertCategory, deleteCategory } from '../controllers/storeCategoryController';

const router = Router();

// Public read (seeds defaults on first call).
router.get('/', listCategories);

// Admin write.
router.post('/', authenticate, upsertCategory);
router.delete('/:value', authenticate, deleteCategory);

export default router;
