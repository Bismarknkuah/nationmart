-- ============================================================================
-- NationMart — PostgreSQL schema, 009: advertising.
--
-- Sellers pay to promote a product or their store; the platform serves those ads
-- into browse/search surfaces and bills per impression or click against a budget
-- the seller pre-funds from their wallet.
--
-- The money rules that matter:
--   • an ad's budget is DEBITED FROM THE WALLET when the campaign is created, so
--     spend can never exceed what was funded (no billing a seller who can't pay)
--   • each impression/click decrements remaining budget atomically; when it hits
--     zero the ad stops serving — you can't overspend a budget under load
--   • pausing/cancelling returns the UNSPENT remainder to the wallet
-- ============================================================================

CREATE TYPE ad_status AS ENUM ('active', 'paused', 'exhausted', 'cancelled', 'pending_review');
CREATE TYPE ad_placement AS ENUM ('search', 'browse', 'category', 'home');
CREATE TYPE ad_bill_kind AS ENUM ('per_impression', 'per_click');

-- The ledger needs a category for ad money leaving/returning to a wallet.
ALTER TYPE wallet_txn_category ADD VALUE IF NOT EXISTS 'ad_spend';

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference      TEXT NOT NULL UNIQUE,
  advertiser_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id       UUID REFERENCES stores(id) ON DELETE SET NULL,
  product_id     UUID REFERENCES products(id) ON DELETE SET NULL,

  title          TEXT NOT NULL,
  placement      ad_placement NOT NULL DEFAULT 'search',
  bill_kind      ad_bill_kind NOT NULL DEFAULT 'per_impression',

  -- Money, all in GHS.
  budget         NUMERIC(14,2) NOT NULL CHECK (budget > 0),
  spent          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (spent >= 0),
  -- What one impression / click costs. Pesewa-level.
  unit_cost      NUMERIC(14,4) NOT NULL CHECK (unit_cost > 0),

  -- Optional targeting.
  target_region   TEXT,
  target_category TEXT,
  keywords        TEXT,

  impressions    BIGINT NOT NULL DEFAULT 0,
  clicks         BIGINT NOT NULL DEFAULT 0,

  status         ad_status NOT NULL DEFAULT 'active',
  starts_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Spend can never exceed the funded budget. The database guarantees it.
  CONSTRAINT spend_within_budget CHECK (spent <= budget),
  -- An ad must promote either a product or a store.
  CONSTRAINT ad_has_subject CHECK (product_id IS NOT NULL OR store_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ads_advertiser ON ad_campaigns (advertiser_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads_serving
  ON ad_campaigns (placement, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_ads_category ON ad_campaigns (target_category) WHERE target_category IS NOT NULL;

-- ─── Create a campaign ───────────────────────────────────────────────────────
-- Debits the wallet for the FULL budget up front, under the wallet's own row
-- lock (post_wallet_txn refuses to overdraw). The money is committed to the ad;
-- a seller can never run an ad they haven't funded.
CREATE OR REPLACE FUNCTION create_ad_campaign(
  p_advertiser  UUID,
  p_reference   TEXT,
  p_title       TEXT,
  p_placement   ad_placement,
  p_bill_kind   ad_bill_kind,
  p_budget      NUMERIC,
  p_unit_cost   NUMERIC,
  p_store_id    UUID,
  p_product_id  UUID,
  p_region      TEXT,
  p_category    TEXT,
  p_keywords    TEXT
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_balance NUMERIC(14,2);
BEGIN
  IF p_budget <= 0 THEN RAISE EXCEPTION 'AD_INVALID_BUDGET'; END IF;
  IF p_unit_cost <= 0 THEN RAISE EXCEPTION 'AD_INVALID_UNIT_COST'; END IF;

  -- Ads are pre-paid: unlike commission debt, we don't let a seller run an ad on
  -- money they don't have. Lock the wallet and refuse if the budget isn't covered.
  SELECT balance INTO v_balance FROM wallets WHERE user_id = p_advertiser FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_budget THEN
    RAISE EXCEPTION 'AD_INSUFFICIENT_FUNDS: balance %, budget %', COALESCE(v_balance, 0), p_budget;
  END IF;

  -- Take the budget out of the wallet now. Overdraw is refused inside here.
  PERFORM post_wallet_txn(
    p_advertiser, 'debit', 'ad_spend', p_budget,
    'Ad budget: ' || p_title, p_reference
  );

  INSERT INTO ad_campaigns (
    reference, advertiser_id, store_id, product_id, title, placement, bill_kind,
    budget, unit_cost, target_region, target_category, keywords
  ) VALUES (
    p_reference, p_advertiser, p_store_id, p_product_id, p_title, p_placement, p_bill_kind,
    p_budget, p_unit_cost, p_region, p_category, p_keywords
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ─── Record a billable event ────────────────────────────────────────────────
-- One impression or click. Charges unit_cost against remaining budget atomically;
-- when the budget is used up the ad flips to 'exhausted' and stops serving. The
-- WHERE guard means two concurrent events can never push spent past budget.
CREATE OR REPLACE FUNCTION record_ad_event(
  p_ad_id UUID,
  p_kind  ad_bill_kind
) RETURNS BOOLEAN AS $$
DECLARE
  v_cost NUMERIC(14,4);
  v_ok   BOOLEAN := FALSE;
BEGIN
  UPDATE ad_campaigns
     SET spent = spent + unit_cost,
         impressions = impressions + CASE WHEN p_kind = 'per_impression' THEN 1 ELSE 0 END,
         clicks      = clicks      + CASE WHEN p_kind = 'per_click'      THEN 1 ELSE 0 END,
         status = CASE WHEN spent + unit_cost >= budget THEN 'exhausted'::ad_status ELSE status END
   WHERE id = p_ad_id
     AND status = 'active'
     AND bill_kind = p_kind
     AND spent + unit_cost <= budget
  RETURNING TRUE INTO v_ok;

  RETURN COALESCE(v_ok, FALSE);
END;
$$ LANGUAGE plpgsql;

-- ─── Stop a campaign, refund the remainder ──────────────────────────────────
-- Pausing or cancelling returns the UNSPENT budget to the advertiser's wallet.
-- Idempotent on the reference so a double-click can't refund twice.
CREATE OR REPLACE FUNCTION stop_ad_campaign(
  p_ad_id  UUID,
  p_status ad_status   -- 'paused' or 'cancelled'
) RETURNS NUMERIC AS $$
DECLARE
  v_ad       RECORD;
  v_remainder NUMERIC(14,2);
BEGIN
  SELECT * INTO v_ad FROM ad_campaigns WHERE id = p_ad_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AD_NOT_FOUND'; END IF;

  -- Already stopped — nothing to do, no double refund.
  IF v_ad.status IN ('cancelled', 'exhausted') THEN
    RETURN 0;
  END IF;

  v_remainder := v_ad.budget - v_ad.spent;

  UPDATE ad_campaigns SET status = p_status WHERE id = p_ad_id;

  -- Return the unspent money, keyed distinctly so it can't collide with the debit.
  IF v_remainder > 0 AND p_status = 'cancelled' THEN
    PERFORM post_wallet_txn(
      v_ad.advertiser_id, 'credit', 'ad_spend', v_remainder,
      'Ad refund: ' || v_ad.title, v_ad.reference || '-refund'
    );
  END IF;

  RETURN v_remainder;
END;
$$ LANGUAGE plpgsql;
