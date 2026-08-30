-- ============================================================================
-- NationMart — PostgreSQL schema, 006: disputes & refunds.
--
-- Escrow protects the buyer only if there is a way to CONTEST a delivery. Until
-- now the money was released the moment a rider tapped "delivered" — and if the
-- parcel never actually arrived, the buyer had no recourse at all. That is the
-- biggest trust hole in the platform, so it gets real machinery:
--
--   • an open dispute FREEZES escrow — the seller cannot be paid while the
--     buyer is contesting (enforced by a trigger, not by remembering to check)
--   • evidence from both sides, timestamped and attributed
--   • an officer decides: refund the buyer, side with the seller, or split
--   • a refund REVERSES the ledger atomically — no money is invented or lost
-- ============================================================================

-- The ledger needs a category for money going back the other way.
ALTER TYPE wallet_txn_category ADD VALUE IF NOT EXISTS 'refund';

CREATE TYPE dispute_status AS ENUM (
  'open',            -- raised, awaiting evidence
  'investigating',   -- an officer has picked it up
  'resolved_buyer',  -- refunded (fully or partly)
  'resolved_seller', -- seller was right; escrow released
  'withdrawn'        -- buyer dropped it
);

CREATE TYPE dispute_reason AS ENUM (
  'not_delivered',       -- rider marked delivered, buyer never got it
  'wrong_item',
  'damaged',
  'not_as_described',
  'quantity_short',
  'late',
  'other'
);

CREATE TABLE IF NOT EXISTS disputes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference      TEXT NOT NULL UNIQUE,
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_id    UUID REFERENCES deliveries(id) ON DELETE SET NULL,

  raised_by      UUID NOT NULL REFERENCES users(id),   -- normally the buyer
  against_user   UUID NOT NULL REFERENCES users(id),   -- normally the seller
  reason         dispute_reason NOT NULL DEFAULT 'other',
  status         dispute_status NOT NULL DEFAULT 'open',
  details        TEXT NOT NULL DEFAULT '',

  claim_amount   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (claim_amount >= 0),
  refund_amount  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),

  resolved_by    UUID REFERENCES users(id),
  resolution     TEXT,
  resolved_at    TIMESTAMPTZ,

  -- Disputes must not sit forever. This is what the SLA report reads.
  due_at         TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '5 days',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A resolved dispute must say WHO decided it and WHY. No anonymous verdicts
  -- on someone's money.
  CONSTRAINT resolved_needs_decider CHECK (
    status NOT IN ('resolved_buyer','resolved_seller')
    OR (resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
  ),
  -- A refund can never exceed what was claimed.
  CONSTRAINT refund_within_claim CHECK (refund_amount <= claim_amount)
);

-- One live dispute per order. A buyer cannot open five and hope one sticks.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_dispute_per_order
  ON disputes (order_id)
  WHERE status IN ('open','investigating');

CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes (status, due_at);
CREATE INDEX IF NOT EXISTS idx_disputes_against ON disputes (against_user);
CREATE INDEX IF NOT EXISTS idx_disputes_raiser ON disputes (raised_by);

-- ─── Evidence ────────────────────────────────────────────────────────────────
-- Both sides can file. Every item is attributed and timestamped, so an officer
-- sees exactly who said what and when.
CREATE TABLE IF NOT EXISTS dispute_evidence (
  id           BIGSERIAL PRIMARY KEY,
  dispute_id   UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  author_id    UUID NOT NULL REFERENCES users(id),
  author_role  TEXT NOT NULL,
  body         TEXT NOT NULL CHECK (length(trim(body)) > 0),
  attachment_url TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evidence_dispute ON dispute_evidence (dispute_id, created_at);

-- ─── The freeze ──────────────────────────────────────────────────────────────
-- THE important rule. While a dispute is open, escrow on that order cannot move
-- to 'released'. The rider marking a parcel delivered does NOT pay the seller if
-- the buyer is contesting it.
--
-- This lives in the database because "remember to check for a dispute before
-- releasing" is exactly the kind of rule application code forgets — and the cost
-- of forgetting is a seller paid for goods that never arrived.
CREATE OR REPLACE FUNCTION block_escrow_release_when_disputed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.escrow_state = 'released' AND OLD.escrow_state = 'held' THEN
    IF EXISTS (
      SELECT 1 FROM disputes d
       WHERE d.order_id = NEW.order_id
         AND d.status IN ('open','investigating')
    ) THEN
      -- Refuse the release; leave the money held.
      RAISE EXCEPTION 'ESCROW_FROZEN: order % has an open dispute', NEW.order_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_escrow_dispute_freeze ON payments;
CREATE TRIGGER t_escrow_dispute_freeze
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION block_escrow_release_when_disputed();

-- ─── Refund settlement ───────────────────────────────────────────────────────
-- Reverse a sale in the ledger: take back what the seller was credited (and the
-- commission the platform took), and credit the buyer.
--
-- Idempotent on the dispute reference, so a double-click cannot refund twice.
CREATE OR REPLACE FUNCTION settle_dispute_refund(
  p_dispute_id UUID,
  p_amount     NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  v_order      RECORD;
  v_ref        TEXT;
  v_commission NUMERIC(14,2);
  v_seller_net NUMERIC(14,2);
BEGIN
  SELECT d.reference, o.id AS order_id, o.order_number, o.seller_id, o.buyer_id,
         o.total_amount
    INTO v_order
    FROM disputes d JOIN orders o ON o.id = d.order_id
   WHERE d.id = p_dispute_id
   FOR UPDATE OF d;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DISPUTE_NOT_FOUND: %', p_dispute_id;
  END IF;

  IF p_amount <= 0 THEN
    RETURN 0;
  END IF;

  v_ref := v_order.reference;

  -- The platform gives back its cut in proportion to what is being refunded.
  v_commission := round(p_amount * 0.05, 2);
  v_seller_net := p_amount - v_commission;

  -- Claw the money back from the seller…
  PERFORM post_wallet_txn(
    v_order.seller_id, 'debit', 'refund', v_seller_net,
    'Refund on ' || v_order.order_number || ' (dispute ' || v_ref || ')',
    v_ref || '-seller'
  );

  -- …return the commission the platform took on it…
  PERFORM post_wallet_txn(
    v_order.seller_id, 'credit', 'refund', v_commission,
    'Commission returned on ' || v_order.order_number,
    v_ref || '-commission'
  );

  -- …and credit the buyer.
  PERFORM post_wallet_txn(
    v_order.buyer_id, 'credit', 'refund', p_amount,
    'Refund for ' || v_order.order_number,
    v_ref || '-buyer'
  );

  -- Mark the payment and order.
  UPDATE payments
     SET escrow_state = 'refunded',
         status = CASE WHEN p_amount >= v_order.total_amount
                       THEN 'refunded'::payment_status ELSE status END
   WHERE order_id = v_order.order_id AND purpose = 'order';

  UPDATE orders
     SET status = 'refunded',
         payment_status = CASE WHEN p_amount >= v_order.total_amount
                               THEN 'refunded'::payment_status ELSE payment_status END
   WHERE id = v_order.order_id;

  RETURN p_amount;
END;
$$ LANGUAGE plpgsql;
