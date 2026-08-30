import { q, tx, money } from '../db/pg';
import { notify, notifyMany } from './notificationRepo';

/**
 * Disputes & refunds — PostgreSQL.
 *
 * Escrow only protects a buyer if they can contest a delivery. This is that
 * mechanism.
 *
 * The rule that matters: while a dispute is OPEN, escrow on that order is frozen
 * by a database trigger. A rider marking a parcel "delivered" does not pay the
 * seller if the buyer says it never came. The application cannot forget this,
 * because the application is not the one enforcing it.
 */

export type DisputeStatus =
  | 'open' | 'investigating' | 'resolved_buyer' | 'resolved_seller' | 'withdrawn';

export type DisputeReason =
  | 'not_delivered' | 'wrong_item' | 'damaged' | 'not_as_described'
  | 'quantity_short' | 'late' | 'other';

export type DisputeRow = {
  id: string;
  reference: string;
  order_id: string;
  delivery_id: string | null;
  raised_by: string;
  against_user: string;
  reason: string;
  status: string;
  details: string;
  claim_amount: string;
  refund_amount: string;
  resolved_by: string | null;
  resolution: string | null;
  resolved_at: Date | null;
  due_at: Date;
  created_at: Date;
};

/** How long a buyer has to raise a dispute after delivery. */
export const DISPUTE_WINDOW_DAYS = Number(process.env.DISPUTE_WINDOW_DAYS || 7);

export class DisputeError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'DisputeError';
  }
}

