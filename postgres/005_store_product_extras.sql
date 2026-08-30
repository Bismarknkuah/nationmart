-- ============================================================================
-- NationMart — PostgreSQL schema, 005: store & product extras.
--
-- Adds the fields the existing storefront and listing flows actually use:
-- market scope, store numbers/codes, staff with permissions, product
-- traceability, and a review queue.
-- ============================================================================

CREATE TYPE market_scope AS ENUM ('local', 'international', 'both');

-- New listings await review, so this joins the product lifecycle.
ALTER TYPE product_status ADD VALUE IF NOT EXISTS 'pending_review';

-- ─── Stores ─────────────────────────────────────────────────────────────────
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS store_number     TEXT,
  ADD COLUMN IF NOT EXISTS country          TEXT NOT NULL DEFAULT 'Ghana',
  ADD COLUMN IF NOT EXISTS market_scope     market_scope NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS is_international BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS theme            JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rating_average   NUMERIC(3,2) NOT NULL DEFAULT 0
      CHECK (rating_average BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS rating_count     INTEGER NOT NULL DEFAULT 0
      CHECK (rating_count >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_stores_number
  ON stores (store_number) WHERE store_number IS NOT NULL;

-- Store staff. A separate table (not an array) because each member carries
-- permissions and we need to query "which stores can this person act for?".
CREATE TABLE IF NOT EXISTS store_staff (
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'staff',
  permissions TEXT[] NOT NULL DEFAULT '{}',
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_store_staff_user ON store_staff (user_id);

-- A seller may hold at most two stores.
--
-- NOTE: counting rows and then inserting is NOT enough on its own. Under READ
-- COMMITTED, three concurrent transactions each see zero committed stores, all
-- pass the check, and all three insert — the seller ends up with three. (This
-- was caught by a concurrency test, not by reading the code.)
--
-- Locking the OWNER'S row first serialises concurrent inserts for that seller:
-- the second transaction blocks until the first commits, and only then does its
-- count — which now sees the truth.
CREATE OR REPLACE FUNCTION enforce_store_limit() RETURNS TRIGGER AS $$
DECLARE
  v_count INTEGER;
  v_max   INTEGER := 2;
BEGIN
  -- Serialise on the owner. Concurrent creates for the SAME seller now queue;
  -- creates for different sellers are unaffected.
  PERFORM 1 FROM users WHERE id = NEW.owner_id FOR UPDATE;

  SELECT count(*) INTO v_count FROM stores WHERE owner_id = NEW.owner_id;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'STORE_LIMIT: a seller may own at most % stores', v_max
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_stores_limit ON stores;
CREATE TRIGGER t_stores_limit
BEFORE INSERT ON stores FOR EACH ROW EXECUTE FUNCTION enforce_store_limit();

-- ─── Products ───────────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS market_scope     market_scope NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS is_international BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS origin           TEXT NOT NULL DEFAULT 'Ghana',
  ADD COLUMN IF NOT EXISTS passport_id      TEXT,
  ADD COLUMN IF NOT EXISTS traceability     JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_products_passport
  ON products (passport_id) WHERE passport_id IS NOT NULL;

-- Only live listings should surface on the storefront.
CREATE INDEX IF NOT EXISTS idx_products_pending
  ON products (created_at DESC) WHERE status = 'pending_review';

-- ─── Export compliance (international trade) ─────────────────────────────────
-- Ghana timber and produce exports need real paperwork: a US Lacey Act plant
-- declaration, an EU FLEGT licence, a commercial invoice, a phytosanitary
-- certificate. This is a genuine feature, not an afterthought — so it gets real
-- columns rather than being buried in a JSON blob.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS species              TEXT,
  ADD COLUMN IF NOT EXISTS lacey_act_compliant  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS flegt_licence        TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS export_licence_number TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_export        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS destination_country TEXT,
  ADD COLUMN IF NOT EXISTS lacey_act_generated BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS species TEXT;

-- One row per required document, so progress is a COUNT rather than a guess.
CREATE TABLE IF NOT EXISTS export_compliance_items (
  id           BIGSERIAL PRIMARY KEY,
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item         TEXT NOT NULL,
  completed    BOOLEAN NOT NULL DEFAULT FALSE,
  document_url TEXT,
  completed_at TIMESTAMPTZ,
  UNIQUE (order_id, item)
);
CREATE INDEX IF NOT EXISTS idx_export_items_order ON export_compliance_items (order_id);
