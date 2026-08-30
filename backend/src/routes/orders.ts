import { Router } from 'express';
import {
  createOrder, getMyOrders, getSellerOrders, getOrderById, updateOrderStatus, trackOrder,
  confirmPaymentReceived,
} from '../controllers/orderController';
import { authenticate, authorize, requireNotPending } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.post('/', requireNotPending, createOrder);
router.get('/my', getMyOrders);
router.get('/seller', authorize('seller', 'reseller', 'manufacturer', 'wholesaler', 'service_provider', 'corporate_seller', 'admin'), getSellerOrders);
router.get('/track/:orderNumber', trackOrder);
router.get('/:id', getOrderById);
router.patch('/:id/status', updateOrderStatus);
router.post('/:id/confirm-payment', confirmPaymentReceived);

export default router;
