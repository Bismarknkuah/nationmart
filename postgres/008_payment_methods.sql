-- ============================================================================
-- NationMart — PostgreSQL schema, 008: payment methods & payouts.
--
-- Two gaps this closes.
--
-- 1. CHANNELS WERE DEAD DATA. payments.channel was written and never sent to
--    Paystack. There was no way for a buyer to say "card" and no way to save an
--    instrument for next time.
--
-- 2. PAYOUTS NEVER MOVED MONEY. The finance route posted a ledger debit and
--    stopped. The seller's balance went down; nothing was ever transferred to
--    them. Sellers could not withdraw. A marketplace where sellers cannot be
--    paid is not a marketplace.
--
-- The rule that matters here: a payout DEBITS THE WALLET AT REQUEST TIME, so
-- the same cedi cannot be withdrawn twice while a transfer is in flight. If the
-- transfer later fails or is reversed, the money is credited back. The ledger is
-- the source of truth; Paystack is just the pipe.
-- ============================================================================

-- Card, mobile money, bank account.
CREATE TYPE payment_method_kind AS ENUM ('card', 'mobile_money', 'bank_account');

CREATE TYPE payout_status AS ENUM (
  'pending',      -- requested, wallet already debited
  'processing',   -- handed to Paystack
  'paid',         -- money landed
  'failed',       -- Paystack rejected it -> wallet credited back
  'reversed'      -- it landed then bounced -> wallet credited back
);

