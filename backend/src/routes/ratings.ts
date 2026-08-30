import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { createRating, getUserRatings } from '../controllers/ratingController';

const router = Router();

// Public: anyone can see a user's score & reviews BEFORE doing business
router.get('/user/:userId', getUserRatings);

// Authenticated: rate the other party after a delivered order
router.post('/', authenticate, createRating);

export default router;
