import { q, tx, money, postWalletTxnOnce } from '../db/pg';

/**
 * Payment repository — PostgreSQL.
 *
 * `settlePayment` is the single most safety-critical function in NationMart, so
 * it is built to be:
 *
 *   • IDEMPOTENT — Paystack retries webhooks. Settling the same reference twice
 *     must not pay the seller twice. The payment row is locked and re-checked
 *     inside the transaction, and the wallet posting is keyed on the reference.
 *
 *   • ATOMIC — marking the payment paid, flipping the order to paid, and
 *     crediting the seller's ledger all happen together, or not at all. There is
 *     no state where the buyer's money is taken but the seller was never credited.
 */

export const PLATFORM_COMMISSION_PERCENT = Number(process.env.PLATFORM_COMMISSION_PERCENT || 5);

export type PaymentRow = {
  id: string;
  reference: string;
  provider_ref: string | null;
  user_id: string;
  order_id: string | null;
  purpose: string;
  status: string;
  escrow_state: string;
  amount: string;
  currency: string;
  channel: string | null;
  created_at: Date;
  settled_at: Date | null;
};

export function generateReference(prefix = 'NM'): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 9000 + 1000)}`;
}

export interface CreatePaymentInput {
  userId: string;
  orderId?: string | null;
  purpose: 'order' | 'subscription' | 'wallet_topup';
  amount: number;
  channel?: string;
  reference?: string;
}

export async function createPayment(input: CreatePaymentInput): Promise<PaymentRow> {
  const reference = input.reference || generateReference();
  const rows = await q<PaymentRow>(
    `INSERT INTO payments (reference, user_id, order_id, purpose, status, amount, channel)
     VALUES ($1,$2::uuid,$3::uuid,$4::payment_purpose,'pending',$5::numeric,$6)
     RETURNING *`,
    [reference, input.userId, input.orderId ?? null, input.purpose,
     money(input.amount), input.channel ?? null],
  );
  return rows[0];
}

export async function findByReference(reference: string): Promise<PaymentRow | null> {
  const rows = await q<PaymentRow>(`SELECT * FROM payments WHERE reference = $1`, [reference]);
  return rows[0] ?? null;
}

export interface SettleResult {
  payment: PaymentRow;
  alreadySettled: boolean;   // true when a duplicate webhook was ignored
  sellerCredited: number;
  commission: number;
}

/**
 * Settle a successful payment.
 *
 * Order payments are held in ESCROW: the seller is credited in the ledger, but
 * the money is not released to them until the buyer confirms delivery. That is
 * what protects the buyer.
 *
 * Safe to call any number of times with the same reference.
 */
export async function settlePayment(
  reference: string,
  providerRef?: string,
): Promise<SettleResult | null> {
  return tx(async (c) => {
    // Lock the payment row so two concurrent webhooks serialise here.
    const { rows } = await c.query<PaymentRow>(
      `SELECT * FROM payments WHERE reference = $1 FOR UPDATE`, [reference],
    );
    const payment = rows[0];
    if (!payment) return null;

    // Already done — a retried webhook. Do nothing, report success.
    if (payment.status === 'paid') {
      return { payment, alreadySettled: true, sellerCredited: 0, commission: 0 };
    }

    const amount = Number(payment.amount);
    let sellerCredited = 0;
    let commission = 0;

    const { rows: updated } = await c.query<PaymentRow>(
      `UPDATE payments
          SET status = 'paid',
              settled_at = now(),
              provider_ref = COALESCE($2, provider_ref),
              escrow_state = CASE WHEN purpose = 'order' THEN 'held'::escrow_state
                                  ELSE escrow_state END
        WHERE id = $1::uuid
        RETURNING *`,
      [payment.id, providerRef ?? null],
    );

    if (payment.purpose === 'order' && payment.order_id) {
      const { rows: orderRows } = await c.query(
        `UPDATE orders
            SET payment_status = 'paid', status = 'confirmed', payment_ref = $2
          WHERE id = $1::uuid
          RETURNING seller_id, total_amount, order_number`,
        [payment.order_id, reference],
      );
      const order = orderRows[0];

      if (order) {
        // Ledger the seller's earning, less the platform commission.
        const gross = Number(order.total_amount);
        commission = Number(money((gross * PLATFORM_COMMISSION_PERCENT) / 100));
        sellerCredited = Number(money(gross - commission));

        // Keyed on the order number, so a duplicate can never double-credit.
        await c.query(
          `SELECT post_wallet_txn($1::uuid,'credit','sale_earning',$2::numeric,$3,$4)`,
          [order.seller_id, money(sellerCredited),
           `Sale ${order.order_number} (net of ${PLATFORM_COMMISSION_PERCENT}% commission)`,
           order.order_number],
        );
        await c.query(
          `SELECT post_wallet_txn($1::uuid,'debit','commission',$2::numeric,$3,$4)`,
          [order.seller_id, money(commission),
           `Platform commission on ${order.order_number}`, order.order_number],
        );
      }
    }

    if (payment.purpose === 'wallet_topup') {
      // A rider topping up to clear commission owed.
      await c.query(
        `SELECT post_wallet_txn($1::uuid,'credit','settlement',$2::numeric,$3,$4)`,
        [payment.user_id, money(amount), 'Mobile money top-up', reference],
      );
      sellerCredited = amount;
    }

    if (payment.purpose === 'subscription') {
      await c.query(
        `UPDATE subscriptions
            SET status = 'active',
                last_payment_ref = $2,
                last_paid_at = now(),
                current_period_end = GREATEST(
                  COALESCE(current_period_end, now()), now()) + INTERVAL '365 days'
          WHERE user_id = $1::uuid`,
        [payment.user_id, reference],
      );
    }

    return { payment: updated[0], alreadySettled: false, sellerCredited, commission };
  });
}

/**
 * Release escrow once the buyer has the goods. The seller's ledger was already
 * credited at settlement; this marks the money as theirs to withdraw.
 */
export async function releaseEscrow(orderId: string): Promise<boolean> {
  const rows = await q(
    `UPDATE payments
        SET escrow_state = 'released'
      WHERE order_id = $1::uuid AND purpose = 'order'
        AND status = 'paid' AND escrow_state = 'held'
      RETURNING id`,
    [orderId],
  );
  return rows.length > 0;
}

export async function refund(reference: string): Promise<PaymentRow | null> {
  return tx(async (c) => {
    const { rows } = await c.query<PaymentRow>(
      `SELECT * FROM payments WHERE reference = $1 FOR UPDATE`, [reference]);
    const payment = rows[0];
    if (!payment || payment.status !== 'paid') return null;

    const { rows: updated } = await c.query<PaymentRow>(
      `UPDATE payments SET status = 'refunded', escrow_state = 'refunded'
        WHERE id = $1::uuid RETURNING *`,
      [payment.id],
    );

    if (payment.order_id) {
      await c.query(
        `UPDATE orders SET payment_status = 'refunded', status = 'refunded'
          WHERE id = $1::uuid`,
        [payment.order_id],
      );
    }
    return updated[0];
  });
}

export async function myPayments(userId: string, limit = 50) {
  return q<any>(
    `SELECT p.*, o.order_number
       FROM payments p LEFT JOIN orders o ON o.id = p.order_id
      WHERE p.user_id = $1::uuid
      ORDER BY p.created_at DESC LIMIT $2`,
    [userId, limit],
  );
}

export function publicPayment(p: any) {
  return {
    _id: p.id,
    reference: p.reference,
    providerReference: p.provider_ref,
    purpose: p.purpose,
    status: p.status,
    escrowState: p.escrow_state,
    amount: Number(p.amount),
    currency: p.currency,
    channel: p.channel,
    orderNumber: p.order_number ?? null,
    createdAt: p.created_at,
    settledAt: p.settled_at,
  };
}

export { postWalletTxnOnce };
