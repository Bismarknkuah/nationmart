-- ============================================================================
-- NationMart — PostgreSQL schema, 004: complete the users table.
--
-- 001 gave users their skeleton. Registration also carries identity (Ghana Card
-- or foreign ID), payout details (MoMo), business registration, and approval
-- state. Those get real columns and real constraints here — not a loose blob.
-- ============================================================================

-- Riders and drivers land in 'pending_review' until a logistics officer approves.
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'pending_review';

CREATE TYPE id_kind          AS ENUM ('ghana_card', 'national_id', 'passport', 'drivers_license');
CREATE TYPE ghana_card_state AS ENUM ('unverified', 'pending', 'verified', 'rejected');

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS company             TEXT,
  ADD COLUMN IF NOT EXISTS address             TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS id_type             id_kind NOT NULL DEFAULT 'ghana_card',
  ADD COLUMN IF NOT EXISTS id_number           TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ghana_card_number   TEXT,
  ADD COLUMN IF NOT EXISTS ghana_card_status   ghana_card_state NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS ghana_card_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_methods     TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS momo_number         TEXT,
  ADD COLUMN IF NOT EXISTS momo_network        TEXT,
  ADD COLUMN IF NOT EXISTS business_reg_number TEXT,
  ADD COLUMN IF NOT EXISTS tax_id_number       TEXT,
  ADD COLUMN IF NOT EXISTS is_approved         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pending_reason      TEXT,
  ADD COLUMN IF NOT EXISTS partner_code        TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_license     TEXT,
  ADD COLUMN IF NOT EXISTS accepted_terms      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS terms_accepted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version       TEXT NOT NULL DEFAULT 'v1';

-- One Ghana Card = one account. This is the anti-fraud rule that MongoDB could
-- only enforce by convention; here the database simply will not allow a second.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_ghana_card
  ON users (ghana_card_number)
  WHERE ghana_card_number IS NOT NULL AND ghana_card_number <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_partner_code
  ON users (partner_code) WHERE partner_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_approval
  ON users (role, is_approved) WHERE is_approved = FALSE;
