import { q } from '../db/pg';

/**
 * Search — PostgreSQL.
 *
 * The old search was exact full-text: "cemnt" returned nothing. Every such miss
 * is a lost sale, and in a market where people type on feature phones and spell
 * by ear, misses are the common case, not the edge case.
 *
 * This is a hybrid:
 *   • exact full-text where it hits
 *   • word-level trigram similarity where it doesn't (typos, phonetic spelling)
 *   • a Ghana alias table (odum→iroko, simenti→cement, zinc→roofing sheet)
 *   • distance-aware ranking — a seller 2km away outranks one 200km away
 *
 * Every query is logged. The ones that return NOTHING are the most valuable data
 * the platform has: demand with no supply.
 */

export interface SearchHit {
  id: string;
  title: string;
  description: string;
  category: string;
  pricePerUnit: number;
  currency: string;
  unit: string;
  discountPercent: number;
  availableQuantity: number;
  inStock: boolean;
  images: string[];
  region: string;
  district: string;
  town: string;
  lat: number | null;
  lng: number | null;
  rating: { average: number; count: number };
  store: { id: string | null; name: string | null; slug: string | null };
  sellerId: string;
  distanceKm: number | null;
  relevance: number;
  matchedBy: 'exact' | 'fuzzy' | 'local_name' | 'browse';
}

export type SortOrder =
  | 'relevance' | 'distance' | 'price_asc' | 'price_desc' | 'rating' | 'newest';

export interface SearchOptions {
  query?: string;
  category?: string;
  region?: string;
  district?: string;
  minPrice?: number;
  maxPrice?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  inStock?: boolean;
  sort?: SortOrder;
  limit?: number;
  offset?: number;
  userId?: string;      // for the search log
}

const SORTS: SortOrder[] = [
  'relevance', 'distance', 'price_asc', 'price_desc', 'rating', 'newest',
];

function shape(r: any): SearchHit {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    pricePerUnit: Number(r.price_per_unit),
    currency: r.currency,
    unit: r.unit,
    discountPercent: Number(r.discount_percent),
    availableQuantity: Number(r.available_quantity),
    inStock: Number(r.available_quantity) > 0,
    images: r.images ?? [],
    region: r.region,
    district: r.district,
    town: r.town,
    lat: r.lat,
    lng: r.lng,
    rating: { average: Number(r.rating_average), count: Number(r.rating_count) },
    store: { id: r.store_id, name: r.store_name, slug: r.store_slug },
    sellerId: r.seller_id,
    distanceKm: r.distance_km != null ? Number(Number(r.distance_km).toFixed(1)) : null,
    relevance: Number(Number(r.relevance).toFixed(3)),
    matchedBy: r.matched_by,
  };
}

export interface SearchResult {
  hits: SearchHit[];
  total: number;
  didYouMean: string | null;
  /** True when we only found things by guessing at a misspelling. */
  corrected: boolean;
}

export async function search(opts: SearchOptions = {}): Promise<SearchResult> {
  // Sorting by distance is meaningless without a location to sort from.
  let sort: SortOrder = SORTS.includes(opts.sort as SortOrder) ? opts.sort! : 'relevance';
  if (sort === 'distance' && (opts.lat == null || opts.lng == null)) sort = 'relevance';

  const rows = await q<any>(
    `SELECT * FROM search_products_v2(
       $1, $2, $3, $4, $5::numeric, $6::numeric,
       $7::float8, $8::float8, $9::float8, $10, $11, $12, $13)`,
    [
      opts.query?.trim() || null,
      opts.category ?? null,
      opts.region ?? null,
      opts.district ?? null,
      opts.minPrice ?? null,
      opts.maxPrice ?? null,
      opts.lat ?? null,
      opts.lng ?? null,
      opts.radiusKm ?? null,
      opts.inStock ?? false,
      sort,
      Math.min(Number(opts.limit) || 40, 100),
      Number(opts.offset) || 0,
    ],
  );

  const hits = rows.map(shape);

  // When there is nothing at all, offer the nearest real thing rather than a
  // dead end.
  let didYouMean: string | null = null;
  if (hits.length === 0 && opts.query?.trim()) {
    const [row] = await q<any>(`SELECT did_you_mean($1) AS term`, [opts.query.trim()]);
    didYouMean = row?.term ?? null;
  }

  // Log it — especially if it found nothing.
  if (opts.query?.trim()) {
    q(
      `INSERT INTO search_log (query, user_id, region, results)
       VALUES ($1, $2::uuid, $3, $4)`,
      [opts.query.trim().toLowerCase(), opts.userId ?? null, opts.region ?? null, hits.length],
    ).catch(() => { /* logging must never break a search */ });
  }

  return {
    hits,
    total: hits.length,
    didYouMean,
    corrected: hits.length > 0 && hits.every((h) => h.matchedBy !== 'exact'),
  };
}

