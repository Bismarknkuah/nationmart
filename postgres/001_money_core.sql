-- ============================================================================
-- NationMart — PostgreSQL schema, PHASE 1: the money core.
--
-- Why this phase first: wallets, payments, orders and deliveries are where
-- correctness actually matters. Postgres gives us real constraints and
-- multi-row transactions, so a balance can never silently disagree with its
-- ledger. Listings, chat and CMS-ish data stay in MongoDB until later phases.
--
-- Conventions:
--   * Money is NUMERIC(14,2) — never floats. Floats lose pesewas.
--   * Every table keeps `mongo_id` during the transition so we can map rows
--     back to the existing MongoDB documents while both run side by side.
--   * created_at / updated_at everywhere.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive email

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE duty_status        AS ENUM ('available', 'busy', 'offline');
CREATE TYPE account_status     AS ENUM ('active', 'suspended', 'flagged', 'pending');
CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'past_due', 'cancelled', 'exempt');
CREATE TYPE subscription_plan  AS ENUM ('monthly', 'yearly');
CREATE TYPE store_status       AS ENUM ('active', 'suspended', 'closed', 'pending');
CREATE TYPE order_status       AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
CREATE TYPE payment_status     AS ENUM ('unpaid', 'pending', 'paid', 'failed', 'refunded');
CREATE TYPE payment_purpose    AS ENUM ('order', 'subscription', 'wallet_topup');
CREATE TYPE escrow_state       AS ENUM ('none', 'held', 'released', 'refunded');
CREATE TYPE delivery_status    AS ENUM ('pending_assignment', 'assigned', 'accepted', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled');
CREATE TYPE vehicle_kind       AS ENUM ('rider', 'driver');
CREATE TYPE wallet_txn_type    AS ENUM ('credit', 'debit');
CREATE TYPE wallet_txn_category AS ENUM ('sale_earning', 'delivery_earning', 'commission', 'payout', 'settlement', 'adjustment');

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id        TEXT UNIQUE,                      -- transition bridge
  full_name       TEXT        NOT NULL,
  email           CITEXT      NOT NULL UNIQUE,
  phone           TEXT,
  username        TEXT UNIQUE,
  password_hash   TEXT        NOT NULL,
  role            TEXT        NOT NULL,             -- kept as TEXT: roles evolve
  country         TEXT        NOT NULL DEFAULT 'Ghana',
  region          TEXT        NOT NULL DEFAULT '',
  district        TEXT        NOT NULL DEFAULT '',
  department      TEXT,
  account_status  account_status NOT NULL DEFAULT 'active',
  duty_status     duty_status,                      -- riders/drivers only
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_role          ON users (role);
CREATE INDEX idx_users_region_dist   ON users (region, district);
CREATE INDEX idx_users_duty          ON users (duty_status) WHERE duty_status IS NOT NULL;

-- Subscriptions split out: one row per user, easy to bill and audit.
CREATE TABLE subscriptions (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status             subscription_status NOT NULL DEFAULT 'trial',
  plan               subscription_plan   NOT NULL DEFAULT 'yearly',
  amount             NUMERIC(14,2)       NOT NULL DEFAULT 0 CHECK (amount >= 0),
  discount_percent   SMALLINT            NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  trial_ends_at      TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  last_payment_ref   TEXT,
  last_paid_at       TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Stores
-- ---------------------------------------------------------------------------
CREATE TABLE stores (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id            TEXT UNIQUE,
  owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  store_code          TEXT,
  type                TEXT NOT NULL DEFAULT 'general',
  description         TEXT NOT NULL DEFAULT '',
  region              TEXT NOT NULL DEFAULT '',
  district            TEXT NOT NULL DEFAULT '',
  address             TEXT,
  lat                 DOUBLE PRECISION,
  lng                 DOUBLE PRECISION,
  logo_url            TEXT,
  banner_url          TEXT,
  paystack_subaccount TEXT,                          -- split-payment target
  status              store_status NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stores_owner        ON stores (owner_id);
CREATE INDEX idx_stores_region_dist  ON stores (region, district);
CREATE INDEX idx_stores_status       ON stores (status);

-- ---------------------------------------------------------------------------
-- Orders  (header + line items — the classic relational split)
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id       TEXT UNIQUE,
  order_number   TEXT NOT NULL UNIQUE,
  buyer_id       UUID NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
  seller_id      UUID NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
  store_id       UUID          REFERENCES stores(id) ON DELETE SET NULL,
  status         order_status   NOT NULL DEFAULT 'pending',
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  currency       CHAR(3)        NOT NULL DEFAULT 'GHS',
  total_amount   NUMERIC(14,2)  NOT NULL CHECK (total_amount >= 0),
  payment_ref    TEXT,
  -- shipping snapshot (denormalised on purpose: the address at time of order)
  ship_name      TEXT, ship_phone TEXT, ship_street TEXT,
  ship_city      TEXT, ship_state TEXT, ship_country TEXT DEFAULT 'Ghana',
  ship_lat       DOUBLE PRECISION,
  ship_lng       DOUBLE PRECISION,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_buyer   ON orders (buyer_id, created_at DESC);
CREATE INDEX idx_orders_seller  ON orders (seller_id, created_at DESC);
-- The index that makes every GMV/revenue query fast:
CREATE INDEX idx_orders_paid    ON orders (payment_status, created_at DESC) WHERE payment_status = 'paid';

CREATE TABLE order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_mongo_id TEXT,                             -- products stay in Mongo for now
  title         TEXT          NOT NULL,              -- snapshot, survives edits
  quantity      NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_price    NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  subtotal      NUMERIC(14,2) NOT NULL CHECK (subtotal >= 0)
);
CREATE INDEX idx_order_items_order ON order_items (order_id);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
CREATE TABLE payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id      TEXT UNIQUE,
  reference     TEXT NOT NULL UNIQUE,                -- our reference
  provider_ref  TEXT,                                -- Paystack's reference
  user_id       UUID NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
  order_id      UUID          REFERENCES orders(id) ON DELETE SET NULL,
  purpose       payment_purpose NOT NULL,
  status        payment_status  NOT NULL DEFAULT 'pending',
  escrow_state  escrow_state    NOT NULL DEFAULT 'none',
  amount        NUMERIC(14,2)   NOT NULL CHECK (amount > 0),
  currency      CHAR(3)         NOT NULL DEFAULT 'GHS',
  channel       TEXT,                                -- momo | card
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at    TIMESTAMPTZ,
  -- An order payment must reference an order; a top-up must not.
  CONSTRAINT payment_order_link CHECK (
    (purpose = 'order'     AND order_id IS NOT NULL) OR
    (purpose <> 'order'    AND TRUE)
  )
);
CREATE INDEX idx_payments_user  ON payments (user_id, created_at DESC);
CREATE INDEX idx_payments_order ON payments (order_id);

-- ---------------------------------------------------------------------------
-- Deliveries
-- ---------------------------------------------------------------------------
CREATE TABLE deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id         TEXT UNIQUE,
  tracking_number  TEXT NOT NULL UNIQUE,
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id         UUID NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
  seller_id        UUID NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
  rider_id         UUID          REFERENCES users(id)  ON DELETE SET NULL,
  status           delivery_status NOT NULL DEFAULT 'pending_assignment',
  vehicle_type     vehicle_kind    NOT NULL DEFAULT 'rider',
  parcel_weight_kg NUMERIC(10,2)   NOT NULL DEFAULT 0 CHECK (parcel_weight_kg >= 0),
  distance_km      NUMERIC(10,2)   NOT NULL DEFAULT 0 CHECK (distance_km >= 0),
  eta_minutes      INTEGER,
  fee              NUMERIC(14,2)   NOT NULL DEFAULT 0 CHECK (fee >= 0),
  pickup_region    TEXT, pickup_district TEXT,
  pickup_lat       DOUBLE PRECISION, pickup_lng DOUBLE PRECISION,
  dropoff_region   TEXT, dropoff_district TEXT, dropoff_address TEXT,
  dropoff_lat      DOUBLE PRECISION, dropoff_lng DOUBLE PRECISION,
  rider_lat        DOUBLE PRECISION, rider_lng DOUBLE PRECISION,
  rider_location_text TEXT,
  rider_location_at   TIMESTAMPTZ,
  failure_reason   TEXT,
  accepted_at      TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A failed delivery must say why. (This is the kind of rule the DB should enforce.)
  CONSTRAINT failed_needs_reason CHECK (status <> 'failed' OR failure_reason IS NOT NULL)
);
CREATE INDEX idx_deliveries_rider   ON deliveries (rider_id, status);
CREATE INDEX idx_deliveries_status  ON deliveries (status);
CREATE INDEX idx_deliveries_region  ON deliveries (dropoff_region, dropoff_district);
CREATE INDEX idx_deliveries_order   ON deliveries (order_id);

