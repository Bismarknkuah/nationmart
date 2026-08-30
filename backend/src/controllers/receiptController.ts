import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as ord from '../repos/orderRepo';
import { q } from '../db/pg';

/** GET /api/receipts/:orderId — an itemised receipt for buyer or seller. */
export const getReceipt = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [row] = await q<any>(
      `SELECT o.*, b.full_name AS buyer_name, b.phone AS buyer_phone,
              s.full_name AS seller_name, st.name AS store_name,
              p.reference, p.status AS payment_state, p.settled_at
         FROM orders o
         JOIN users b ON b.id = o.buyer_id
         JOIN users s ON s.id = o.seller_id
         LEFT JOIN stores st ON st.id = o.store_id
         LEFT JOIN payments p ON p.order_id = o.id AND p.purpose = 'order'
        WHERE o.id = $1::uuid`,
      [req.params.orderId],
    );
    if (!row) { res.status(404).json({ error: 'Order not found.' }); return; }
    if (row.buyer_id !== req.user.id && row.seller_id !== req.user.id
        && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Not your order.' }); return;
    }

    const items = await ord.getItems(row.id);
    res.json({
      receipt: {
        orderNumber: row.order_number,
        issuedAt: row.settled_at ?? row.created_at,
        paymentReference: row.reference,
        paymentStatus: row.payment_state ?? row.payment_status,
        buyer: { name: row.buyer_name, phone: row.buyer_phone },
        seller: { name: row.seller_name, store: row.store_name },
        items: items.map((i: any) => ({
          title: i.title,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unit_price),
          subtotal: Number(i.subtotal),
        })),
        total: Number(row.total_amount),
        currency: row.currency,
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const trackOrder = getReceipt;

export const generateReceipt = getReceipt;
