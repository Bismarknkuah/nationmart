import { Pool, PoolClient } from 'pg';

/**
 * PostgreSQL data layer for NationMart.
 *
 * Deliberately built on `pg` (node-postgres) rather than an ORM with
 * downloadable query engines: no binary fetch at build time means the Railway
 * deploy can't fail on a CDN hiccup, and everything here is testable against a
 * real database in CI.
 *
 * Money rule: amounts are NUMERIC(14,2) in Postgres and are handled as strings
 * at the boundary, never as JS floats. `0.1 + 0.2 !== 0.3` has no place in a
 * ledger.
 */

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  pool = new Pool({
    connectionString,
    // Railway/managed Postgres terminates TLS at the proxy with a self-signed cert.
    ssl: /localhost|127\.0\.0\.1|\/tmp/.test(connectionString) ? undefined : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (err) => console.error('[pg] idle client error:', err.message));
  return pool;
}

/** For tests: inject a pool pointed at a throwaway database. */
export function setPool(p: Pool): void { pool = p; }

export async function closePool(): Promise<void> {
  if (pool) { await pool.end(); pool = null; }
}

/** Run a query. */
export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

/** Run several statements inside one transaction; rolls back on any throw. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ─── Money ───────────────────────────────────────────────────────────────────

/**
 * Format a value as a 2dp string for NUMERIC columns.
 *
 * `toFixed(2)` is NOT safe for money: 45.555 is stored in binary as
 * 45.554999999…, so `(45.555).toFixed(2)` returns "45.55" — rounding DOWN on a
 * halfway value and quietly shortchanging someone a pesewa on every such sum.
 *
 * Shifting the decimal point through string exponent notation ("45.555e2")
 * sidesteps the binary error, then we round half-away-from-zero, which is what
 * everyone means by "round a half-pesewa up".
 */
export function money(n: number | string): string {
  const v = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(v)) throw new Error(`Invalid money value: ${n}`);

  const shifted = Number(`${Math.abs(v)}e2`);
  const rounded = Math.round(shifted);              // half-up on the magnitude
  const signed = v < 0 ? -rounded : rounded;
  return (Number(`${signed}e-2`)).toFixed(2);
}

// ─── Wallet ledger ───────────────────────────────────────────────────────────

export type WalletTxnType = 'credit' | 'debit';
export type WalletTxnCategory =
  | 'sale_earning' | 'delivery_earning' | 'commission'
  | 'payout' | 'settlement' | 'adjustment';

export interface PostTxnInput {
  userId: string;               // Postgres UUID
  type: WalletTxnType;
  category: WalletTxnCategory;
  amount: number | string;      // always positive; `type` carries the direction
  description?: string;
  ref?: string;                 // payment/order reference — used for idempotency
}

/**
 * Post a wallet movement and return the new balance.
 *
 * Delegates to the `post_wallet_txn` SQL function, which does the whole thing
 * inside one transaction with `SELECT ... FOR UPDATE` on the wallet row. That
 * row lock is what makes concurrent settlements safe: twenty deliveries
 * completing at the same instant produce exactly the right balance, every time.
 */
export async function postWalletTxn(input: PostTxnInput): Promise<number> {
  const amount = money(input.amount);
  if (Number(amount) <= 0) throw new Error(`Wallet amount must be positive (got ${amount})`);

  const rows = await q<{ post_wallet_txn: string }>(
    `SELECT post_wallet_txn($1::uuid, $2::wallet_txn_type, $3::wallet_txn_category, $4::numeric, $5, $6)`,
    [input.userId, input.type, input.category, amount, input.description ?? '', input.ref ?? null],
  );
  return Number(rows[0].post_wallet_txn);
}

/**
 * Idempotent variant: if this `ref` + `category` was already posted for this
 * user, do nothing and return the current balance. A duplicated Paystack
 * webhook therefore cannot credit anybody twice.
 */
export async function postWalletTxnOnce(input: PostTxnInput): Promise<{ balance: number; applied: boolean }> {
  if (!input.ref) {
    return { balance: await postWalletTxn(input), applied: true };
  }
  const existing = await q<{ balance_after: string }>(
    `SELECT balance_after FROM wallet_transactions
      WHERE user_id = $1::uuid AND ref = $2 AND category = $3::wallet_txn_category
      LIMIT 1`,
    [input.userId, input.ref, input.category],
  );
  if (existing.length > 0) {
    return { balance: Number(existing[0].balance_after), applied: false };
  }
  try {
    return { balance: await postWalletTxn(input), applied: true };
  } catch (err: any) {
    // Lost a race with a concurrent duplicate — the unique index caught it.
    if (err?.code === '23505') {
      const b = await getBalance(input.userId);
      return { balance: b, applied: false };
    }
    throw err;
  }
}

export async function getBalance(userId: string): Promise<number> {
  const rows = await q<{ balance: string }>(
    `SELECT balance FROM wallets WHERE user_id = $1::uuid`, [userId],
  );
  return rows.length ? Number(rows[0].balance) : 0;
}

