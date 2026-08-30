import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ratings } from '../repos/platformRepo';

/** POST /api/ratings/:productId — only a buyer who actually bought it may review. */
export const rateProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { productId } = req.params;
    const { rating, comment, orderId } = req.body;

    if (!(await ratings.canReview(productId, req.user.id))) {
      res.status(403).json({ error: 'You can only review a product you have bought.' });
      return;
    }
    const review = await ratings.review({
      productId, buyerId: req.user.id, orderId, rating: Number(rating), comment,
    });
    res.status(201).json({ review });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const listReviews = async (req: AuthRequest, res: Response): Promise<void> => {
  try { res.json({ reviews: await ratings.forProduct(req.params.productId) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const createRating = rateProduct;
export const getUserRatings = listReviews;
