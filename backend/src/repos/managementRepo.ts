import { q } from '../db/pg';

/**
 * Management & reporting — PostgreSQL.
 *
 * This is where the move genuinely pays for itself. Each executive dashboard
 * that used to be a hand-rolled MongoDB aggregation pipeline (fetch, loop in
 * JavaScript, reduce, hope) is now ONE SQL query that the database plans and
 * executes against real indexes.
 *
 * Jurisdiction scoping is central: a district officer sees only their district,
 * a regional officer only their region, national roles see everything. That is
 * expressed once, as a WHERE clause, rather than being re-implemented per report.
 */

export type Scope = { level: 'national' | 'regional' | 'district'; region?: string; district?: string };

/**
 * Work out what this officer is allowed to see.
 *
 * ORDER MATTERS, and getting it wrong is a privilege-escalation bug. An earlier
 * version tested a loose /admin/ pattern first — and "district_admin" contains
 * "admin", so district officers were silently granted NATIONAL scope and could
 * read every district in the country. A test caught it.
 *
 * So: match the most specific level first, and match exact roles rather than
 * substrings wherever possible.
 */

// Exact roles that legitimately see the whole country.
const NATIONAL_ROLES = new Set([
  'admin', 'super_admin', 'ceo', 'coo', 'cfo', 'cto', 'cio',
  'national_logistics_director', 'national_operations_director',
  'national_finance_director', 'national_hr_director',
]);

const DISTRICT_ROLES = /^district_/i;
const REGIONAL_ROLES = /^region(al)?_/i;

export function scopeFor(user: { role: string; region?: string; district?: string }): Scope {
  const role = (user.role || '').toLowerCase().trim();

  // Most specific first.
  if (DISTRICT_ROLES.test(role)) {
    return { level: 'district', region: user.region, district: user.district };
  }
  if (REGIONAL_ROLES.test(role)) {
    return { level: 'regional', region: user.region };
  }
  if (NATIONAL_ROLES.has(role) || /^national_/i.test(role)) {
    return { level: 'national' };
  }

  // Anyone else (a plain officer, a seller, a rider) is confined to their own
  // district. Defaulting to the NARROWEST scope is the safe failure mode: an
  // unrecognised role can never accidentally see the whole country.
  return { level: 'district', region: user.region, district: user.district };
}

/** The scoping clause, applied identically to every report. */
function scopeArgs(scope: Scope): [string | null, string | null] {
  if (scope.level === 'national') return [null, null];
  if (scope.level === 'regional') return [scope.region ?? null, null];
  return [scope.region ?? null, scope.district ?? null];
}

// ─── Executive control centre ────────────────────────────────────────────────

/**
 * Platform KPIs plus a 7-day trend — previously several round trips and a lot of
 * JavaScript. Now one query.
 */
export async function platformStats() {
  const [totals] = await q<any>(`
    SELECT
      (SELECT count(*) FROM users)                                          AS users,
      (SELECT count(*) FROM users WHERE role = 'buyer')                     AS buyers,
      (SELECT count(*) FROM users WHERE role IN
         ('seller','reseller','manufacturer','wholesaler','service_provider','corporate_seller'))
                                                                            AS sellers,
      (SELECT count(*) FROM users WHERE role IN ('rider','driver'))         AS riders,
      (SELECT count(*) FROM stores WHERE status = 'active')                 AS stores,
      (SELECT count(*) FROM products WHERE status = 'active')               AS products,
      (SELECT count(*) FROM orders)                                         AS orders,
      (SELECT count(*) FROM orders WHERE payment_status = 'paid')           AS paid_orders,
      (SELECT COALESCE(SUM(total_amount),0) FROM orders
         WHERE payment_status = 'paid')                                     AS gmv,
      (SELECT count(*) FROM deliveries)                                     AS deliveries,
      (SELECT count(*) FROM deliveries WHERE status = 'delivered')          AS delivered,
      (SELECT count(*) FROM deliveries WHERE status = 'failed')             AS failed,
      (SELECT COALESCE(SUM(balance),0) FROM wallets WHERE balance > 0)      AS owed_to_users,
      (SELECT COALESCE(-SUM(balance),0) FROM wallets WHERE balance < 0)     AS owed_to_platform
  `);

  // A dense 7-day series: generate_series guarantees a row per day, so quiet
  // days show as zero rather than vanishing from the chart.
  const trend = await q<any>(`
    SELECT d::date AS day,
           COALESCE(o.orders, 0)  AS orders,
           COALESCE(o.revenue, 0) AS revenue
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') d
      LEFT JOIN (
        SELECT date_trunc('day', created_at)::date AS day,
               count(*) AS orders,
               SUM(total_amount) AS revenue
          FROM orders
         WHERE payment_status = 'paid'
           AND created_at >= CURRENT_DATE - INTERVAL '6 days'
         GROUP BY 1
      ) o ON o.day = d::date
     ORDER BY d
  `);

  return {
    users: Number(totals.users),
    buyers: Number(totals.buyers),
    sellers: Number(totals.sellers),
    riders: Number(totals.riders),
    stores: Number(totals.stores),
    products: Number(totals.products),
    orders: Number(totals.orders),
    paidOrders: Number(totals.paid_orders),
    gmv: Number(totals.gmv),
    deliveries: Number(totals.deliveries),
    delivered: Number(totals.delivered),
    failed: Number(totals.failed),
    owedToUsers: Number(totals.owed_to_users),
    owedToPlatform: Number(totals.owed_to_platform),
    trend: trend.map((t) => ({
      day: t.day,
      orders: Number(t.orders),
      revenue: Number(t.revenue),
    })),
  };
}

