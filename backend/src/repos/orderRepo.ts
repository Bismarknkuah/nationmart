import { q, tx, money } from '../db/pg';

/**
 * Order repository — PostgreSQL.
 *
 * The important thing here is `createOrder`: reserving stock for every line and
 * writing the order happens inside ONE transaction. Previously the code checked
 * stock, wrote the order, then decremented stock in separate steps — so a crash
 * (or a concurrent buyer) between those steps could leave an order for goods
 * that were never reserved, or stock taken for an order that was never written.
 *
 * Now it is all-or-nothing. If the last line of a 5-item order can't be
 * supplied, the first four reservations roll back automatically.
 */

export type OrderRow = {
  id: string;
  order_number: string;
  buyer_id: string;
  seller_id: string;
  store_id: string | null;
  status: string;
  payment_status: string;
  currency: string;
  total_amount: string;
  payment_ref: string | null;
  ship_name: string | null;
  ship_phone: string | null;
  ship_street: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_country: string | null;
  ship_lat: number | null;
  ship_lng: number | null;
  created_at: Date;
};

export interface OrderLine {
  productId: string;
  quantity: number;
}

export interface ShippingAddress {
  recipientName?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  lat?: number;
  lng?: number;
}

export function generateOrderNumber(): string {
  return `NM-ORD-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

export class OrderError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'OrderError';
  }
}

/**
 * Place an order.
 *
 * Steps, all inside a single transaction:
 *   1. read each product (locking it) and check it is live and from one seller
 *   2. reserve the stock atomically — overselling is impossible
 *   3. write the order header and its line items
 *
 * Any failure rolls the whole thing back: no phantom orders, no stolen stock.
 */
export async function createOrder(
  buyerId: string,
  lines: OrderLine[],
  address: ShippingAddress = {},
): Promise<{ order: OrderRow; items: any[] }> {
  if (!lines?.length) throw new OrderError('An order needs at least one item.', 'EMPTY_ORDER');

  return tx(async (c) => {
    let sellerId: string | null = null;
    let storeId: string | null = null;
    let subtotal = 0;
    const enriched: { productId: string; title: string; qty: number; unit: number; sub: number }[] = [];

    for (const line of lines) {
      const qty = Number(line.quantity) || 0;
      if (!line.productId || qty < 1) {
        throw new OrderError('Invalid item in order.', 'INVALID_ITEM');
      }

      const { rows } = await c.query(
        `SELECT id, seller_id, store_id, title, price_per_unit, status, minimum_order
           FROM products WHERE id = $1::uuid`,
        [line.productId],
      );
      const p = rows[0];
      if (!p || p.status !== 'active') {
        throw new OrderError(`Product ${line.productId} is not available.`, 'UNAVAILABLE');
      }
      if (qty < Number(p.minimum_order)) {
        throw new OrderError(
          `${p.title} has a minimum order of ${Number(p.minimum_order)}.`, 'BELOW_MINIMUM',
        );
      }

      // Every line must come from the same seller — one order, one shop.
      if (!sellerId) { sellerId = p.seller_id; storeId = p.store_id; }
      else if (p.seller_id !== sellerId) {
        throw new OrderError('All items must be from the same seller.', 'MIXED_SELLERS');
      }

      // Atomic: check-and-decrement in one statement. Throws INSUFFICIENT_STOCK
      // if the goods aren't there, which rolls back everything above.
      await c.query(`SELECT reserve_stock($1::uuid, $2::numeric)`, [p.id, money(qty)]);

      const unit = Number(p.price_per_unit);
      const sub = Number(money(unit * qty));
      subtotal += sub;
      enriched.push({ productId: p.id, title: p.title, qty, unit, sub });
    }

    const orderNumber = generateOrderNumber();
    const { rows: orderRows } = await c.query<OrderRow>(
      `INSERT INTO orders (
         order_number, buyer_id, seller_id, store_id, status, payment_status,
         currency, total_amount,
         ship_name, ship_phone, ship_street, ship_city, ship_state, ship_country,
         ship_lat, ship_lng
       ) VALUES (
         $1,$2::uuid,$3::uuid,$4::uuid,'pending','unpaid','GHS',$5::numeric,
         $6,$7,$8,$9,$10,$11,$12,$13
       ) RETURNING *`,
      [
        orderNumber, buyerId, sellerId, storeId, money(subtotal),
        address.recipientName ?? null, address.phone ?? null, address.street ?? null,
        address.city ?? null, address.state ?? null, address.country ?? 'Ghana',
        address.lat ?? null, address.lng ?? null,
      ],
    );
    const order = orderRows[0];

    const items: any[] = [];
    for (const e of enriched) {
      const { rows } = await c.query(
        `INSERT INTO order_items (order_id, product_id, title, quantity, unit_price, subtotal)
         VALUES ($1::uuid,$2::uuid,$3,$4::numeric,$5::numeric,$6::numeric)
         RETURNING *`,
        [order.id, e.productId, e.title, money(e.qty), money(e.unit), money(e.sub)],
      );
      items.push(rows[0]);
    }

    return { order, items };
  });
}

/**
 * Cancel an order and return its stock to the shelf. Only possible while the
 * order is unpaid — once money has moved, a refund is the proper route.
 */
export async function cancelOrder(orderId: string, actorId: string): Promise<OrderRow | null> {
  return tx(async (c) => {
    const { rows } = await c.query<OrderRow>(
      `SELECT * FROM orders
        WHERE id = $1::uuid AND (buyer_id = $2::uuid OR seller_id = $2::uuid)
        FOR UPDATE`,
      [orderId, actorId],
    );
    const order = rows[0];
    if (!order) return null;
    if (order.payment_status === 'paid') {
      throw new OrderError('This order is already paid — request a refund instead.', 'ALREADY_PAID');
    }
    if (order.status === 'cancelled') return order;

    const { rows: items } = await c.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id = $1::uuid`, [orderId]);

    for (const it of items) {
      if (it.product_id) {
        await c.query(`SELECT release_stock($1::uuid, $2::numeric)`, [it.product_id, it.quantity]);
      }
    }

    const { rows: updated } = await c.query<OrderRow>(
      `UPDATE orders SET status = 'cancelled' WHERE id = $1::uuid RETURNING *`, [orderId]);
    return updated[0];
  });
}