export async function getWallet(userId: string, take = 50) {
  const [wallet] = await q<any>(
    `INSERT INTO wallets (user_id) VALUES ($1::uuid)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = wallets.updated_at
     RETURNING id, balance, currency, total_earned, total_commission`,
    [userId],
  );
  const transactions = await q<any>(
    `SELECT id, type, category, amount, balance_after, description, ref, created_at
       FROM wallet_transactions WHERE user_id = $1::uuid
      ORDER BY created_at DESC, id DESC LIMIT $2`,
    [userId, take],
  );
  return {
    wallet: {
      balance: Number(wallet.balance),
      currency: wallet.currency,
      totalEarned: Number(wallet.total_earned),
      totalCommission: Number(wallet.total_commission),
    },
    transactions: transactions.map((t) => ({
      _id: String(t.id),
      type: t.type,
      category: t.category,
      amount: Number(t.amount),
      balanceAfter: Number(t.balance_after),
      description: t.description,
      ref: t.ref,
      createdAt: t.created_at,
    })),
  };
}

/**
 * Reconciliation. Any wallet whose cached balance disagrees with the sum of its
 * ledger. On a healthy system this is ALWAYS empty — that is the invariant the
 * whole migration was for.
 */
export async function findWalletDrift() {
  return q<{ wallet_id: string; user_id: string; cached_balance: string; ledger_balance: string; drift: string }>(
    `SELECT wallet_id, user_id, cached_balance, ledger_balance, drift FROM wallet_drift`,
  );
}

/** Finance: who the platform owes, and who owes the platform. */
export async function walletOverview() {
  const owed = await q<any>(
    `SELECT w.user_id, u.full_name, u.role, w.balance
       FROM wallets w JOIN users u ON u.id = w.user_id
      WHERE w.balance > 0 ORDER BY w.balance DESC LIMIT 50`,
  );
  const owing = await q<any>(
    `SELECT w.user_id, u.full_name, u.role, w.balance
       FROM wallets w JOIN users u ON u.id = w.user_id
      WHERE w.balance < 0 ORDER BY w.balance ASC LIMIT 50`,
  );
  const shape = (r: any) => ({
    userId: r.user_id,
    user: { fullName: r.full_name, role: r.role },
    balance: Number(r.balance),
  });
  return { owed: owed.map(shape), owing: owing.map(shape) };
}

/** Map a legacy Mongo ObjectId to its Postgres UUID (migration bridge). */
export async function userIdFromMongo(mongoId: string): Promise<string | null> {
  const rows = await q<{ id: string }>(`SELECT id FROM users WHERE mongo_id = $1`, [mongoId]);
  return rows.length ? rows[0].id : null;
}

// ─── Inventory ───────────────────────────────────────────────────────────────

/**
 * Reserve stock for an order. Returns the remaining quantity.
 *
 * Throws INSUFFICIENT_STOCK if the product cannot supply the quantity. The check
 * and the decrement happen in ONE atomic statement inside the database, so two
 * buyers racing for the last item cannot both succeed — the classic overselling
 * bug is structurally impossible here.
 */
export async function reserveStock(productId: string, qty: number): Promise<number> {
  const rows = await q<{ reserve_stock: string }>(
    `SELECT reserve_stock($1::uuid, $2::numeric)`,
    [productId, money(qty)],
  );
  return Number(rows[0].reserve_stock);
}

/** Put stock back when an order is cancelled or a delivery fails. */
export async function releaseStock(productId: string, qty: number): Promise<number> {
  const rows = await q<{ release_stock: string }>(
    `SELECT release_stock($1::uuid, $2::numeric)`,
    [productId, money(qty)],
  );
  return Number(rows[0].release_stock);
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface ProductSearch {
  query?: string;
  category?: string;
  region?: string;
  district?: string;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  offset?: number;
}

export interface ProductHit {
  id: string;
  title: string;
  pricePerUnit: number;
  currency: string;
  discountPercent: number;
  images: string[];
  storeName: string | null;
  storeSlug: string | null;
  logoUrl: string | null;
  region: string;
  district: string;
  ratingAverage: number;
  rank: number;
}

/**
 * Ranked full-text product search with the filters the Discover page uses.
 *
 * Backed by a GIN index on a generated tsvector, so this is a single indexed
 * scan (~1ms) rather than a regex table-scan or an external AI call. Title
 * matches outrank description matches.
 */
export async function searchProducts(opts: ProductSearch = {}): Promise<ProductHit[]> {
  const rows = await q<any>(
    `SELECT * FROM search_products($1,$2,$3,$4,$5::numeric,$6::numeric,$7,$8)`,
    [
      opts.query ?? null,
      opts.category ?? null,
      opts.region ?? null,
      opts.district ?? null,
      opts.minPrice ?? null,
      opts.maxPrice ?? null,
      opts.limit ?? 40,
      opts.offset ?? 0,
    ],
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    pricePerUnit: Number(r.price_per_unit),
    currency: r.currency,
    discountPercent: Number(r.discount_percent),
    images: r.images ?? [],
    storeName: r.store_name,
    storeSlug: r.store_slug,
    logoUrl: r.logo_url,
    region: r.region,
    district: r.district,
    ratingAverage: Number(r.rating_average),
    rank: Number(r.rank),
  }));
}
