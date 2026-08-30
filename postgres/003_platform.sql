-- ============================================================================
-- NationMart — PostgreSQL schema, PHASE 3: everything else.
--
-- Messaging, notifications, HR, officer comms, workflows, promos, reports,
-- vehicles and the AI tables. After this file, MongoDB owns nothing.
--
-- JSONB is used deliberately (and only) where the shape really is open-ended —
-- audit metadata, AI payloads, workflow step definitions. Everything with a
-- known shape gets real columns and real constraints, because that is the whole
-- point of the move.
-- ============================================================================

CREATE TYPE notification_type AS ENUM (
  'order_placed', 'payment_received', 'payment_failed', 'delivery_update',
  'subscription_due', 'subscription_paid', 'message', 'system', 'promo',
  'leave_decision', 'rider_assigned', 'review'
);
CREATE TYPE leave_status   AS ENUM ('pending', 'approved', 'declined', 'cancelled');
CREATE TYPE leave_kind     AS ENUM ('annual','sick','maternity','paternity','bereavement','unpaid','other');
CREATE TYPE report_status  AS ENUM ('open', 'investigating', 'resolved', 'dismissed');
CREATE TYPE vehicle_status AS ENUM ('active', 'maintenance', 'retired');
CREATE TYPE workflow_state AS ENUM ('pending', 'in_progress', 'blocked', 'done', 'cancelled');

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       notification_type NOT NULL DEFAULT 'system',
  title      TEXT NOT NULL,
  message    TEXT NOT NULL DEFAULT '',
  link       TEXT,
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The query every dashboard runs: my unread, newest first.
CREATE INDEX idx_notifications_user  ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (user_id) WHERE read = FALSE;

-- ---------------------------------------------------------------------------
-- Conversations & messages (buyer ↔ seller ↔ rider)
-- ---------------------------------------------------------------------------
CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID REFERENCES orders(id) ON DELETE CASCADE,   -- set = 3-way order thread
  subject         TEXT NOT NULL DEFAULT '',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One thread per order. Stops duplicate chats appearing.
  CONSTRAINT one_thread_per_order UNIQUE (order_id)
);
CREATE INDEX idx_conversations_recent ON conversations (last_message_at DESC);

CREATE TABLE conversation_participants (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_participants_user ON conversation_participants (user_id);

CREATE TABLE messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  body            TEXT NOT NULL CHECK (length(trim(body)) > 0),   -- no empty messages
  attachment_url  TEXT,
  read            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_thread ON messages (conversation_id, created_at DESC);

-- Keep the thread's "last activity" accurate without the app having to remember.
CREATE OR REPLACE FUNCTION touch_conversation() RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER t_messages_touch_thread
AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION touch_conversation();

-- ---------------------------------------------------------------------------
-- HR: leave, onboarding, payroll
-- ---------------------------------------------------------------------------
CREATE TABLE leave_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          leave_kind   NOT NULL DEFAULT 'annual',
  start_date    DATE         NOT NULL,
  end_date      DATE         NOT NULL,
  days          INTEGER      NOT NULL CHECK (days > 0),
  reason        TEXT         NOT NULL DEFAULT '',
  status        leave_status NOT NULL DEFAULT 'pending',
  decided_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sane_dates CHECK (end_date >= start_date),
  -- A decided request must record who decided it.
  CONSTRAINT decision_has_approver CHECK (
    status IN ('pending','cancelled') OR decided_by IS NOT NULL
  )
);
CREATE INDEX idx_leave_staff  ON leave_requests (staff_id, created_at DESC);
CREATE INDEX idx_leave_status ON leave_requests (status) WHERE status = 'pending';

