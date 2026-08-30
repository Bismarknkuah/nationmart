import { q, tx } from '../db/pg';

/**
 * Store repository — PostgreSQL.
 *
 * The two-store-per-seller limit is enforced by a database trigger, not by a
 * count-then-insert in application code. That distinction matters: the old
 * `countDocuments()` then `create()` had a gap between them, so two simultaneous
 * requests could both see "1 store" and both create one, leaving a seller with
 * three. The database closes that gap.
 */

export type StoreRow = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  store_code: string | null;
  store_number: string | null;
  type: string;
  description: string;
  country: string;
  region: string;
  district: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  logo_url: string | null;
  banner_url: string | null;
  theme: any;
  market_scope: string;
  is_international: boolean;
  paystack_subaccount: string | null;
  status: string;
  rating_average: string;
  rating_count: number;
  created_at: Date;
};

export const MAX_STORES = 2;

export function slugify(name: string): string {
  return String(name || '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

/** A slug that is definitely free. */
export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || 'store';
  const taken = await q(`SELECT 1 FROM stores WHERE slug = $1`, [base]);
  if (taken.length === 0) return base;
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

/** A short, memorable customer-facing store number. */
export async function uniqueStoreNumber(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const n = `NM${Math.floor(100000 + Math.random() * 900000)}`;
    const taken = await q(`SELECT 1 FROM stores WHERE store_number = $1`, [n]);
    if (taken.length === 0) return n;
  }
  return `NM${Date.now().toString().slice(-6)}`;
}

export interface CreateStoreInput {
  ownerId: string;
  name: string;
  type?: string;
  description?: string;
  country?: string;
  region?: string;
  district?: string;
  address?: string;
  lat?: number;
  lng?: number;
  logoUrl?: string;
  bannerUrl?: string;
  theme?: any;
  marketScope?: 'local' | 'international' | 'both';
  storeCode?: string;
}

export async function countByOwner(ownerId: string): Promise<number> {
  const rows = await q<{ n: string }>(
    `SELECT count(*) AS n FROM stores WHERE owner_id = $1::uuid`, [ownerId]);
  return Number(rows[0].n);
}

/**
 * Create a store. Throws STORE_LIMIT (from the database trigger) if the seller
 * already owns the maximum.
 */
export async function createStore(input: CreateStoreInput): Promise<StoreRow> {
  const slug = await uniqueSlug(input.name);
  const storeNumber = await uniqueStoreNumber();

  const scope = input.marketScope && ['local', 'international', 'both'].includes(input.marketScope)
    ? input.marketScope
    : 'local';
  const isInternational = scope !== 'local';

  const rows = await q<StoreRow>(
    `INSERT INTO stores (
       owner_id, name, slug, store_code, store_number, type, description,
       country, region, district, address, lat, lng,
       logo_url, banner_url, theme, market_scope, is_international
     ) VALUES (
       $1::uuid,$2,$3,$4,$5,$6,$7,
       $8,$9,$10,$11,$12,$13,
       $14,$15,$16::jsonb,$17::market_scope,$18
     ) RETURNING *`,
    [
      input.ownerId, input.name, slug, input.storeCode ?? null, storeNumber,
      input.type || 'general', input.description ?? '',
      input.country || 'Ghana', input.region ?? '', input.district ?? '',
      input.address ?? null, input.lat ?? null, input.lng ?? null,
      input.logoUrl ?? null, input.bannerUrl ?? null,
      JSON.stringify(input.theme ?? {}), scope, isInternational,
    ],
  );
  return rows[0];
}

export async function findBySlug(slug: string): Promise<StoreRow | null> {
  const rows = await q<StoreRow>(`SELECT * FROM stores WHERE slug = $1`, [slug]);
  return rows[0] ?? null;
}

export async function findById(id: string): Promise<StoreRow | null> {
  const rows = await q<StoreRow>(`SELECT * FROM stores WHERE id = $1::uuid`, [id]);
  return rows[0] ?? null;
}

export async function myStores(ownerId: string): Promise<StoreRow[]> {
  return q<StoreRow>(
    `SELECT * FROM stores WHERE owner_id = $1::uuid ORDER BY created_at ASC`, [ownerId]);
}

/** Public store browsing, filtered by area and type. */
export async function browseStores(opts: {
  region?: string; district?: string; type?: string; query?: string;
  limit?: number; offset?: number;
} = {}): Promise<StoreRow[]> {
  return q<StoreRow>(
    `SELECT * FROM stores
      WHERE status = 'active'
        AND ($1::text IS NULL OR region   = $1)
        AND ($2::text IS NULL OR district = $2)
        AND ($3::text IS NULL OR type     = $3)
        AND ($4::text IS NULL OR name ILIKE '%' || $4 || '%')
      ORDER BY rating_average DESC, created_at DESC
      LIMIT $5 OFFSET $6`,
    [opts.region ?? null, opts.district ?? null, opts.type ?? null,
     opts.query ?? null, opts.limit ?? 40, opts.offset ?? 0],
  );
}

/** Fields the owner may change. Ownership and status are not among them. */
const EDITABLE: Record<string, string> = {
  name: 'name', description: 'description', type: 'type',
  address: 'address', region: 'region', district: 'district',
  lat: 'lat', lng: 'lng', logoUrl: 'logo_url', bannerUrl: 'banner_url',
  paystackSubaccount: 'paystack_subaccount',
};

export async function updateStore(
  storeId: string, ownerId: string, patch: Record<string, any>,
): Promise<StoreRow | null> {
  const sets: string[] = [];
  const values: any[] = [];
  let i = 1;

  for (const [key, value] of Object.entries(patch)) {
    const col = EDITABLE[key];
    if (!col) continue;
    sets.push(`${col} = $${i++}`);
    values.push(value);
  }
  if (patch.theme !== undefined) {
    sets.push(`theme = $${i++}::jsonb`);
    values.push(JSON.stringify(patch.theme));
  }
  if (sets.length === 0) return findById(storeId);

  values.push(storeId, ownerId);
  const rows = await q<StoreRow>(
    `UPDATE stores SET ${sets.join(', ')}
      WHERE id = $${i}::uuid AND owner_id = $${i + 1}::uuid
      RETURNING *`,
    values,
  );
  return rows[0] ?? null;   // null = not yours
}

// ─── Staff ───────────────────────────────────────────────────────────────────

export async function addStaff(
  storeId: string, userId: string, role: string, permissions: string[],
): Promise<void> {
  await q(
    `INSERT INTO store_staff (store_id, user_id, role, permissions)
     VALUES ($1::uuid, $2::uuid, $3, $4)
     ON CONFLICT (store_id, user_id)
       DO UPDATE SET role = EXCLUDED.role, permissions = EXCLUDED.permissions`,
    [storeId, userId, role, permissions],
  );
}

export async function removeStaff(storeId: string, userId: string): Promise<void> {
  await q(`DELETE FROM store_staff WHERE store_id = $1::uuid AND user_id = $2::uuid`,
    [storeId, userId]);
}

export async function listStaff(storeId: string) {
  return q<any>(
    `SELECT s.user_id, s.role, s.permissions, u.full_name, u.email, u.phone
       FROM store_staff s JOIN users u ON u.id = s.user_id
      WHERE s.store_id = $1::uuid
      ORDER BY s.added_at ASC`,
    [storeId],
  );
}

/** Can this user act for this store — as owner or as staff? */
export async function canManage(storeId: string, userId: string): Promise<boolean> {
  const rows = await q(
    `SELECT 1 FROM stores WHERE id = $1::uuid AND owner_id = $2::uuid
      UNION ALL
     SELECT 1 FROM store_staff WHERE store_id = $1::uuid AND user_id = $2::uuid`,
    [storeId, userId],
  );
  return rows.length > 0;
}

/** Storefront: the store plus its live listings, in one round trip. */
export async function storefront(slug: string) {
  const store = await findBySlug(slug);
  if (!store) return null;
  const products = await q<any>(
    `SELECT id, title, price_per_unit, currency, discount_percent, images,
            available_quantity, unit, rating_average, rating_count
       FROM products
      WHERE store_id = $1::uuid AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 60`,
    [store.id],
  );
  return { store, products };
}

export function publicStore(s: StoreRow) {
  return {
    _id: s.id,
    id: s.id,
    owner: s.owner_id,
    name: s.name,
    slug: s.slug,
    storeCode: s.store_code,
    storeNumber: s.store_number,
    type: s.type,
    description: s.description,
    country: s.country,
    region: s.region,
    district: s.district,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    theme: { ...(s.theme || {}), logoUrl: s.logo_url, bannerUrl: s.banner_url },
    marketScope: s.market_scope,
    isInternational: s.is_international,
    paystackSubaccount: s.paystack_subaccount,
    status: s.status,
    rating: { average: Number(s.rating_average), count: s.rating_count },
    createdAt: s.created_at,
  };
}