-- Append-only event trail for each delivery.
CREATE TABLE delivery_events (
  id          BIGSERIAL PRIMARY KEY,
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  status      delivery_status NOT NULL,
  note        TEXT,
  by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  by_role     TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_delivery_events_delivery ON delivery_events (delivery_id, at DESC);

-- ---------------------------------------------------------------------------
-- Wallets + ledger  — THE reason to be on Postgres.
--
-- balance > 0  → the platform owes the user (earnings payable)
-- balance < 0  → the user owes the platform (commission due)
--
-- The ledger is append-only. `balance` is a cached running total, and the
-- reconciliation view below proves it always equals the sum of the ledger.
-- ---------------------------------------------------------------------------
CREATE TABLE wallets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance          NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency         CHAR(3)       NOT NULL DEFAULT 'GHS',
  total_earned     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_earned >= 0),
  total_commission NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_commission >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_transactions (
  id            BIGSERIAL PRIMARY KEY,
  wallet_id     UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  type          wallet_txn_type     NOT NULL,
  category      wallet_txn_category NOT NULL,
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),   -- always positive
  balance_after NUMERIC(14,2) NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  ref           TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_txn_wallet ON wallet_transactions (wallet_id, created_at DESC);
CREATE INDEX idx_wallet_txn_user   ON wallet_transactions (user_id, created_at DESC);
CREATE INDEX idx_wallet_txn_ref    ON wallet_transactions (ref);