function reference(): string {
  return `NM-DSP-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

// ─── Raising ─────────────────────────────────────────────────────────────────

export interface RaiseInput {
  orderId: string;
  raisedBy: string;
  reason?: DisputeReason;
  details?: string;
  claimAmount?: number;      // defaults to the whole order
}

/**
 * Open a dispute.
 *
 * Only the buyer on a PAID order may do this, and only inside the dispute
 * window. The moment it exists, the escrow trigger freezes the seller's money.
 */
export async function raise(input: RaiseInput): Promise<DisputeRow> {
  return tx(async (c) => {
    const { rows: orderRows } = await c.query(
      `SELECT o.*, d.id AS delivery_id, d.delivered_at, d.status AS delivery_status
         FROM orders o
         LEFT JOIN deliveries d ON d.order_id = o.id
        WHERE o.id = $1::uuid
        FOR UPDATE OF o`,
      [input.orderId],
    );
    const order = orderRows[0];
    if (!order) throw new DisputeError('Order not found.', 'NO_ORDER');

    if (order.buyer_id !== input.raisedBy) {
      throw new DisputeError('Only the buyer can raise a dispute.', 'NOT_BUYER');
    }
    if (order.payment_status !== 'paid') {
      throw new DisputeError(
        'This order was never paid, so there is nothing to dispute. Cancel it instead.',
        'NOT_PAID',
      );
    }

    // The window runs from delivery, or from the order if it never arrived.
    const from = order.delivered_at ? new Date(order.delivered_at) : new Date(order.created_at);
    const ageDays = (Date.now() - from.getTime()) / 86_400_000;
    if (ageDays > DISPUTE_WINDOW_DAYS) {
      throw new DisputeError(
        `Disputes must be raised within ${DISPUTE_WINDOW_DAYS} days.`,
        'WINDOW_CLOSED',
      );
    }

    const total = Number(order.total_amount);
    const claim = input.claimAmount != null
      ? Math.min(Number(input.claimAmount), total)
      : total;
    if (claim <= 0) throw new DisputeError('The claim must be more than zero.', 'BAD_CLAIM');

    let dispute: DisputeRow;
    try {
      const { rows } = await c.query<DisputeRow>(
        `INSERT INTO disputes (
           reference, order_id, delivery_id, raised_by, against_user,
           reason, details, claim_amount
         ) VALUES ($1,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::dispute_reason,$7,$8::numeric)
         RETURNING *`,
        [
          reference(), order.id, order.delivery_id ?? null,
          input.raisedBy, order.seller_id,
          input.reason ?? 'other', input.details ?? '', money(claim),
        ],
      );
      dispute = rows[0];
    } catch (err: any) {
      // The partial unique index caught a second live dispute on the same order.
      if (err?.code === '23505') {
        throw new DisputeError(
          'There is already an open dispute on this order.', 'ALREADY_OPEN',
        );
      }
      throw err;
    }

    // If the seller's money was already released, pull it back into escrow so it
    // cannot be withdrawn while this is being decided.
    await c.query(
      `UPDATE payments SET escrow_state = 'held'
        WHERE order_id = $1::uuid AND purpose = 'order'
          AND status = 'paid' AND escrow_state = 'released'`,
      [order.id],
    );

    return dispute;
  }).then(async (dispute) => {
    await notifyMany([dispute.against_user], {
      type: 'system',
      title: `⚠️ Dispute opened · ${dispute.reference}`,
      message:
        `A buyer has disputed an order (${dispute.reason.replace(/_/g, ' ')}). ` +
        `Your payment is held until this is settled. Please add your evidence.`,
      link: '/disputes',
    });
    await notify({
      userId: dispute.raised_by,
      type: 'system',
      title: `Dispute opened · ${dispute.reference}`,
      message: 'We have frozen the seller’s payment. An officer will review this shortly.',
      link: '/disputes',
    });
    return dispute;
  });
}

// ─── Evidence ────────────────────────────────────────────────────────────────

export async function addEvidence(
  disputeId: string, authorId: string, authorRole: string,
  body: string, attachmentUrl?: string,
) {
  if (!body?.trim()) throw new DisputeError('Evidence cannot be empty.', 'EMPTY');

  // Only the two parties, or an officer, may file.
  const [d] = await q<DisputeRow>(`SELECT * FROM disputes WHERE id = $1::uuid`, [disputeId]);
  if (!d) throw new DisputeError('Dispute not found.', 'NOT_FOUND');

  const isParty = d.raised_by === authorId || d.against_user === authorId;
  const isOfficer = !['buyer', 'seller', 'rider', 'driver'].includes(authorRole);
  if (!isParty && !isOfficer) {
    throw new DisputeError('You are not part of this dispute.', 'NOT_PARTY');
  }
  if (['resolved_buyer', 'resolved_seller', 'withdrawn'].includes(d.status)) {
    throw new DisputeError('This dispute is already closed.', 'CLOSED');
  }

  const rows = await q<any>(
    `INSERT INTO dispute_evidence (dispute_id, author_id, author_role, body, attachment_url)
     VALUES ($1::uuid,$2::uuid,$3,$4,$5) RETURNING *`,
    [disputeId, authorId, authorRole, body.trim(), attachmentUrl ?? null],
  );

  // Tell the other side something was filed.
  const other = d.raised_by === authorId ? d.against_user : d.raised_by;
  await notify({
    userId: other, type: 'system',
    title: `New evidence · ${d.reference}`,
    message: body.trim().slice(0, 120),
    link: '/disputes',
  });

  return rows[0];
}

export async function getEvidence(disputeId: string) {
  return q<any>(
    `SELECT e.id, e.body, e.attachment_url, e.author_role, e.created_at,
            u.full_name AS author_name
       FROM dispute_evidence e JOIN users u ON u.id = e.author_id
      WHERE e.dispute_id = $1::uuid
      ORDER BY e.created_at ASC`,
    [disputeId],
  );
}

// ─── Resolution ──────────────────────────────────────────────────────────────

export interface ResolveInput {
  disputeId: string;
  officerId: string;
  outcome: 'refund_buyer' | 'favour_seller';
  refundAmount?: number;     // for a partial refund; defaults to the full claim
  resolution: string;
}

/**
 * Decide a dispute.
 *
 * On `refund_buyer` the ledger is REVERSED atomically: the seller is debited,
 * the platform gives back its commission, and the buyer is credited. On
 * `favour_seller` the freeze lifts and escrow releases as normal.
 *
 * Either way it happens once — a second call finds a closed dispute and stops.
 */
export async function resolve(input: ResolveInput): Promise<DisputeRow> {
  if (!input.resolution?.trim()) {
    throw new DisputeError('A resolution note is required — say why.', 'NO_REASON');
  }

  const result = await tx(async (c) => {
    const { rows } = await c.query<DisputeRow>(
      `SELECT * FROM disputes WHERE id = $1::uuid FOR UPDATE`, [input.disputeId]);
    const d = rows[0];
    if (!d) throw new DisputeError('Dispute not found.', 'NOT_FOUND');

    if (!['open', 'investigating'].includes(d.status)) {
      throw new DisputeError('This dispute is already closed.', 'ALREADY_CLOSED');
    }

    let refunded = 0;

    if (input.outcome === 'refund_buyer') {
      const claim = Number(d.claim_amount);
      refunded = input.refundAmount != null
        ? Math.min(Number(input.refundAmount), claim)
        : claim;

      if (refunded > 0) {
        // Reverse the ledger. Idempotent on the dispute reference.
        await c.query(`SELECT settle_dispute_refund($1::uuid, $2::numeric)`,
          [d.id, money(refunded)]);
      }

      await c.query(
        `UPDATE disputes
            SET status = 'resolved_buyer', refund_amount = $2::numeric,
                resolved_by = $3::uuid, resolved_at = now(), resolution = $4
          WHERE id = $1::uuid`,
        [d.id, money(refunded), input.officerId, input.resolution.trim()],
      );
    } else {
      // The seller was right. Close it first so the freeze trigger lets go…
      await c.query(
        `UPDATE disputes
            SET status = 'resolved_seller', refund_amount = 0,
                resolved_by = $2::uuid, resolved_at = now(), resolution = $3
          WHERE id = $1::uuid`,
        [d.id, input.officerId, input.resolution.trim()],
      );

      // …then release the money that was being held.
      await c.query(
        `UPDATE payments SET escrow_state = 'released'
          WHERE order_id = $1::uuid AND purpose = 'order'
            AND status = 'paid' AND escrow_state = 'held'`,
        [d.order_id],
      );
    }

    const { rows: fresh } = await c.query<DisputeRow>(
      `SELECT * FROM disputes WHERE id = $1::uuid`, [d.id]);
    return { dispute: fresh[0], refunded };
  });

  const { dispute, refunded } = result;

  if (input.outcome === 'refund_buyer') {
    await notify({
      userId: dispute.raised_by, type: 'system',
      title: `✅ Dispute upheld · ${dispute.reference}`,
      message: `You have been refunded GHS ${refunded.toLocaleString()}. It is in your wallet.`,
      link: '/wallet',
    });
    await notify({
      userId: dispute.against_user, type: 'system',
      title: `Dispute decided against you · ${dispute.reference}`,
      message:
        `GHS ${refunded.toLocaleString()} has been refunded to the buyer. ` +
        `Reason: ${input.resolution.trim()}`,
      link: '/wallet',
    });
  } else {
    await notify({
      userId: dispute.against_user, type: 'payment_received',
      title: `✅ Dispute closed in your favour · ${dispute.reference}`,
      message: 'Your payment has been released and is available to withdraw.',
      link: '/wallet',
    });
    await notify({
      userId: dispute.raised_by, type: 'system',
      title: `Dispute closed · ${dispute.reference}`,
      message: `The officer found in the seller's favour. Reason: ${input.resolution.trim()}`,
      link: '/disputes',
    });
  }

  return dispute;
}

