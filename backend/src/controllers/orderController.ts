import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as ord from '../repos/orderRepo';
import { promos } from '../repos/platformRepo';
import { notify } from '../repos/notificationRepo';

/**
 * POST /api/orders — place an order.
 *
 * Stock reservation and the order write happen in ONE transaction, so a line
 * that cannot be supplied rolls back every reservation before it. Overselling
 * is impossible.
 */
export const createOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { items, shippingAddress, promoCode } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Your basket is empty.' }); return;
    }

    const lines = items.map((i: any) => ({
      productId: i.product || i.productId,
      quantity: Number(i.quantity) || 1,
    }));

    const { order, items: created } = await ord.createOrder(
      req.user.id, lines, shippingAddress || {});

    // A promo code, if one was given and it is genuinely valid.
    let discount = 0;
    if (promoCode) {
      try { discount = await promos.claim(promoCode, Number(order.total_amount)); }
      catch { /* an invalid code simply doesn't apply */ }
    }

    await notify({
      userId: order.seller_id,
      type: 'order_placed',
      title: `New order · ${order.order_number}`,
      message: `${req.user.fullName} placed an order for GHS ${Number(order.total_amount).toLocaleString()}.`,
      link: '/dashboard',
    });

    res.status(201).json({
      order: ord.publicOrder({ ...order, items: created }),
      discount,
    });
  } catch (err: any) {
    const status = /INSUFFICIENT_STOCK/i.test(err.message) ? 409 : 400;
    const message = /INSUFFICIENT_STOCK/i.test(err.message)
      ? 'Sorry — one of those items just sold out. Please adjust your basket.'
      : err.message;
    res.status(status).json({ error: message });
  }
};

/** GET /api/orders — mine, as buyer or seller. */
export const myOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const as = req.query.as === 'seller' ? 'seller' : 'buyer';
    const orders = await ord.listFor(req.user.id, as, {
      status: req.query.status as string | undefined,
      limit: Number(req.query.limit) || 50,
    });
    res.json({ orders: orders.map(ord.publicOrder) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/orders/:id */
export const getOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const order = await ord.findById(req.params.id);
    if (!order) { res.status(404).json({ error: 'Order not found.' }); return; }
    if (order.buyer_id !== req.user.id && order.seller_id !== req.user.id
        && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Not your order.' }); return;
    }
    const items = await ord.getItems(order.id);
    res.json({ order: ord.publicOrder({ ...order, items }) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** POST /api/orders/:id/cancel — returns the stock to the shelf. */
export const cancelOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const order = await ord.cancelOrder(req.params.id, req.user.id);
    if (!order) { res.status(404).json({ error: 'Order not found.' }); return; }
    res.json({ order: ord.publicOrder(order) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

/** POST /api/orders/:id/status — the seller advances the order. */
export const updateOrderStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const order = await ord.setStatus(req.params.id, req.user.id, req.body.status);
    if (!order) { res.status(404).json({ error: 'Order not found, or not yours.' }); return; }
    await notify({
      userId: order.buyer_id, type: 'order_placed',
      title: `Order ${order.order_number} · ${order.status}`,
      message: `Your order is now ${order.status}.`, link: '/dashboard',
    });
    res.json({ order: ord.publicOrder(order) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

// ─── Extras ──────────────────────────────────────────────────────────────────
import { q } from '../db/pg';

export const getSellerOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orders = await ord.listFor(req.user.id, 'seller', {
      status: req.query.status as string | undefined, limit: 100,
    });
    res.json({ orders: orders.map(ord.publicOrder) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** Public tracking by order number — no login needed, so buyers can share a link. */
export const trackOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [row] = await q<any>(
      `SELECT o.order_number, o.status, o.payment_status, o.created_at,
              d.tracking_number, d.status AS delivery_status, d.eta_minutes,
              d.rider_lat, d.rider_lng, d.rider_location_text, d.delivered_at,
              r.full_name AS rider_name, r.phone AS rider_phone
         FROM orders o
         LEFT JOIN deliveries d ON d.order_id = o.id
         LEFT JOIN users r ON r.id = d.rider_id
        WHERE o.order_number = $1`,
      [req.params.orderNumber],
    );
    if (!row) { res.status(404).json({ error: 'No order with that number.' }); return; }
    res.json({ tracking: row });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** The buyer confirms the goods arrived — this releases escrow to the seller. */
export const confirmPaymentReceived = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const order = await ord.findById(req.params.id);
    if (!order) { res.status(404).json({ error: 'Order not found.' }); return; }
    if (order.buyer_id !== req.user.id) {
      res.status(403).json({ error: 'Only the buyer can confirm receipt.' }); return;
    }

    await q(
      `UPDATE payments SET escrow_state = 'released'
        WHERE order_id = $1::uuid AND purpose = 'order'
          AND status = 'paid' AND escrow_state = 'held'`,
      [order.id],
    );
    await q(`UPDATE orders SET status = 'delivered' WHERE id = $1::uuid`, [order.id]);

    await notify({
      userId: order.seller_id, type: 'payment_received',
      title: `Funds released · ${order.order_number}`,
      message: 'The buyer confirmed receipt. Your money is now available to withdraw.',
      link: '/wallet',
    });

    res.json({ message: 'Receipt confirmed. The seller has been paid.' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const getMyOrders = myOrders;
export const getOrderById = getOrder;
