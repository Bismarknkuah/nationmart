import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as mgmt from '../repos/managementRepo';

const isOfficer = (r: string) =>
  !['buyer', 'seller', 'rider', 'driver', 'reseller', 'wholesaler', 'manufacturer'].includes(r);

export const getPlatformStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    res.json(await mgmt.platformStats());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const getOfficeStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    res.json(await mgmt.officeStats());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const getRegionalOverview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    res.json(await mgmt.regionalOverview(mgmt.scopeFor(req.user)));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const getJurisdictionLogistics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    res.json(await mgmt.jurisdictionLogistics(mgmt.scopeFor(req.user)));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const financeOverview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!/finance|account|cfo|ceo|coo|admin/i.test(req.user.role)) {
      res.status(403).json({ error: 'Finance access required.' }); return;
    }
    res.json(await mgmt.financeOverview());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const listUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const users = await mgmt.listUsers(mgmt.scopeFor(req.user), {
      role: req.query.role as string | undefined,
      limit: Number(req.query.limit) || 100,
    });
    res.json({ users });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const approveUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const user = await mgmt.approveUser(req.params.id);
    if (!user) { res.status(404).json({ error: 'User not found.' }); return; }
    res.json({ message: `${user.full_name} approved.`, user });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

// ─── Staff, moderation and jurisdiction extras ───────────────────────────────
import { q } from '../db/pg';
import { hashPassword, generateUsername } from '../repos/userRepo';

export const listStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const staff = await q<any>(
      `SELECT id, full_name, email, phone, role, department, region, district,
              account_status, duty_status, created_at
         FROM users WHERE department IS NOT NULL
        ORDER BY department, full_name LIMIT 200`,
    );
    res.json({ staff });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const createStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!/admin|ceo|coo|hr/i.test(req.user.role)) { res.status(403).json({ error: 'Not authorized.' }); return; }
    const { fullName, email, phone, role, department, region, district, password } = req.body;
    if (!fullName || !email || !password) {
      res.status(400).json({ error: 'Name, email and a password are required.' }); return;
    }
    const rows = await q<any>(
      `INSERT INTO users (full_name, email, phone, username, password_hash, role,
                          department, region, district, address, country,
                          is_approved, account_status, accepted_terms, terms_accepted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'',$10,TRUE,'active',TRUE,now())
       RETURNING id, full_name, email, role, department`,
      [fullName, String(email).toLowerCase(), phone, await generateUsername(fullName),
       await hashPassword(password), role || 'officer', department ?? null,
       region ?? '', district ?? '', req.user.country || 'Ghana'],
    );
    await q(`INSERT INTO subscriptions (user_id, status, plan, amount)
             VALUES ($1::uuid, 'exempt', 'yearly', 0)`, [rows[0].id]).catch(() => {});
    res.status(201).json({ staff: rows[0] });
  } catch (err: any) {
    if (err?.code === '23505') { res.status(409).json({ error: 'That email is already in use.' }); return; }
    res.status(400).json({ error: err.message });
  }
};