/** The buyer changes their mind. This lifts the freeze. */
export async function withdraw(disputeId: string, buyerId: string): Promise<DisputeRow | null> {
  return tx(async (c) => {
    const { rows } = await c.query<DisputeRow>(
      `UPDATE disputes SET status = 'withdrawn', resolved_at = now()
        WHERE id = $1::uuid AND raised_by = $2::uuid
          AND status IN ('open','investigating')
        RETURNING *`,
      [disputeId, buyerId],
    );
    const d = rows[0];
    if (!d) return null;

    // The freeze is gone; if the goods were delivered, pay the seller.
    await c.query(
      `UPDATE payments p SET escrow_state = 'released'
        WHERE p.order_id = $1::uuid AND p.purpose = 'order'
          AND p.status = 'paid' AND p.escrow_state = 'held'
          AND EXISTS (SELECT 1 FROM deliveries dl
                       WHERE dl.order_id = $1::uuid AND dl.status = 'delivered')`,
      [d.order_id],
    );
    return d;
  });
}

/** An officer picks it up. */
export async function claimForReview(disputeId: string, officerId: string) {
  const rows = await q<DisputeRow>(
    `UPDATE disputes SET status = 'investigating'
      WHERE id = $1::uuid AND status = 'open'
      RETURNING *`,
    [disputeId],
  );
  return rows[0] ?? null;
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export async function findById(id: string): Promise<DisputeRow | null> {
  const rows = await q<DisputeRow>(`SELECT * FROM disputes WHERE id = $1::uuid`, [id]);
  return rows[0] ?? null;
}

/** Disputes I'm involved in, either side. */
export async function mine(userId: string) {
  return q<any>(
    `SELECT d.*, o.order_number, o.total_amount,
            rb.full_name AS raised_by_name,
            ag.full_name AS against_name,
            (SELECT count(*) FROM dispute_evidence e WHERE e.dispute_id = d.id) AS evidence_count
       FROM disputes d
       JOIN orders o  ON o.id = d.order_id
       JOIN users rb  ON rb.id = d.raised_by
       JOIN users ag  ON ag.id = d.against_user
      WHERE d.raised_by = $1::uuid OR d.against_user = $1::uuid
      ORDER BY d.created_at DESC
      LIMIT 50`,
    [userId],
  );
}

/** The officer queue: oldest and most overdue first. */
export async function queue(status?: string) {
  return q<any>(
    `SELECT d.*, o.order_number, o.total_amount,
            rb.full_name AS raised_by_name, rb.phone AS raised_by_phone,
            ag.full_name AS against_name, ag.phone AS against_phone,
            (SELECT count(*) FROM dispute_evidence e WHERE e.dispute_id = d.id) AS evidence_count,
            (d.due_at < now()) AS overdue
       FROM disputes d
       JOIN orders o ON o.id = d.order_id
       JOIN users rb ON rb.id = d.raised_by
       JOIN users ag ON ag.id = d.against_user
      WHERE ($1::text IS NULL OR d.status::text = $1)
      ORDER BY (d.due_at < now()) DESC, d.due_at ASC
      LIMIT 100`,
    [status ?? null],
  );
}

/**
 * A seller's dispute record — this is what buyers deserve to see, and what
 * should feed the trust score. A shop that loses many disputes is a shop to
 * avoid.
 */
export async function sellerRecord(sellerId: string) {
  const [row] = await q<any>(
    `SELECT
       count(*)                                              AS total,
       count(*) FILTER (WHERE status = 'resolved_buyer')     AS lost,
       count(*) FILTER (WHERE status = 'resolved_seller')    AS won,
       count(*) FILTER (WHERE status IN ('open','investigating')) AS open,
       COALESCE(SUM(refund_amount), 0)                       AS refunded
     FROM disputes WHERE against_user = $1::uuid`,
    [sellerId],
  );
  const [orders] = await q<any>(
    `SELECT count(*) AS n FROM orders
      WHERE seller_id = $1::uuid AND payment_status = 'paid'`,
    [sellerId],
  );

  const total = Number(row.total);
  const sales = Number(orders.n);

  return {
    total,
    lost: Number(row.lost),
    won: Number(row.won),
    open: Number(row.open),
    refunded: Number(row.refunded),
    paidOrders: sales,
    // The number that actually matters to a buyer.
    disputeRatePercent: sales > 0 ? Number(((total / sales) * 100).toFixed(1)) : 0,
  };
}

/** Anything past its SLA and still undecided. */
export async function overdue() {
  return q<any>(
    `SELECT d.*, o.order_number,
            EXTRACT(DAY FROM now() - d.due_at)::int AS days_late
       FROM disputes d JOIN orders o ON o.id = d.order_id
      WHERE d.status IN ('open','investigating') AND d.due_at < now()
      ORDER BY d.due_at ASC
      LIMIT 50`,
  );
}

export function publicDispute(d: any) {
  return {
    _id: d.id,
    id: d.id,
    reference: d.reference,
    order: d.order_id,
    orderNumber: d.order_number,
    delivery: d.delivery_id,
    raisedBy: d.raised_by,
    raisedByName: d.raised_by_name,
    against: d.against_user,
    againstName: d.against_name,
    reason: d.reason,
    status: d.status,
    details: d.details,
    claimAmount: Number(d.claim_amount),
    refundAmount: Number(d.refund_amount),
    resolution: d.resolution,
    resolvedAt: d.resolved_at,
    dueAt: d.due_at,
    overdue: d.overdue ?? undefined,
    evidenceCount: d.evidence_count != null ? Number(d.evidence_count) : undefined,
    createdAt: d.created_at,
  };
}