-- ─── Saved payment methods ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_methods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          payment_method_kind NOT NULL,
  label         TEXT NOT NULL DEFAULT '',

  -- Card (Visa / Mastercard). We NEVER store a PAN. Paystack hands back a
  -- reusable authorization code; that plus the last four is all we keep, and the
  -- last four exists only so a person can tell their two cards apart.
  auth_code     TEXT,
  last4         TEXT,
  card_brand    TEXT,
  exp_month     TEXT,
  exp_year      TEXT,
  issuer        TEXT,

  -- Mobile money.
  momo_phone    TEXT,
  momo_network  TEXT,          -- mtn | telecel | airteltigo

  -- Bank account (payouts).
  bank_code     TEXT,
  bank_name     TEXT,
  account_number TEXT,
  account_name   TEXT,         -- as resolved BY THE BANK, never as typed

  -- Paystack transfer recipient, created lazily on first payout.
  recipient_code TEXT,

  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  verified      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each kind must actually carry the fields it needs. A "card" with no
  -- authorization code is not a card, and it should not be possible to store one.
  CONSTRAINT card_needs_auth CHECK (
    kind <> 'card' OR (auth_code IS NOT NULL AND last4 IS NOT NULL)
  ),
  CONSTRAINT momo_needs_phone CHECK (
    kind <> 'mobile_money' OR (momo_phone IS NOT NULL AND momo_network IS NOT NULL)
  ),
  CONSTRAINT bank_needs_account CHECK (
    kind <> 'bank_account' OR (account_number IS NOT NULL AND bank_code IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_pm_user ON payment_methods (user_id);

-- The same card cannot be saved twice on one account.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pm_card
  ON payment_methods (user_id, auth_code) WHERE auth_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pm_momo
  ON payment_methods (user_id, momo_phone, momo_network) WHERE momo_phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pm_bank
  ON payment_methods (user_id, bank_code, account_number) WHERE account_number IS NOT NULL;

-- Exactly one default per user, enforced rather than hoped for.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pm_default
  ON payment_methods (user_id) WHERE is_default;

-- Setting a new default clears the old one, so the partial unique index above
-- can never be violated by ordinary use.
CREATE OR REPLACE FUNCTION demote_other_defaults() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE payment_methods
       SET is_default = FALSE
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND is_default;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_pm_single_default ON payment_methods;
CREATE TRIGGER t_pm_single_default
BEFORE INSERT OR UPDATE OF is_default ON payment_methods
FOR EACH ROW EXECUTE FUNCTION demote_other_defaults();

-- ─── Payouts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payouts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference      TEXT NOT NULL UNIQUE,
  user_id        UUID NOT NULL REFERENCES users(id),
  method_id      UUID REFERENCES payment_methods(id) ON DELETE SET NULL,

  amount         NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency       CHAR(3) NOT NULL DEFAULT 'GHS',
  status         payout_status NOT NULL DEFAULT 'pending',

  -- A snapshot of where the money was sent. The method row can be deleted later;
  -- the record of where GHS 4,000 actually went must not disappear with it.
  destination    TEXT NOT NULL DEFAULT '',

  recipient_code TEXT,
  transfer_code  TEXT,
  provider_ref   TEXT,
  failure_reason TEXT,

  requested_by   UUID REFERENCES users(id),   -- self-service, or a finance officer
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at     TIMESTAMPTZ,

  CONSTRAINT settled_has_time CHECK (
    status <> 'paid' OR settled_at IS NOT NULL
  ),
  CONSTRAINT failed_has_reason CHECK (
    status NOT IN ('failed','reversed') OR failure_reason IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_payouts_user ON payouts (user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_open
  ON payouts (status) WHERE status IN ('pending','processing');
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payouts_transfer
  ON payouts (transfer_code) WHERE transfer_code IS NOT NULL;

-- ─── Requesting a payout ─────────────────────────────────────────────────────
-- Debits the wallet inside the same transaction that creates the payout row, so
-- a double-clicked "Withdraw" cannot spend the same balance twice. The wallet is
-- locked by post_wallet_txn(), which refuses to overdraw.
CREATE OR REPLACE FUNCTION request_payout(
  p_user_id     UUID,
  p_method_id   UUID,
  p_amount      NUMERIC,
  p_reference   TEXT,
  p_destination TEXT,
  p_requested_by UUID
) RETURNS UUID AS $$
DECLARE
  v_balance NUMERIC(14,2);
  v_id      UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'PAYOUT_INVALID_AMOUNT';
  END IF;

  -- Lock the wallet and read the truth, not a stale number from the caller.
  SELECT balance INTO v_balance
    FROM wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_balance IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'PAYOUT_INSUFFICIENT_FUNDS: balance %, requested %',
      COALESCE(v_balance, 0), p_amount;
  END IF;

  INSERT INTO payouts (reference, user_id, method_id, amount, destination, requested_by)
  VALUES (p_reference, p_user_id, p_method_id, p_amount, p_destination, p_requested_by)
  RETURNING id INTO v_id;

  -- Take the money out of the wallet NOW. It is in flight, not spendable.
  PERFORM post_wallet_txn(
    p_user_id, 'debit', 'payout', p_amount,
    'Withdrawal to ' || p_destination, p_reference
  );

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ─── When a transfer fails ───────────────────────────────────────────────────
-- Paystack rejected it, or it bounced after landing. The seller's money must go
-- back. Idempotent on the payout reference: a retried webhook cannot credit the
-- refund twice.
CREATE OR REPLACE FUNCTION reverse_payout(
  p_reference TEXT,
  p_status    payout_status,   -- 'failed' or 'reversed'
  p_reason    TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_payout RECORD;
BEGIN
  SELECT * INTO v_payout FROM payouts WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Already in a terminal state — a duplicate webhook. Do nothing.
  IF v_payout.status IN ('failed', 'reversed', 'paid') THEN
    RETURN FALSE;
  END IF;

  UPDATE payouts
     SET status = p_status,
         failure_reason = COALESCE(p_reason, 'Transfer did not complete.')
   WHERE id = v_payout.id;

  -- Give it back. Keyed on a distinct ref so it cannot collide with the debit.
  PERFORM post_wallet_txn(
    v_payout.user_id, 'credit', 'payout', v_payout.amount,
    'Withdrawal returned: ' || COALESCE(p_reason, 'transfer failed'),
    p_reference || '-reversal'
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ─── When a transfer succeeds ────────────────────────────────────────────────
-- The wallet was already debited at request time, so there is no money to move
-- here. This only records that it landed. Idempotent.
CREATE OR REPLACE FUNCTION complete_payout(
  p_reference    TEXT,
  p_provider_ref TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_payout RECORD;
BEGIN
  SELECT * INTO v_payout FROM payouts WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND OR v_payout.status IN ('paid', 'failed', 'reversed') THEN
    RETURN FALSE;
  END IF;

  UPDATE payouts
     SET status = 'paid',
         settled_at = now(),
         provider_ref = COALESCE(p_provider_ref, provider_ref)
   WHERE id = v_payout.id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ─── Money in flight ─────────────────────────────────────────────────────────
-- Finance needs to see what has left the wallets but not yet reached anyone.
CREATE OR REPLACE VIEW payouts_in_flight AS
  SELECT p.id, p.reference, p.user_id, u.full_name, u.phone,
         p.amount, p.destination, p.status, p.requested_at,
         now() - p.requested_at AS age
    FROM payouts p
    JOIN users u ON u.id = p.user_id
   WHERE p.status IN ('pending', 'processing')
   ORDER BY p.requested_at ASC;