export const updateStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!/admin|ceo|coo|hr/i.test(req.user.role)) { res.status(403).json({ error: 'Not authorized.' }); return; }
    const { role, department, region, district } = req.body;
    const rows = await q<any>(
      `UPDATE users SET
         role = COALESCE($2, role), department = COALESCE($3, department),
         region = COALESCE($4, region), district = COALESCE($5, district)
       WHERE id = $1::uuid RETURNING id, full_name, role, department`,
      [req.params.id, role ?? null, department ?? null, region ?? null, district ?? null],
    );
    if (!rows[0]) { res.status(404).json({ error: 'Staff member not found.' }); return; }
    res.json({ staff: rows[0] });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const bulkCreateStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!/admin|ceo|coo|hr/i.test(req.user.role)) { res.status(403).json({ error: 'Not authorized.' }); return; }
    const list = Array.isArray(req.body.staff) ? req.body.staff : [];
    const created: any[] = [];
    const failed: any[] = [];
    for (const s of list) {
      try {
        const rows = await q<any>(
          `INSERT INTO users (full_name, email, phone, username, password_hash, role,
                              department, region, district, address, country,
                              is_approved, account_status, accepted_terms, terms_accepted_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'','Ghana',TRUE,'active',TRUE,now())
           RETURNING id, full_name, email`,
          [s.fullName, String(s.email).toLowerCase(), s.phone,
           await generateUsername(s.fullName), await hashPassword(s.password || 'ChangeMe123'),
           s.role || 'officer', s.department ?? null, s.region ?? '', s.district ?? ''],
        );
        created.push(rows[0]);
      } catch (e: any) {
        failed.push({ email: s.email, error: e?.code === '23505' ? 'duplicate' : e.message });
      }
    }
    res.json({ created: created.length, failed, staff: created });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const moderateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const { status, reason } = req.body;
    if (!['active', 'suspended', 'flagged', 'pending_review'].includes(status)) {
      res.status(400).json({ error: 'Invalid status.' }); return;
    }
    const rows = await q<any>(
      `UPDATE users SET account_status = $2::account_status, pending_reason = $3
        WHERE id = $1::uuid RETURNING id, full_name, account_status`,
      [req.params.id, status, reason ?? null],
    );
    if (!rows[0]) { res.status(404).json({ error: 'User not found.' }); return; }
    await q(
      `INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, summary)
       VALUES ($1::uuid,$2,'user.moderated','user',$3,$4)`,
      [req.user.id, req.user.role, req.params.id, `${rows[0].full_name} → ${status}`],
    ).catch(() => {});
    res.json({ user: rows[0] });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const pendingRiders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const scope = mgmt.scopeFor(req.user);
    const riders = await q<any>(
      `SELECT id, full_name, email, phone, role, region, district,
              vehicle_license, ghana_card_status, created_at
         FROM users
        WHERE role IN ('rider','driver') AND is_approved = FALSE
          AND ($1::text IS NULL OR region = $1)
          AND ($2::text IS NULL OR district = $2)
        ORDER BY created_at ASC LIMIT 100`,
      [scope.level === 'national' ? null : scope.region ?? null,
       scope.level === 'district' ? scope.district ?? null : null],
    );
    res.json({ riders });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const approveRider = approveUser;

