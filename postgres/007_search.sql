-- ============================================================================
-- NationMart — PostgreSQL schema, 007: search that works for how people type.
--
-- The old search was `websearch_to_tsquery` over a tsvector. It is fast and it
-- is exact — which means "cemnt", "sement", "roofin sheet" all return NOTHING.
-- Every one of those is a lost sale, and in a market where people type on
-- feature phones and spell by ear, they are not edge cases.
--
-- This adds:
--   • trigram fuzzy matching — typos and misspellings still find the product
--   • a Ghana-specific alias table — local and trade names map to real listings
--     ("odum" → iroko, "aluzinc" → roofing sheet, "gari" → cassava flour)
--   • distance-aware ranking — a seller 2km away beats one 200km away
--   • autocomplete and "did you mean"
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ─── Trigram indexes ─────────────────────────────────────────────────────────
-- GIN over trigrams. This is what makes similarity('cement','cemnt') fast enough
-- to run across the whole catalogue.
CREATE INDEX IF NOT EXISTS idx_products_title_trgm
  ON products USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_category_trgm
  ON products USING GIN (category gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_stores_name_trgm
  ON stores USING GIN (name gin_trgm_ops);

-- Geo pre-filter. The haversine maths is exact but cannot use an index, so we
-- bound the search box on lat/lng first and only compute distance on survivors.
CREATE INDEX IF NOT EXISTS idx_products_latlng
  ON products (lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- ─── Ghana search aliases ────────────────────────────────────────────────────
-- What people actually say, mapped to what sellers actually type. This is local
-- knowledge, and it is the difference between a market that works and one that
-- returns "no results" to a farmer searching for "abe ngo".
CREATE TABLE IF NOT EXISTS search_aliases (
  id         BIGSERIAL PRIMARY KEY,
  alias      TEXT NOT NULL,          -- what the buyer types
  canonical  TEXT NOT NULL,          -- what it means
  weight     REAL NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (alias, canonical)
);
CREATE INDEX IF NOT EXISTS idx_aliases_alias_trgm
  ON search_aliases USING GIN (alias gin_trgm_ops);

INSERT INTO search_aliases (alias, canonical) VALUES
  -- Timber: local names for the same species
  ('odum', 'iroko'), ('iroko', 'odum'),
  ('wawa', 'obeche'), ('obeche', 'wawa'),
  ('emeri', 'idigbo'), ('ofram', 'limba'),
  ('sapele', 'mahogany'), ('edinam', 'mahogany'),
  -- Building
  ('aluzinc', 'roofing sheet'), ('zinc', 'roofing sheet'),
  ('roofing sheet', 'aluzinc'),
  ('simenti', 'cement'), ('dangote', 'cement'), ('ghacem', 'cement'),
  ('iron rod', 'reinforcement bar'), ('rod', 'reinforcement bar'),
  ('chippings', 'aggregate'), ('stones', 'aggregate'),
  ('blocks', 'cement block'), ('bricks', 'cement block'),
  -- Farm produce
  ('gari', 'cassava'), ('kokonte', 'cassava'),
  ('abe ngo', 'palm oil'), ('zomi', 'palm oil'), ('red oil', 'palm oil'),
  ('kube', 'coconut'),
  ('nkate', 'groundnut'), ('peanut', 'groundnut'),
  ('bankye', 'cassava'), ('borode', 'plantain'),
  ('kontomire', 'cocoyam leaves'),
  ('tomatoes', 'tomato'), ('nkruma', 'okro'), ('okra', 'okro'),
  -- Trade
  ('provisions', 'groceries'), ('foodstuff', 'groceries')
ON CONFLICT DO NOTHING;

-- ─── Distance ────────────────────────────────────────────────────────────────
-- Great-circle distance in km. IMMUTABLE so the planner can reuse it.
CREATE OR REPLACE FUNCTION km_between(
  lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
  SELECT 6371 * 2 * asin(sqrt(
    power(sin(radians($3 - $1) / 2), 2) +
    cos(radians($1)) * cos(radians($3)) *
    power(sin(radians($4 - $2) / 2), 2)
  ));
$$ LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE;

-- ─── The search ──────────────────────────────────────────────────────────────
-- A hybrid: exact full-text where it hits, trigram similarity where it doesn't,
-- then ranked by relevance, distance, rating and stock.
--
-- The typo case is the whole point. A buyer typing "cemnt" gets cement, not an
-- empty page.
-- CREATE OR REPLACE cannot change a RETURNS TABLE signature, so drop first.
DROP FUNCTION IF EXISTS search_products_v2(TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,
  DOUBLE PRECISION,DOUBLE PRECISION,DOUBLE PRECISION,BOOLEAN,TEXT,INT,INT);
CREATE OR REPLACE FUNCTION search_products_v2(
  p_query      TEXT DEFAULT NULL,
  p_category   TEXT DEFAULT NULL,
  p_region     TEXT DEFAULT NULL,
  p_district   TEXT DEFAULT NULL,
  p_min_price  NUMERIC DEFAULT NULL,
  p_max_price  NUMERIC DEFAULT NULL,
  p_lat        DOUBLE PRECISION DEFAULT NULL,
  p_lng        DOUBLE PRECISION DEFAULT NULL,
  p_radius_km  DOUBLE PRECISION DEFAULT NULL,
  p_in_stock   BOOLEAN DEFAULT FALSE,
  p_sort       TEXT DEFAULT 'relevance',   -- relevance | distance | price_asc | price_desc | rating | newest
  p_limit      INT DEFAULT 40,
  p_offset     INT DEFAULT 0
) RETURNS TABLE (
  id                UUID,
  title             TEXT,
  description       TEXT,
  category          TEXT,
  price_per_unit    NUMERIC,
  currency          TEXT,
  unit              TEXT,
  discount_percent  SMALLINT,
  available_quantity NUMERIC,
  status            TEXT,
  images            TEXT[],
  region            TEXT,
  district          TEXT,
  town              TEXT,
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  rating_average    NUMERIC,
  rating_count      INT,
  store_id          UUID,
  store_name        TEXT,
  store_slug        TEXT,
  seller_id         UUID,
  distance_km       DOUBLE PRECISION,
  relevance         REAL,
  matched_by        TEXT
) AS $$
DECLARE
  v_q        TEXT := NULLIF(trim(unaccent(lower(coalesce(p_query, '')))), '');
  v_expanded TEXT;
BEGIN
  -- Expand the query with any Ghana aliases: "odum" also searches "iroko".
  IF v_q IS NOT NULL THEN
    SELECT string_agg(DISTINCT a.canonical, ' ')
      INTO v_expanded
      FROM search_aliases a
     WHERE a.alias = v_q OR similarity(a.alias, v_q) > 0.55;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      p.id, p.title, p.description, p.category, p.price_per_unit,
      p.currency::text AS currency,
      p.unit, p.discount_percent, p.available_quantity, p.status::text AS status,
      p.images, p.region, p.district, p.town, p.lat, p.lng,
      p.rating_average, p.rating_count, p.store_id, p.seller_id, p.created_at,
      p.view_count,
      s.name AS store_name, s.slug AS store_slug,

      -- Exact, word-aware relevance.
      CASE WHEN v_q IS NULL THEN 0::real
           ELSE ts_rank(p.search_vector, websearch_to_tsquery('english', v_q))
      END AS ts_score,

      -- Fuzzy relevance: survives typos and phonetic spelling.
      --
      -- word_similarity(), NOT similarity(). The difference decides whether the
      -- feature works at all: against the title "Dangote Cement 50kg", the query
      -- "sement" scores 0.17 on similarity() (below any usable threshold — the
      -- long title dilutes it) but 0.57 on word_similarity(), which compares the
      -- query to the closest WORD inside the text. Real titles are long; buyers
      -- type one word.
      CASE WHEN v_q IS NULL THEN 0::real
           ELSE GREATEST(
             word_similarity(v_q, unaccent(lower(p.title))),
             word_similarity(v_q, unaccent(lower(p.category))) * 0.7,
             COALESCE(word_similarity(v_q, unaccent(lower(s.name))), 0) * 0.5
           )
      END AS trgm_score,

      -- Alias relevance: "odum" finds an iroko listing.
      CASE WHEN v_expanded IS NULL THEN 0::real
           ELSE word_similarity(v_expanded, unaccent(lower(p.title)))
      END AS alias_score,

      CASE WHEN p_lat IS NULL OR p.lat IS NULL THEN NULL
           ELSE km_between(p_lat, p_lng, p.lat, p.lng)
      END AS dist
    FROM products p
    LEFT JOIN stores s ON s.id = p.store_id
    -- Sold-out listings still show (the buyer wants to know this shop stocks it,
    -- and can ask for a restock) but are demoted below anything in stock. Set
    -- p_in_stock to hide them entirely.
    WHERE p.status IN ('active', 'sold_out')
      AND (p_category  IS NULL OR p.category = p_category)
      AND (p_region    IS NULL OR p.region   = p_region)
      AND (p_district  IS NULL OR p.district = p_district)
      AND (p_min_price IS NULL OR p.price_per_unit >= p_min_price)
      AND (p_max_price IS NULL OR p.price_per_unit <= p_max_price)
      AND (p_in_stock IS FALSE OR p.available_quantity > 0)
      -- Cheap bounding-box prefilter before the trigonometry.
      AND (
        p_lat IS NULL OR p_radius_km IS NULL OR p.lat IS NULL
        OR (p.lat BETWEEN p_lat - (p_radius_km / 111.0)
                      AND p_lat + (p_radius_km / 111.0)
            AND p.lng BETWEEN p_lng - (p_radius_km / (111.0 * cos(radians(p_lat))))
                          AND p_lng + (p_radius_km / (111.0 * cos(radians(p_lat)))))
      )
  ),
  scored AS (
    SELECT c.*,
      (
        c.ts_score * 4.0                                    -- an exact match wins
        + c.trgm_score * 2.0                                -- a near-miss still counts
        + c.alias_score * 1.5                               -- local name, real listing
        + LEAST(c.rating_average::real / 5.0, 1.0) * 0.5    -- well-reviewed
        + LEAST(c.view_count::real / 500.0, 1.0) * 0.2      -- popular
        + CASE WHEN c.available_quantity > 0 THEN 0.3 ELSE -0.5 END  -- sold out sinks
        -- Near beats far. A 2km seller outranks a 200km one on equal relevance.
        + CASE WHEN c.dist IS NULL THEN 0
               ELSE GREATEST(0, 1.0 - (c.dist / 100.0)) * 1.2
          END
      )::real AS relevance,
      CASE WHEN c.ts_score    > 0.01 THEN 'exact'
           WHEN c.alias_score > 0.40 THEN 'local_name'
           WHEN c.trgm_score  > 0.35 THEN 'fuzzy'
           ELSE 'browse'
      END AS matched_by
    FROM candidates c
  )
  SELECT
    s.id, s.title, s.description, s.category, s.price_per_unit, s.currency,
    s.unit, s.discount_percent, s.available_quantity, s.status, s.images,
    s.region, s.district, s.town, s.lat, s.lng,
    s.rating_average, s.rating_count,
    s.store_id, s.store_name, s.store_slug, s.seller_id,
    s.dist, s.relevance, s.matched_by
  FROM scored s
  WHERE
    -- With no query, this is a browse: everything qualifies.
    v_q IS NULL
    -- With a query, keep anything that matched by ANY route. The 0.35 word-
    -- similarity floor is what lets "cemnt" and "sement" through while keeping
    -- junk out.
    OR s.ts_score > 0.01
    OR s.trgm_score > 0.35
    OR s.alias_score > 0.40
  ORDER BY
    CASE WHEN p_sort = 'distance'   THEN s.dist END ASC NULLS LAST,
    CASE WHEN p_sort = 'price_asc'  THEN s.price_per_unit END ASC,
    CASE WHEN p_sort = 'price_desc' THEN s.price_per_unit END DESC,
    CASE WHEN p_sort = 'rating'     THEN s.rating_average END DESC,
    CASE WHEN p_sort = 'newest'     THEN s.created_at END DESC,
    CASE WHEN p_sort = 'relevance' OR p_sort IS NULL THEN s.relevance END DESC,
    s.rating_average DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── Autocomplete ────────────────────────────────────────────────────────────
-- What the buyer sees as they type. Trigram-backed, so it survives half-typed
-- and mistyped words.
DROP FUNCTION IF EXISTS suggest_search(TEXT,INT);
CREATE OR REPLACE FUNCTION suggest_search(
  p_prefix TEXT,
  p_limit  INT DEFAULT 8
) RETURNS TABLE (suggestion TEXT, kind TEXT, hits BIGINT) AS $$
  WITH v AS (SELECT NULLIF(trim(unaccent(lower(p_prefix))), '') AS q)
  SELECT * FROM (
    -- Matching product titles
    SELECT p.title AS suggestion, 'product' AS kind, count(*) AS hits
      FROM products p, v
     WHERE v.q IS NOT NULL
       AND p.status = 'active'
       AND (unaccent(lower(p.title)) ILIKE v.q || '%'
            OR word_similarity(v.q, unaccent(lower(p.title))) > 0.45)
     GROUP BY p.title

    UNION ALL

    -- Matching categories
    SELECT DISTINCT p.category, 'category', count(*) OVER (PARTITION BY p.category)
      FROM products p, v
     WHERE v.q IS NOT NULL
       AND p.status = 'active'
       AND (p.category ILIKE v.q || '%'
            OR word_similarity(v.q, p.category) > 0.45)

    UNION ALL

    -- Matching shops
    SELECT s.name, 'store', 1::bigint
      FROM stores s, v
     WHERE v.q IS NOT NULL
       AND s.status = 'active'
       AND (unaccent(lower(s.name)) ILIKE v.q || '%'
            OR word_similarity(v.q, unaccent(lower(s.name))) > 0.45)
  ) x
  ORDER BY hits DESC, suggestion
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- ─── "Did you mean …?" ───────────────────────────────────────────────────────
-- When a search truly finds nothing, offer the closest real thing rather than a
-- dead end.
CREATE OR REPLACE FUNCTION did_you_mean(p_query TEXT)
RETURNS TEXT AS $$
  SELECT term FROM (
    SELECT p.title AS term,
           word_similarity(unaccent(lower(p_query)), unaccent(lower(p.title))) AS s
      FROM products p WHERE p.status = 'active'
    UNION ALL
    SELECT a.canonical, word_similarity(unaccent(lower(p_query)), a.alias)
      FROM search_aliases a
  ) x
  WHERE s > 0.35
  ORDER BY s DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ─── What people search for ──────────────────────────────────────────────────
-- Searches that return nothing are the most valuable data the platform has: they
-- are demand with no supply. Every empty result is a seller opportunity.
CREATE TABLE IF NOT EXISTS search_log (
  id          BIGSERIAL PRIMARY KEY,
  query       TEXT NOT NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  region      TEXT,
  results     INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_log_empty
  ON search_log (created_at DESC) WHERE results = 0;
CREATE INDEX IF NOT EXISTS idx_search_log_query ON search_log (query);