/** Autocomplete as the buyer types. Survives half-typed and mistyped words. */
export async function suggest(prefix: string, limit = 8) {
  if (!prefix?.trim()) return [];
  const rows = await q<any>(`SELECT * FROM suggest_search($1, $2)`, [prefix.trim(), limit]);
  return rows.map((r) => ({
    suggestion: r.suggestion,
    kind: r.kind as 'product' | 'category' | 'store',
    hits: Number(r.hits),
  }));
}

/** Nearby shops, closest first. */
export async function storesNear(
  lat: number, lng: number, radiusKm = 25, limit = 20,
) {
  return q<any>(
    `SELECT s.id, s.name, s.slug, s.type, s.logo_url, s.region, s.district,
            s.rating_average, s.rating_count,
            km_between($1::float8, $2::float8, s.lat, s.lng) AS distance_km,
            (SELECT count(*) FROM products p
              WHERE p.store_id = s.id AND p.status = 'active') AS listings
       FROM stores s
      WHERE s.status = 'active'
        AND s.lat IS NOT NULL
        AND km_between($1::float8, $2::float8, s.lat, s.lng) <= $3::float8
      ORDER BY distance_km ASC
      LIMIT $4`,
    [lat, lng, radiusKm, limit],
  ).then((rows) => rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    type: r.type,
    logoUrl: r.logo_url,
    region: r.region,
    district: r.district,
    rating: { average: Number(r.rating_average), count: Number(r.rating_count) },
    distanceKm: Number(Number(r.distance_km).toFixed(1)),
    listings: Number(r.listings),
  })));
}

// ─── What the market is telling us ───────────────────────────────────────────

/**
 * Searches that found NOTHING.
 *
 * This is the most commercially useful report on the platform: it is a list of
 * things people came here wanting to buy and could not. Every row is a gap a
 * seller could fill, and a sale NationMart didn't make.
 */
export async function unmetDemand(days = 30, limit = 30) {
  return q<any>(
    `SELECT query,
            count(*)          AS searches,
            count(DISTINCT user_id) AS people,
            max(created_at)   AS last_searched,
            array_agg(DISTINCT region) FILTER (WHERE region IS NOT NULL) AS regions
       FROM search_log
      WHERE results = 0
        AND created_at > now() - ($1 || ' days')::interval
      GROUP BY query
      HAVING count(*) > 1
      ORDER BY searches DESC, people DESC
      LIMIT $2`,
    [String(days), limit],
  ).then((rows) => rows.map((r) => ({
    query: r.query,
    searches: Number(r.searches),
    people: Number(r.people),
    lastSearched: r.last_searched,
    regions: r.regions ?? [],
  })));
}

/** The most-searched terms that DO return results — what the market wants. */
export async function trending(days = 7, limit = 15) {
  return q<any>(
    `SELECT query, count(*) AS searches
       FROM search_log
      WHERE results > 0
        AND created_at > now() - ($1 || ' days')::interval
      GROUP BY query
      ORDER BY searches DESC
      LIMIT $2`,
    [String(days), limit],
  ).then((rows) => rows.map((r) => ({
    query: r.query, searches: Number(r.searches),
  })));
}

/** Teach the search a new local name. */
export async function addAlias(alias: string, canonical: string) {
  const rows = await q<any>(
    `INSERT INTO search_aliases (alias, canonical)
     VALUES (lower(trim($1)), lower(trim($2)))
     ON CONFLICT (alias, canonical) DO NOTHING
     RETURNING *`,
    [alias, canonical],
  );
  return rows[0] ?? null;
}

export async function listAliases() {
  return q<any>(`SELECT alias, canonical FROM search_aliases ORDER BY alias`);
}
