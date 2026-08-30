import { q, money, reserveStock, releaseStock, searchProducts, ProductSearch } from '../db/pg';

/**
 * Product repository — PostgreSQL.
 *
 * Inventory changes go through reserve_stock()/release_stock(), which do the
 * check and the decrement in a single atomic statement. The old code read the
 * stock, then decremented it moments later; two buyers racing through that gap
 * could both take the last item. That is now impossible.
 *
 * Search goes through search_products(), a ranked full-text query over a GIN
 * index — replacing the regex table-scan.
 */

export type ProductRow = {
  id: string;
  seller_id: string;
  store_id: string | null;
  title: string;
  description: string;
  category: string;
  tags: string[];
  price_per_unit: string;
  currency: string;
  unit: string;
  discount_percent: number;
  promo_label: string | null;
  minimum_order: string;
  available_quantity: string;
  status: string;
  images: string[];
  region: string;
  district: string;
  town: string;
  lat: number | null;
  lng: number | null;
  market_scope: string;
  is_international: boolean;
  origin: string;
  passport_id: string | null;
  traceability: any[];
  rating_average: string;
  rating_count: number;
  view_count: number;
  created_at: Date;
};

export { reserveStock, releaseStock, searchProducts };
export type { ProductSearch };

export interface CreateProductInput {
  sellerId: string;
  storeId?: string | null;
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
  pricePerUnit: number;
  currency?: string;
  unit?: string;
  discountPercent?: number;
  promoLabel?: string;
  minimumOrder?: number;
  availableQuantity?: number;
  images?: string[];
  region?: string;
  district?: string;
  town?: string;
  lat?: number;
  lng?: number;
  marketScope?: 'local' | 'international' | 'both';
  origin?: string;
  species?: string;      // timber: the common name, for export declarations
  actorRole?: string;
}

/** A traceability entry recorded the moment a product is listed. */
function firstTrace(origin: string, actorId: string, actorRole?: string) {
  return [{
    event: 'Product Listed',
    location: origin || 'Ghana',
    timestamp: new Date().toISOString(),
    actor: actorId,
    actorRole: actorRole ?? 'seller',
    notes: 'Initial product listing on NationMart platform',
  }];
}

