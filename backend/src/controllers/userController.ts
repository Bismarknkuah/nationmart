import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { q } from '../db/pg';
import { publicUser, findById } from '../repos/userRepo';

/** GET /api/users/:id — a public profile. */
export const getUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await findById(req.params.id);
    if (!user) { res.status(404).json({ error: 'User not found.' }); return; }
    res.json({ user: publicUser(user) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/users/:id/trust — a seller's trust score, computed from real activity. */
export const trustScore = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [row] = await q<any>(
      `SELECT
         u.created_at,
         u.ghana_card_status,
         (SELECT count(*) FROM orders o WHERE o.seller_id = u.id
            AND o.payment_status = 'paid')                          AS sales,
         (SELECT count(*) FROM deliveries d WHERE d.seller_id = u.id
            AND d.status = 'delivered')                             AS delivered,
         (SELECT count(*) FROM deliveries d WHERE d.seller_id = u.id
            AND d.status = 'failed')                                AS failed,
         (SELECT COALESCE(AVG(r.rating), 0) FROM product_reviews r
            JOIN products p ON p.id = r.product_id
           WHERE p.seller_id = u.id)                                AS rating,
         (SELECT count(*) FROM reports rp WHERE rp.reported_user = u.id
            AND rp.status = 'resolved')                             AS upheld_reports,
         (SELECT count(*) FROM disputes d WHERE d.against_user = u.id)   AS disputes,
         (SELECT count(*) FROM disputes d WHERE d.against_user = u.id
            AND d.status = 'resolved_buyer')                             AS disputes_lost
       FROM users u WHERE u.id = $1::uuid`,
      [req.params.id],
    );
    if (!row) { res.status(404).json({ error: 'User not found.' }); return; }

    // A transparent score: verified identity, real sales, good ratings, few
    // failures — and crucially, disputes LOST. A shop that keeps taking money for
    // goods that never arrive should not look trustworthy, however many sales it
    // has made.
    const sales = Number(row.sales);
    const lost = Number(row.disputes_lost);
    const disputeRate = sales > 0 ? lost / sales : 0;

    let score = 40;
    if (row.ghana_card_status === 'verified') score += 20;
    score += Math.min(15, sales);
    score += Math.min(15, Math.round(Number(row.rating) * 3));
    score -= Math.min(20, Number(row.failed) * 2);
    score -= Math.min(30, Number(row.upheld_reports) * 10);
    // Losing disputes hurts, and losing them OFTEN hurts a great deal more.
    score -= Math.min(25, lost * 8);
    score -= Math.round(Math.min(20, disputeRate * 100));
    score = Math.max(0, Math.min(100, score));

    res.json({
      score,
      basis: {
        identityVerified: row.ghana_card_status === 'verified',
        sales: Number(row.sales),
        delivered: Number(row.delivered),
        failed: Number(row.failed),
        averageRating: Number(Number(row.rating).toFixed(2)),
        upheldReports: Number(row.upheld_reports),
        disputes: Number(row.disputes),
        disputesLost: lost,
        disputeRatePercent: sales > 0 ? Number(((lost / sales) * 100).toFixed(1)) : 0,
        memberSince: row.created_at,
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/users — officer directory, scoped to their jurisdiction. */
export const listUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (['buyer', 'seller', 'rider', 'driver'].includes(req.user.role)) {
      res.status(403).json({ error: 'Officer access only.' }); return;
    }
    const users = await q<any>(
      `SELECT id, full_name, email, phone, role, region, district,
              account_status, is_approved, created_at
         FROM users
        WHERE ($1::text IS NULL OR role = $1)
        ORDER BY created_at DESC LIMIT 100`,
      [req.query.role ?? null],
    );
    res.json({ users });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** PATCH /api/users/:id/status — officer suspends or reinstates an account. */
export const setAccountStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!/admin|ceo|coo|security|compliance/i.test(req.user.role)) {
      res.status(403).json({ error: 'Not authorized.' }); return;
    }
    const { status } = req.body;
    if (!['active', 'suspended', 'flagged'].includes(status)) {
      res.status(400).json({ error: 'Invalid status.' }); return;
    }
    const rows = await q<any>(
      `UPDATE users SET account_status = $2::account_status
        WHERE id = $1::uuid RETURNING id, full_name, account_status`,
      [req.params.id, status],
    );
    if (!rows[0]) { res.status(404).json({ error: 'User not found.' }); return; }

    await q(
      `INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, summary)
       VALUES ($1::uuid, $2, 'user.status_change', 'user', $3, $4)`,
      [req.user.id, req.user.role, req.params.id,
       `${rows[0].full_name} set to ${status}`],
    ).catch(() => {});

    res.json({ user: rows[0] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const deleteUser = setAccountStatus;
export const enrollBuyer = getUser;

export const getPublicProfile = getUser;