CREATE TABLE onboarding (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  completed  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE onboarding_tasks (
  id            BIGSERIAL PRIMARY KEY,
  onboarding_id UUID NOT NULL REFERENCES onboarding(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  label         TEXT    NOT NULL,
  done          BOOLEAN NOT NULL DEFAULT FALSE,
  done_at       TIMESTAMPTZ,
  UNIQUE (onboarding_id, position)
);

-- A checklist is complete exactly when every task is ticked. Maintained by the
-- database so the progress bar can never lie.
CREATE OR REPLACE FUNCTION refresh_onboarding() RETURNS TRIGGER AS $$
DECLARE v_id UUID := COALESCE(NEW.onboarding_id, OLD.onboarding_id);
BEGIN
  UPDATE onboarding o
     SET completed = NOT EXISTS (
           SELECT 1 FROM onboarding_tasks t WHERE t.onboarding_id = v_id AND t.done = FALSE),
         updated_at = now()
   WHERE o.id = v_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER t_onboarding_refresh
AFTER INSERT OR UPDATE OR DELETE ON onboarding_tasks
FOR EACH ROW EXECUTE FUNCTION refresh_onboarding();

CREATE TABLE payroll (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period      DATE          NOT NULL,                       -- first day of the month
  gross       NUMERIC(14,2) NOT NULL CHECK (gross >= 0),
  deductions  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (deductions >= 0),
  net         NUMERIC(14,2) NOT NULL CHECK (net >= 0),
  paid        BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Nobody gets paid twice for the same month.
  CONSTRAINT one_payslip_per_period UNIQUE (staff_id, period),
  CONSTRAINT net_is_gross_less_deductions CHECK (net = gross - deductions)
);
CREATE INDEX idx_payroll_period ON payroll (period DESC);

-- ---------------------------------------------------------------------------
-- Officer comms (internal channels)
-- ---------------------------------------------------------------------------
CREATE TABLE officer_channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,          -- 'national-broadcast', 'logistics'
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  is_broadcast BOOLEAN NOT NULL DEFAULT FALSE,
  min_level    SMALLINT NOT NULL DEFAULT 5,   -- 1 = exec … 5 = district
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE officer_messages (
  id         BIGSERIAL PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES officer_channels(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (length(trim(body)) > 0),
  urgent     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_officer_messages ON officer_messages (channel_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Reports (abuse / fraud / disputes)
-- ---------------------------------------------------------------------------
CREATE TABLE reports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_user  UUID REFERENCES users(id) ON DELETE CASCADE,
  order_id       UUID REFERENCES orders(id) ON DELETE SET NULL,
  category       TEXT NOT NULL DEFAULT 'other',
  details        TEXT NOT NULL DEFAULT '',
  status         report_status NOT NULL DEFAULT 'open',
  resolved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ,
  CONSTRAINT resolution_recorded CHECK (
    status NOT IN ('resolved','dismissed') OR resolved_by IS NOT NULL
  )
);
CREATE INDEX idx_reports_status ON reports (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Promo codes
-- ---------------------------------------------------------------------------
CREATE TABLE promo_codes (
  code             TEXT PRIMARY KEY,
  store_id         UUID REFERENCES stores(id) ON DELETE CASCADE,   -- null = platform-wide
  discount_percent SMALLINT CHECK (discount_percent BETWEEN 1 AND 100),
  discount_amount  NUMERIC(14,2) CHECK (discount_amount > 0),
  min_order        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (min_order >= 0),
  max_uses         INTEGER,
  used_count       INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  starts_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exactly one kind of discount, never both, never neither.
  CONSTRAINT one_discount_kind CHECK (
    (discount_percent IS NOT NULL AND discount_amount IS NULL) OR
    (discount_percent IS NULL     AND discount_amount IS NOT NULL)
  ),
  CONSTRAINT within_max_uses CHECK (max_uses IS NULL OR used_count <= max_uses)
);

-- Claim a promo code atomically: validity check + usage increment in one write,
-- so a "10 uses only" code can never be redeemed 11 times under load.
CREATE OR REPLACE FUNCTION claim_promo(p_code TEXT, p_order_total NUMERIC)
RETURNS NUMERIC AS $$
DECLARE v_discount NUMERIC(14,2);
BEGIN
  UPDATE promo_codes
     SET used_count = used_count + 1
   WHERE code = p_code
     AND active
     AND starts_at <= now()
     AND (expires_at IS NULL OR expires_at > now())
     AND (max_uses  IS NULL OR used_count < max_uses)
     AND min_order <= p_order_total
  RETURNING COALESCE(discount_amount, ROUND(p_order_total * discount_percent / 100.0, 2))
  INTO v_discount;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROMO_INVALID: % cannot be used on this order', p_code
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_discount;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Vehicles (rider/driver fleet)
-- ---------------------------------------------------------------------------
CREATE TABLE vehicles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          vehicle_kind   NOT NULL DEFAULT 'rider',
  make          TEXT NOT NULL DEFAULT '',
  model         TEXT NOT NULL DEFAULT '',
  plate_number  TEXT NOT NULL UNIQUE,
  capacity_kg   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (capacity_kg >= 0),
  status        vehicle_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vehicles_owner ON vehicles (owner_id);

-- ---------------------------------------------------------------------------
-- Workflows (officer task system)
-- ---------------------------------------------------------------------------
CREATE TABLE workflow_definitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  steps       JSONB NOT NULL DEFAULT '[]'::jsonb,   -- genuinely open-ended
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow_instances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID REFERENCES workflow_definitions(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  assigned_to   UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_role TEXT,
  region        TEXT NOT NULL DEFAULT '',
  district      TEXT NOT NULL DEFAULT '',
  priority      SMALLINT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  state         workflow_state NOT NULL DEFAULT 'pending',
  due_at        TIMESTAMPTZ,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
CREATE INDEX idx_workflow_assignee ON workflow_instances (assigned_to, state);
CREATE INDEX idx_workflow_overdue   ON workflow_instances (due_at)
  WHERE state IN ('pending','in_progress');

-- ---------------------------------------------------------------------------
-- AI (tasks + knowledge base)
-- ---------------------------------------------------------------------------
CREATE TABLE ai_tasks (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL,
  input      JSONB NOT NULL DEFAULT '{}'::jsonb,
  output     JSONB,
  status     TEXT NOT NULL DEFAULT 'pending',
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_tasks_user ON ai_tasks (user_id, created_at DESC);

CREATE TABLE knowledge_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  tags       TEXT[] NOT NULL DEFAULT '{}',
  uses       INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(question, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(answer, '')), 'B')
  ) STORED
);
CREATE INDEX idx_knowledge_search ON knowledge_entries USING GIN (search_vector);

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------
CREATE TRIGGER t_leave_touch      BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_onboarding_touch BEFORE UPDATE ON onboarding
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
