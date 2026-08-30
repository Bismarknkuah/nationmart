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

// ─── Payment management console ──────────────────────────────────────────────

/**
 * The money dashboard for finance/exec: what the platform has earned, what's
 * held in escrow, what's owed out, and what's in flight. Read-only and derived
 * entirely from the ledger and payments table, so it can never itself move money.
 */
export async function paymentOverview() {
  const [row] = await q<any>(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND purpose = 'order'), 0)   AS gmv,
       COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)                          AS total_in,
       COALESCE(SUM(amount) FILTER (WHERE status = 'refunded'), 0)                      AS refunded,
       COALESCE(SUM(amount) FILTER (WHERE escrow_state = 'held'), 0)                    AS escrow_held,
       count(*) FILTER (WHERE status = 'paid')                                          AS paid_count,
       count(*) FILTER (WHERE status = 'pending')                                       AS pending_count,
       count(*) FILTER (WHERE status = 'failed')                                        AS failed_count,
       count(*) FILTER (WHERE status = 'refunded')                                      AS refunded_count
     FROM payments`,
  );

  // Commission the platform earned. It's booked as a 'commission' debit on the
  // seller's wallet at settlement (the seller keeps sale-minus-commission), so
  // the sum of those debits is exactly what the platform took.
  const [comm] = await q<any>(
    `SELECT COALESCE(SUM(amount), 0) AS commission
       FROM wallet_transactions
      WHERE category = 'commission' AND type = 'debit'`,
  );

  // Payouts in flight and completed.
  const [pay] = await q<any>(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE status IN ('pending','processing')), 0) AS in_flight_value,
       count(*) FILTER (WHERE status IN ('pending','processing'))                 AS in_flight_count,
       COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)                    AS paid_out,
       count(*) FILTER (WHERE status = 'failed')                                  AS failed_payouts
     FROM payouts`,
  );

  // Channel split for paid payments.
  const channels = await q<any>(
    `SELECT COALESCE(channel, 'unknown') AS channel, count(*) AS n,
            COALESCE(SUM(amount), 0) AS value
       FROM payments WHERE status = 'paid'
      GROUP BY channel ORDER BY value DESC`,
  );

  return {
    gmv: Number(row.gmv),
    totalIn: Number(row.total_in),
    commissionEarned: Number(comm.commission),
    refunded: Number(row.refunded),
    escrowHeld: Number(row.escrow_held),
    payouts: {
      inFlightValue: Number(pay.in_flight_value),
      inFlightCount: Number(pay.in_flight_count),
      paidOut: Number(pay.paid_out),
      failed: Number(pay.failed_payouts),
    },
    counts: {
      paid: Number(row.paid_count),
      pending: Number(row.pending_count),
      failed: Number(row.failed_count),
      refunded: Number(row.refunded_count),
    },
    channels: channels.map((c) => ({ channel: c.channel, count: Number(c.n), value: Number(c.value) })),
  };
}

/** Recent payments, newest first, for the transaction feed. */
export async function recentTransactions(opts: { status?: string; limit?: number } = {}) {
  const limit = Math.min(Number(opts.limit) || 30, 100);
  const rows = await q<any>(
    `SELECT p.reference, p.provider_ref, p.purpose, p.status, p.escrow_state,
            p.amount, p.currency, p.channel, p.created_at, p.settled_at,
            o.order_number, u.full_name AS payer_name
       FROM payments p
       LEFT JOIN orders o ON o.id = p.order_id
       LEFT JOIN users u ON u.id = p.user_id
      WHERE ($1::text IS NULL OR p.status::text = $1)
      ORDER BY p.created_at DESC
      LIMIT $2`,
    [opts.status ?? null, limit],
  );
  return rows.map((r) => ({
    reference: r.reference,
    providerRef: r.provider_ref,
    purpose: r.purpose,
    status: r.status,
    escrowState: r.escrow_state,
    amount: Number(r.amount),
    currency: r.currency,
    channel: r.channel,
    orderNumber: r.order_number,
    payerName: r.payer_name,
    createdAt: r.created_at,
    settledAt: r.settled_at,
  }));
}