/** Approve every rider whose identity is verified and who has no upheld reports. */
export const aiApproveRiders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const approved = await q<any>(
      `UPDATE users u
          SET is_approved = TRUE, account_status = 'active', pending_reason = NULL
        WHERE u.role IN ('rider','driver')
          AND u.is_approved = FALSE
          AND u.ghana_card_status = 'verified'
          AND NOT EXISTS (
            SELECT 1 FROM reports r
             WHERE r.reported_user = u.id AND r.status = 'resolved')
        RETURNING id, full_name`,
    );
    res.json({
      approved: approved.length,
      riders: approved,
      note: 'Only riders with a verified Ghana Card and no upheld reports were approved.',
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** A risk read on one user, from their real history. */
export const userRisk = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const [row] = await q<any>(
      `SELECT u.full_name, u.role, u.account_status, u.ghana_card_status,
              (SELECT count(*) FROM reports r WHERE r.reported_user = u.id)      AS reports,
              (SELECT count(*) FROM reports r WHERE r.reported_user = u.id
                 AND r.status = 'resolved')                                      AS upheld,
              (SELECT count(*) FROM deliveries d WHERE d.rider_id = u.id
                 AND d.status = 'failed')                                        AS failed,
              (SELECT count(*) FROM audit_logs a WHERE a.actor_id = u.id
                 AND a.action = 'login.fail'
                 AND a.created_at > now() - INTERVAL '7 days')                   AS login_fails,
              (SELECT COALESCE(balance,0) FROM wallets w WHERE w.user_id = u.id) AS balance
         FROM users u WHERE u.id = $1::uuid`,
      [req.params.id],
    );
    if (!row) { res.status(404).json({ error: 'User not found.' }); return; }

    let risk = 0;
    if (row.ghana_card_status !== 'verified') risk += 25;
    risk += Math.min(30, Number(row.upheld) * 15);
    risk += Math.min(20, Number(row.failed) * 4);
    risk += Math.min(15, Number(row.login_fails) * 3);
    if (Number(row.balance) < 0) risk += 10;      // owes the platform
    risk = Math.min(100, risk);

    res.json({
      risk,
      level: risk >= 60 ? 'high' : risk >= 30 ? 'medium' : 'low',
      basis: {
        identityVerified: row.ghana_card_status === 'verified',
        reportsFiled: Number(row.reports),
        reportsUpheld: Number(row.upheld),
        failedDeliveries: Number(row.failed),
        failedLogins7d: Number(row.login_fails),
        walletBalance: Number(row.balance),
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const regionalIntelligence = getRegionalOverview;
export const migrateSubscriptions = async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({ message: 'Not needed on PostgreSQL — subscriptions are created with the user.' });
};

/** Officer applies a discount to a listing (e.g. a market-day promotion). */
export const applyDiscount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const pct = Math.max(0, Math.min(100, Number(req.body.discountPercent) || 0));
    const rows = await q<any>(
      `UPDATE products SET discount_percent = $2, promo_label = COALESCE($3, promo_label)
        WHERE id = $1::uuid RETURNING id, title, discount_percent, promo_label`,
      [req.params.id ?? req.body.productId, pct, req.body.promoLabel ?? null],
    );
    if (!rows[0]) { res.status(404).json({ error: 'Product not found.' }); return; }
    res.json({ product: rows[0] });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export { createStoreFor } from './storeController';
export { createPromo as createPromotion, deactivatePromo as togglePromo } from './promoController';

/** Suggest discounts for listings that aren't moving. */
export const discountRecommendations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const stale = await q<any>(
      `SELECT p.id, p.title, p.price_per_unit, p.view_count, p.available_quantity,
              p.created_at, s.name AS store
         FROM products p LEFT JOIN stores s ON s.id = p.store_id
        WHERE p.status = 'active'
          AND p.created_at < now() - INTERVAL '30 days'
          AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i.product_id = p.id)
        ORDER BY p.view_count DESC
        LIMIT 20`,
    );
    res.json({
      recommendations: stale.map((p) => ({
        product: p.id,
        title: p.title,
        store: p.store,
        views: p.view_count,
        // Plenty of views but no sales suggests the price is the problem.
        suggestedDiscount: Number(p.view_count) > 20 ? 15 : 10,
        reason: Number(p.view_count) > 20
          ? 'Viewed often but never bought — the price may be too high.'
          : 'Listed over a month with no sales.',
      })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** A month in review, for the executive team. */
export const aiMonthlyAnalysis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const [m] = await q<any>(
      `SELECT
         count(*) FILTER (WHERE payment_status = 'paid')                   AS orders,
         COALESCE(SUM(total_amount) FILTER (WHERE payment_status='paid'),0) AS gmv,
         count(DISTINCT buyer_id)                                          AS buyers,
         count(DISTINCT seller_id)                                         AS sellers
       FROM orders WHERE created_at > now() - INTERVAL '30 days'`,
    );
    const [prev] = await q<any>(
      `SELECT COALESCE(SUM(total_amount) FILTER (WHERE payment_status='paid'),0) AS gmv
         FROM orders
        WHERE created_at BETWEEN now() - INTERVAL '60 days' AND now() - INTERVAL '30 days'`,
    );

    const gmv = Number(m.gmv);
    const before = Number(prev.gmv);
    const growth = before > 0 ? Math.round(((gmv - before) / before) * 100) : null;

    res.json({
      period: 'Last 30 days',
      orders: Number(m.orders),
      gmv,
      buyers: Number(m.buyers),
      sellers: Number(m.sellers),
      growthPercent: growth,
      summary: growth === null
        ? `GHS ${gmv.toLocaleString()} across ${m.orders} paid orders.`
        : growth >= 0
          ? `GMV grew ${growth}% to GHS ${gmv.toLocaleString()}.`
          : `GMV fell ${Math.abs(growth)}% to GHS ${gmv.toLocaleString()} — worth a look.`,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const compileReports = aiMonthlyAnalysis;
export const financialSummary = financeOverview;
export const listActivity = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const logs = await q<any>(
      `SELECT a.action, a.summary, a.actor_role, a.created_at, u.full_name AS actor
         FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC LIMIT 100`,
    );
    res.json({ activity: logs });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export { reportUser } from './reportController';
export { setAccountStatus as deleteUser, getUser as enrollBuyer } from './userController';