// ─── Operations centre (finance / HR / logistics / security) ─────────────────

export async function officeStats() {
  const [finance] = await q<any>(`
    SELECT
      (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE payment_status='paid') AS gmv,
      (SELECT COALESCE(SUM(amount),0) FROM wallet_transactions
        WHERE category='commission')                                        AS commission_earned,
      (SELECT COALESCE(SUM(balance),0) FROM wallets WHERE balance > 0)      AS payable,
      (SELECT COALESCE(-SUM(balance),0) FROM wallets WHERE balance < 0)     AS receivable,
      (SELECT count(*) FROM payments WHERE status='paid' AND escrow_state='held') AS in_escrow,
      (SELECT COALESCE(SUM(amount),0) FROM payments
        WHERE status='paid' AND escrow_state='held')                        AS escrow_value
  `);

  const [hr] = await q<any>(`
    SELECT
      (SELECT count(*) FROM leave_requests WHERE status='pending')          AS pending_leave,
      (SELECT count(*) FROM onboarding WHERE completed = FALSE)             AS onboarding_open,
      (SELECT count(*) FROM users WHERE department IS NOT NULL)             AS staff,
      (SELECT count(*) FROM payroll WHERE paid = FALSE)                     AS unpaid_payslips
  `);

  const [logistics] = await q<any>(`
    SELECT
      (SELECT count(*) FROM users WHERE role IN ('rider','driver')
         AND duty_status='available')                                       AS available_riders,
      (SELECT count(*) FROM deliveries WHERE status='pending_assignment')   AS unassigned,
      (SELECT count(*) FROM deliveries
         WHERE status IN ('accepted','picked_up','in_transit'))             AS active,
      (SELECT count(*) FROM deliveries WHERE status='failed')               AS failed
  `);

  const [security] = await q<any>(`
    SELECT
      (SELECT count(*) FROM audit_logs
        WHERE action='login.fail' AND created_at > now() - INTERVAL '24 hours') AS login_fails_24h,
      (SELECT count(*) FROM users WHERE account_status='suspended')         AS suspended,
      (SELECT count(*) FROM reports WHERE status='open')                    AS open_reports,
      (SELECT count(*) FROM wallet_drift)                                   AS ledger_drift
  `);

  return {
    finance: {
      gmv: Number(finance.gmv),
      commissionEarned: Number(finance.commission_earned),
      payable: Number(finance.payable),
      receivable: Number(finance.receivable),
      inEscrow: Number(finance.in_escrow),
      escrowValue: Number(finance.escrow_value),
    },
    hr: {
      pendingLeave: Number(hr.pending_leave),
      onboardingOpen: Number(hr.onboarding_open),
      staff: Number(hr.staff),
      unpaidPayslips: Number(hr.unpaid_payslips),
    },
    logistics: {
      availableRiders: Number(logistics.available_riders),
      unassigned: Number(logistics.unassigned),
      active: Number(logistics.active),
      failed: Number(logistics.failed),
    },
    security: {
      loginFails24h: Number(security.login_fails_24h),
      suspended: Number(security.suspended),
      openReports: Number(security.open_reports),
      // This must always be zero. If it isn't, the books disagree with the ledger.
      ledgerDrift: Number(security.ledger_drift),
    },
  };
}