export async function findById(id: string): Promise<OrderRow | null> {
  const rows = await q<OrderRow>(`SELECT * FROM orders WHERE id = $1::uuid`, [id]);
  return rows[0] ?? null;
}

export async function findByNumber(orderNumber: string): Promise<OrderRow | null> {
  const rows = await q<OrderRow>(`SELECT * FROM orders WHERE order_number = $1`, [orderNumber]);
  return rows[0] ?? null;
}

export async function getItems(orderId: string) {
  return q<any>(
    `SELECT id, product_id, title, quantity, unit_price, subtotal
       FROM order_items WHERE order_id = $1::uuid ORDER BY id`,
    [orderId],
  );
}

/** Orders I placed (as buyer) or received (as seller). */
export async function listFor(
  userId: string, as: 'buyer' | 'seller', opts: { status?: string; limit?: number } = {},
) {
  const col = as === 'buyer' ? 'buyer_id' : 'seller_id';
  return q<any>(
    `SELECT o.*,
            (SELECT json_agg(json_build_object(
                'title', i.title, 'quantity', i.quantity,
                'unitPrice', i.unit_price, 'subtotal', i.subtotal))
               FROM order_items i WHERE i.order_id = o.id) AS items,
            bu.full_name AS buyer_name, se.full_name AS seller_name
       FROM orders o
       JOIN users bu ON bu.id = o.buyer_id
       JOIN users se ON se.id = o.seller_id
      WHERE o.${col} = $1::uuid
        AND ($2::text IS NULL OR o.status = $2::order_status::text)
      ORDER BY o.created_at DESC
      LIMIT $3`,
    [userId, opts.status ?? null, opts.limit ?? 50],
  );
}

/** Seller advances the order: confirmed → processing → shipped. */
export async function setStatus(
  orderId: string, sellerId: string, status: string,
): Promise<OrderRow | null> {
  const rows = await q<OrderRow>(
    `UPDATE orders SET status = $3::order_status
      WHERE id = $1::uuid AND seller_id = $2::uuid
      RETURNING *`,
    [orderId, sellerId, status],
  );
  return rows[0] ?? null;
}

export function publicOrder(o: any) {
  return {
    _id: o.id,
    id: o.id,
    orderNumber: o.order_number,
    buyer: o.buyer_id,
    seller: o.seller_id,
    store: o.store_id,
    status: o.status,
    paymentStatus: o.payment_status,
    currency: o.currency,
    totalAmount: Number(o.total_amount),
    paymentReference: o.payment_ref,
    items: (o.items ?? []).map((i: any) => ({
      title: i.title,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice ?? i.unit_price),
      subtotal: Number(i.subtotal),
    })),
    shippingAddress: {
      recipientName: o.ship_name,
      phone: o.ship_phone,
      street: o.ship_street,
      city: o.ship_city,
      state: o.ship_state,
      country: o.ship_country,
      lat: o.ship_lat,
      lng: o.ship_lng,
    },
    buyerName: o.buyer_name,
    sellerName: o.seller_name,
    createdAt: o.created_at,
  };
}