export async function createProduct(input: CreateProductInput): Promise<ProductRow> {
  const scope = input.marketScope && ['local', 'international', 'both'].includes(input.marketScope)
    ? input.marketScope
    : 'local';
  const origin = input.origin || 'Ghana';
  const passportId = `NM-P-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;

  const rows = await q<ProductRow>(
    `INSERT INTO products (
       seller_id, store_id, title, description, category, tags,
       price_per_unit, currency, unit, discount_percent, promo_label, minimum_order,
       available_quantity, status, images, region, district, town, lat, lng,
       market_scope, is_international, origin, species, passport_id, traceability
     ) VALUES (
       $1::uuid,$2::uuid,$3,$4,$5,$6,
       $7::numeric,$8,$9,$10,$11,$12::numeric,
       $13::numeric,'pending_review',$14,$15,$16,$17,$18,$19,
       $20::market_scope,$21,$22,$23,$24,$25::jsonb
     ) RETURNING *`,
    [
      input.sellerId, input.storeId ?? null, input.title, input.description ?? '',
      input.category ?? 'general', input.tags ?? [],
      money(input.pricePerUnit), input.currency ?? 'GHS', input.unit ?? 'piece',
      input.discountPercent ?? 0, input.promoLabel ?? null,
      money(input.minimumOrder ?? 1), money(input.availableQuantity ?? 0),
      input.images ?? [], input.region ?? '', input.district ?? '', input.town ?? '',
      input.lat ?? null, input.lng ?? null,
      scope, scope !== 'local', origin, input.species ?? null, passportId,
      JSON.stringify(firstTrace(origin, input.sellerId, input.actorRole)),
    ],
  );
  return rows[0];
}

export async function findById(id: string): Promise<ProductRow | null> {
  const rows = await q<ProductRow>(`SELECT * FROM products WHERE id = $1::uuid`, [id]);
  return rows[0] ?? null;
}

export async function findByPassportId(passportId: string): Promise<ProductRow | null> {
  const rows = await q<ProductRow>(`SELECT * FROM products WHERE passport_id = $1`, [passportId]);
  return rows[0] ?? null;
}

/** Product detail, with the store's identity for the "Sold by …" line. */
export async function getWithStore(id: string) {
  const rows = await q<any>(
    `SELECT p.*, s.name AS store_name, s.slug AS store_slug, s.logo_url AS store_logo,
            u.full_name AS seller_name
       FROM products p
       LEFT JOIN stores s ON s.id = p.store_id
       LEFT JOIN users  u ON u.id = p.seller_id
      WHERE p.id = $1::uuid`,
    [id],
  );
  if (rows.length === 0) return null;
  // Viewing is a hint, not a transaction — fire and forget.
  q(`UPDATE products SET view_count = view_count + 1 WHERE id = $1::uuid`, [id]).catch(() => {});
  return rows[0];
}

export async function myProducts(sellerId: string, limit = 100): Promise<ProductRow[]> {
  return q<ProductRow>(
    `SELECT * FROM products WHERE seller_id = $1::uuid
      ORDER BY created_at DESC LIMIT $2`,
    [sellerId, limit],
  );
}

/** Low stock, for the seller's inventory alerts. */
export async function lowStock(sellerId: string, threshold = 5): Promise<ProductRow[]> {
  return q<ProductRow>(
    `SELECT * FROM products
      WHERE seller_id = $1::uuid
        AND status IN ('active','sold_out')
        AND available_quantity <= $2::numeric
      ORDER BY available_quantity ASC`,
    [sellerId, money(threshold)],
  );
}

const EDITABLE: Record<string, string> = {
  title: 'title', description: 'description', category: 'category',
  unit: 'unit', promoLabel: 'promo_label', images: 'images',
  region: 'region', district: 'district', town: 'town',
  lat: 'lat', lng: 'lng', tags: 'tags', origin: 'origin',
};
const NUMERIC_FIELDS: Record<string, string> = {
  pricePerUnit: 'price_per_unit',
  minimumOrder: 'minimum_order',
  availableQuantity: 'available_quantity',
};

/**
 * Update a listing. Only the owning seller can. `availableQuantity` set here is
 * a deliberate restock, distinct from the atomic decrement used at checkout.
 */
export async function updateProduct(
  productId: string, sellerId: string, patch: Record<string, any>,
): Promise<ProductRow | null> {
  const sets: string[] = [];
  const values: any[] = [];
  let i = 1;

  for (const [key, value] of Object.entries(patch)) {
    if (EDITABLE[key]) {
      sets.push(`${EDITABLE[key]} = $${i++}`);
      values.push(value);
    } else if (NUMERIC_FIELDS[key]) {
      sets.push(`${NUMERIC_FIELDS[key]} = $${i++}::numeric`);
      values.push(money(Number(value)));
    } else if (key === 'discountPercent') {
      sets.push(`discount_percent = $${i++}`);
      values.push(Math.max(0, Math.min(100, Number(value) || 0)));
    } else if (key === 'status' && ['active', 'draft', 'archived'].includes(value)) {
      sets.push(`status = $${i++}::product_status`);
      values.push(value);
    }
  }
  if (sets.length === 0) return findById(productId);

  // Restocking a sold-out listing puts it back on sale.
  if (patch.availableQuantity !== undefined && Number(patch.availableQuantity) > 0) {
    sets.push(`status = CASE WHEN status = 'sold_out' THEN 'active'::product_status ELSE status END`);
  }

  values.push(productId, sellerId);
  const rows = await q<ProductRow>(
    `UPDATE products SET ${sets.join(', ')}
      WHERE id = $${i}::uuid AND seller_id = $${i + 1}::uuid
      RETURNING *`,
    values,
  );
  return rows[0] ?? null;   // null = not yours
}

/** Officer action: approve a pending listing so it goes live. */
export async function approveProduct(productId: string): Promise<ProductRow | null> {
  const rows = await q<ProductRow>(
    `UPDATE products SET status = 'active'
      WHERE id = $1::uuid AND status = 'pending_review'
      RETURNING *`,
    [productId],
  );
  return rows[0] ?? null;
}

/** Append a traceability event (farm → warehouse → buyer). */
export async function addTraceability(
  productId: string,
  entry: { event: string; location?: string; actor?: string; actorRole?: string; notes?: string },
): Promise<ProductRow | null> {
  const rows = await q<ProductRow>(
    `UPDATE products
        SET traceability = traceability || $2::jsonb
      WHERE id = $1::uuid
      RETURNING *`,
    [productId, JSON.stringify([{ ...entry, timestamp: new Date().toISOString() }])],
  );
  return rows[0] ?? null;
}

export function publicProduct(p: any) {
  return {
    _id: p.id,
    id: p.id,
    seller: p.seller_id,
    store: p.store_id,
    title: p.title,
    description: p.description,
    category: p.category,
    tags: p.tags ?? [],
    pricePerUnit: Number(p.price_per_unit),
    currency: p.currency,
    unit: p.unit,
    discountPercent: p.discount_percent,
    promoLabel: p.promo_label,
    minimumOrder: Number(p.minimum_order),
    availableQuantity: Number(p.available_quantity),
    status: p.status,
    images: p.images ?? [],
    region: p.region,
    district: p.district,
    town: p.town,
    marketScope: p.market_scope,
    isInternational: p.is_international,
    origin: p.origin,
    passportId: p.passport_id,
    traceabilityLog: p.traceability ?? [],
    rating: { average: Number(p.rating_average), count: p.rating_count },
    viewCount: p.view_count,
    createdAt: p.created_at,
    ...(p.store_name
      ? { storeInfo: { name: p.store_name, slug: p.store_slug, logoUrl: p.store_logo } }
      : {}),
  };
}