// ─── Jurisdiction views ──────────────────────────────────────────────────────

/** Commerce health for whatever area this officer governs. */
export async function regionalOverview(scope: Scope) {
  const [region, district] = scopeArgs(scope);

  const [stats] = await q<any>(
    `SELECT
       (SELECT count(*) FROM users u
         WHERE ($1::text IS NULL OR u.region = $1)
           AND ($2::text IS NULL OR u.district = $2))                     AS users,
       (SELECT count(*) FROM users u WHERE u.role = 'buyer'
           AND ($1::text IS NULL OR u.region = $1)
           AND ($2::text IS NULL OR u.district = $2))                     AS buyers,
       (SELECT count(*) FROM users u WHERE u.role IN ('rider','driver')
           AND ($1::text IS NULL OR u.region = $1)
           AND ($2::text IS NULL OR u.district = $2))                     AS riders,
       (SELECT count(*) FROM stores s
         WHERE ($1::text IS NULL OR s.region = $1)
           AND ($2::text IS NULL OR s.district = $2))                     AS stores,
       (SELECT count(*) FROM orders o JOIN stores s ON s.id = o.store_id
         WHERE o.payment_status = 'paid'
           AND ($1::text IS NULL OR s.region = $1)
           AND ($2::text IS NULL OR s.district = $2))                     AS orders,
       (SELECT COALESCE(SUM(o.total_amount),0) FROM orders o
          JOIN stores s ON s.id = o.store_id
         WHERE o.payment_status = 'paid'
           AND ($1::text IS NULL OR s.region = $1)
           AND ($2::text IS NULL OR s.district = $2))                     AS gmv,
       (SELECT count(*) FROM deliveries d
         WHERE ($1::text IS NULL OR d.dropoff_region = $1)
           AND ($2::text IS NULL OR d.dropoff_district = $2))             AS deliveries,
       (SELECT count(*) FROM deliveries d WHERE d.status = 'delivered'
           AND ($1::text IS NULL OR d.dropoff_region = $1)
           AND ($2::text IS NULL OR d.dropoff_district = $2))             AS delivered,
       (SELECT count(*) FROM deliveries d WHERE d.status = 'failed'
           AND ($1::text IS NULL OR d.dropoff_region = $1)
           AND ($2::text IS NULL OR d.dropoff_district = $2))             AS failed`,
    [region, district],
  );

  // A national officer breaks down by region; a regional one by district.
  const groupCol = scope.level === 'national' ? 'region' : 'district';
  const breakdown = await q<any>(
    `SELECT COALESCE(NULLIF(u.${groupCol}, ''), 'Unspecified') AS area,
            count(*) AS users,
            (SELECT count(*) FROM stores s WHERE s.${groupCol} = u.${groupCol}) AS stores
       FROM users u
      WHERE ($1::text IS NULL OR u.region = $1)
      GROUP BY u.${groupCol}
      ORDER BY users DESC
      LIMIT 20`,
    [region],
  );

  return {
    scope,
    stats: {
      users: Number(stats.users),
      buyers: Number(stats.buyers),
      riders: Number(stats.riders),
      stores: Number(stats.stores),
      orders: Number(stats.orders),
      gmv: Number(stats.gmv),
      deliveries: Number(stats.deliveries),
      delivered: Number(stats.delivered),
      failed: Number(stats.failed),
    },
    breakdown: breakdown.map((b) => ({
      area: b.area,
      users: Number(b.users),
      stores: Number(b.stores),
    })),
  };
}