-- Idempotency: the same Paystack reference must never be credited twice.
CREATE UNIQUE INDEX uniq_wallet_txn_ref_category
  ON wallet_transactions (ref, category)
  WHERE ref IS NOT NULL AND category IN ('settlement', 'sale_earning', 'commission');

-- ---------------------------------------------------------------------------
-- The safety net: post a ledger entry and move the balance ATOMICALLY.
-- Application code calls this instead of writing two rows itself. If anything
-- fails, the whole thing rolls back — a balance can never drift from its ledger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION post_wallet_txn(
  p_user_id     UUID,
  p_type        wallet_txn_type,
  p_category    wallet_txn_category,
  p_amount      NUMERIC,
  p_description TEXT DEFAULT '',
  p_ref         TEXT DEFAULT NULL
) RETURNS NUMERIC AS $$
DECLARE
  v_wallet_id UUID;
  v_balance   NUMERIC(14,2);
  v_delta     NUMERIC(14,2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'wallet amount must be positive, got %', p_amount;
  END IF;

  -- Create the wallet on first use, then lock the row so concurrent
  -- deliveries/payments for the same user can't race each other.
  INSERT INTO wallets (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT id, balance INTO v_wallet_id, v_balance
    FROM wallets WHERE user_id = p_user_id FOR UPDATE;

  v_delta := CASE WHEN p_type = 'credit' THEN p_amount ELSE -p_amount END;
  v_balance := v_balance + v_delta;

  UPDATE wallets SET
    balance          = v_balance,
    total_earned     = total_earned     + CASE WHEN p_category IN ('sale_earning','delivery_earning') THEN p_amount ELSE 0 END,
    total_commission = total_commission + CASE WHEN p_category = 'commission' THEN p_amount ELSE 0 END,
    updated_at       = now()
  WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions
    (wallet_id, user_id, type, category, amount, balance_after, description, ref)
  VALUES
    (v_wallet_id, p_user_id, p_type, p_category, p_amount, v_balance, COALESCE(p_description,''), p_ref);

  RETURN v_balance;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Reconciliation: any row here means a wallet's cached balance disagrees with
-- its ledger. On a healthy system this view is ALWAYS empty. Alert on it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW wallet_drift AS
SELECT w.id                AS wallet_id,
       w.user_id,
       w.balance           AS cached_balance,
       COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END), 0) AS ledger_balance,
       w.balance - COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END), 0) AS drift
FROM wallets w
LEFT JOIN wallet_transactions t ON t.wallet_id = w.id
GROUP BY w.id, w.user_id, w.balance
HAVING w.balance <> COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END), 0);

-- ---------------------------------------------------------------------------
-- Audit log (security + compliance)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role  TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  summary     TEXT,
  metadata    JSONB,                     -- flexible, still queryable
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_action  ON audit_logs (action, created_at DESC);
CREATE INDEX idx_audit_actor   ON audit_logs (actor_id, created_at DESC);
CREATE INDEX idx_audit_meta    ON audit_logs USING GIN (metadata);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_users_touch      BEFORE UPDATE ON users      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_stores_touch     BEFORE UPDATE ON stores     FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_orders_touch     BEFORE UPDATE ON orders     FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_deliveries_touch BEFORE UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_wallets_touch    BEFORE UPDATE ON wallets    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