/** The logistics desk for a jurisdiction. */
export async function jurisdictionLogistics(scope: Scope) {
  const [region, district] = scopeArgs(scope);

  const [fleet] = await q<any>(
    `SELECT
       count(*)                                            AS total,
       count(*) FILTER (WHERE duty_status = 'available')   AS available,
       count(*) FILTER (WHERE duty_status = 'busy')        AS busy,
       count(*) FILTER (WHERE duty_status = 'offline'
                          OR duty_status IS NULL)          AS offline
     FROM users
     WHERE role IN ('rider','driver')
       AND ($1::text IS NULL OR region = $1)
       AND ($2::text IS NULL OR district = $2)`,
    [region, district],
  );

  const [counts] = await q<any>(
    `SELECT
       count(*) FILTER (WHERE status IN ('accepted','picked_up','in_transit')) AS active,
       count(*) FILTER (WHERE status = 'pending_assignment')                   AS unassigned,
       count(*) FILTER (WHERE status = 'delivered')                            AS delivered,
       count(*) FILTER (WHERE status = 'failed')                               AS failed
     FROM deliveries
     WHERE ($1::text IS NULL OR dropoff_region = $1)
       AND ($2::text IS NULL OR dropoff_district = $2)`,
    [region, district],
  );

  const topRiders = await q<any>(
    `SELECT u.full_name AS name,
            count(*) AS jobs,
            COALESCE(SUM(d.fee), 0) AS earnings
       FROM deliveries d JOIN users u ON u.id = d.rider_id
      WHERE d.status = 'delivered'
        AND ($1::text IS NULL OR d.dropoff_region = $1)
        AND ($2::text IS NULL OR d.dropoff_district = $2)
      GROUP BY u.id, u.full_name
      ORDER BY jobs DESC
      LIMIT 5`,
    [region, district],
  );

  const recent = await q<any>(
    `SELECT d.tracking_number AS tracking, d.status,
            COALESCE(d.dropoff_address, '') AS route,
            u.full_name AS rider
       FROM deliveries d LEFT JOIN users u ON u.id = d.rider_id
      WHERE ($1::text IS NULL OR d.dropoff_region = $1)
        AND ($2::text IS NULL OR d.dropoff_district = $2)
      ORDER BY d.created_at DESC
      LIMIT 10`,
    [region, district],
  );

  return {
    scope,
    fleet: {
      total: Number(fleet.total),
      available: Number(fleet.available),
      busy: Number(fleet.busy),
      offline: Number(fleet.offline),
    },
    activeDeliveries: Number(counts.active),
    unassigned: Number(counts.unassigned),
    deliveredTotal: Number(counts.delivered),
    failed: Number(counts.failed),
    topRiders: topRiders.map((r) => ({
      name: r.name, jobs: Number(r.jobs), earnings: Number(r.earnings),
    })),
    recentDeliveries: recent,
  };
}

/** Finance: who the platform owes, and who owes the platform. */
export async function financeOverview() {
  const owed = await q<any>(
    `SELECT w.user_id, u.full_name, u.role, u.phone, w.balance
       FROM wallets w JOIN users u ON u.id = w.user_id
      WHERE w.balance > 0 ORDER BY w.balance DESC LIMIT 50`,
  );
  const owing = await q<any>(
    `SELECT w.user_id, u.full_name, u.role, u.phone, w.balance
       FROM wallets w JOIN users u ON u.id = w.user_id
      WHERE w.balance < 0 ORDER BY w.balance ASC LIMIT 50`,
  );
  const shape = (r: any) => ({
    userId: r.user_id,
    user: { fullName: r.full_name, role: r.role, phone: r.phone },
    balance: Number(r.balance),
  });
  return { owed: owed.map(shape), owing: owing.map(shape) };
}

/** Officer user list, scoped to their jurisdiction. */
export async function listUsers(scope: Scope, opts: { role?: string; limit?: number } = {}) {
  const [region, district] = scopeArgs(scope);
  return q<any>(
    `SELECT id, full_name, email, phone, role, region, district,
            account_status, is_approved, duty_status, created_at
       FROM users
      WHERE ($1::text IS NULL OR region   = $1)
        AND ($2::text IS NULL OR district = $2)
        AND ($3::text IS NULL OR role     = $3)
      ORDER BY created_at DESC
      LIMIT $4`,
    [region, district, opts.role ?? null, opts.limit ?? 100],
  );
}

/** Approve a rider or driver so they can start taking jobs. */
export async function approveUser(userId: string) {
  const rows = await q<any>(
    `UPDATE users
        SET is_approved = TRUE,
            account_status = 'active',
            pending_reason = NULL
      WHERE id = $1::uuid
      RETURNING id, full_name, role`,
    [userId],
  );
  return rows[0] ?? null;
}
