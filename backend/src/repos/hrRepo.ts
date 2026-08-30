import { q, tx, money } from '../db/pg';
import { notify } from './notificationRepo';

/**
 * HR — PostgreSQL.
 *
 * Rules the database enforces (so the app cannot get them wrong):
 *   • an approved/declined leave request MUST record who decided it
 *   • end date cannot precede start date
 *   • onboarding "completed" is COMPUTED from the tasks, never claimed
 *   • payroll: net must equal gross − deductions, and nobody is paid twice
 *     for the same month
 */

// ─── Leave ───────────────────────────────────────────────────────────────────

export type LeaveKind =
  | 'annual' | 'sick' | 'maternity' | 'paternity' | 'bereavement' | 'unpaid' | 'other';

export interface SubmitLeaveInput {
  staffId: string;
  kind?: LeaveKind;
  startDate: string;
  endDate: string;
  reason?: string;
}

function daysBetween(start: string, end: string): number {
  const a = new Date(start);
  const b = new Date(end);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

export async function submitLeave(input: SubmitLeaveInput) {
  const days = daysBetween(input.startDate, input.endDate);
  if (days < 1) throw new Error('The end date must be on or after the start date.');

  const rows = await q<any>(
    `INSERT INTO leave_requests (staff_id, kind, start_date, end_date, days, reason)
     VALUES ($1::uuid, $2::leave_kind, $3::date, $4::date, $5, $6)
     RETURNING *`,
    [input.staffId, input.kind ?? 'annual', input.startDate, input.endDate, days, input.reason ?? ''],
  );
  return rows[0];
}

export async function myLeave(staffId: string) {
  return q<any>(
    `SELECT * FROM leave_requests WHERE staff_id = $1::uuid
      ORDER BY created_at DESC LIMIT 50`,
    [staffId],
  );
}

/** Staff may withdraw their own request, but only while it is still pending. */
export async function cancelLeave(id: string, staffId: string) {
  const rows = await q<any>(
    `UPDATE leave_requests SET status = 'cancelled'
      WHERE id = $1::uuid AND staff_id = $2::uuid AND status = 'pending'
      RETURNING *`,
    [id, staffId],
  );
  return rows[0] ?? null;
}

/** The HR queue. */
export async function listLeave(status?: string) {
  return q<any>(
    `SELECT l.*, u.full_name AS staff_name, u.role AS staff_role, u.department
       FROM leave_requests l JOIN users u ON u.id = l.staff_id
      WHERE ($1::text IS NULL OR l.status = $1::leave_status::text)
      ORDER BY l.created_at DESC LIMIT 100`,
    [status ?? null],
  );
}

/**
 * Approve or decline. The approver is recorded — the database rejects a decision
 * with no decider, so accountability is not optional.
 */
export async function decideLeave(
  id: string, deciderId: string, approve: boolean, note = '',
) {
  const rows = await q<any>(
    `UPDATE leave_requests
        SET status = $2::leave_status,
            decided_by = $3::uuid,
            decided_at = now(),
            decision_note = $4
      WHERE id = $1::uuid AND status = 'pending'
      RETURNING *`,
    [id, approve ? 'approved' : 'declined', deciderId, note],
  );
  const leave = rows[0];
  if (!leave) return null;

  await notify({
    userId: leave.staff_id,
    type: 'leave_decision',
    title: approve ? 'Leave approved' : 'Leave declined',
    message: approve
      ? `Your ${leave.kind} leave (${leave.days} days) was approved.`
      : `Your ${leave.kind} leave was declined. ${note}`.trim(),
    link: '/hr/workflows',
  });

  return leave;
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

const DEFAULT_TASKS = [
  'Ghana Card verified',
  'Contract signed',
  'Bank / MoMo details captured',
  'Role and permissions assigned',
  'Systems access granted',
  'Induction completed',
];

/** Start a checklist for a new staff member. Idempotent. */
export async function startOnboarding(staffId: string, tasks: string[] = DEFAULT_TASKS) {
  return tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO onboarding (staff_id) VALUES ($1::uuid)
       ON CONFLICT (staff_id) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [staffId],
    );
    const onboardingId = rows[0].id;

    const { rows: existing } = await c.query(
      `SELECT count(*)::int AS n FROM onboarding_tasks WHERE onboarding_id = $1::uuid`,
      [onboardingId],
    );
    if (existing[0].n === 0) {
      for (let i = 0; i < tasks.length; i++) {
        await c.query(
          `INSERT INTO onboarding_tasks (onboarding_id, position, label)
           VALUES ($1::uuid, $2, $3)`,
          [onboardingId, i + 1, tasks[i]],
        );
      }
    }
    return onboardingId;
  });
}

export async function listOnboarding() {
  return q<any>(
    `SELECT o.id, o.staff_id, o.completed, u.full_name AS staff_name, u.role,
            (SELECT count(*) FROM onboarding_tasks t WHERE t.onboarding_id = o.id) AS total,
            (SELECT count(*) FROM onboarding_tasks t
              WHERE t.onboarding_id = o.id AND t.done) AS done,
            (SELECT json_agg(json_build_object(
                'id', t.id, 'label', t.label, 'done', t.done, 'position', t.position)
                ORDER BY t.position)
               FROM onboarding_tasks t WHERE t.onboarding_id = o.id) AS tasks
       FROM onboarding o JOIN users u ON u.id = o.staff_id
      ORDER BY o.created_at DESC LIMIT 50`,
  );
}

/**
 * Tick or untick a task. `completed` on the parent is recomputed by a database
 * trigger, so the progress bar always reflects reality.
 */
export async function toggleTask(taskId: string, done: boolean) {
  const rows = await q<any>(
    `UPDATE onboarding_tasks
        SET done = $2, done_at = CASE WHEN $2 THEN now() ELSE NULL END
      WHERE id = $1
      RETURNING onboarding_id`,
    [taskId, done],
  );
  if (!rows[0]) return null;

  const [parent] = await q<any>(
    `SELECT completed FROM onboarding WHERE id = $1::uuid`, [rows[0].onboarding_id]);
  return { onboardingId: rows[0].onboarding_id, completed: parent.completed };
}

// ─── Payroll ─────────────────────────────────────────────────────────────────

/**
 * Record a payslip. The database checks the arithmetic (net = gross − deductions)
 * and refuses a second payslip for the same person in the same month.
 */
export async function addPayslip(
  staffId: string, period: string, gross: number, deductions = 0,
) {
  const net = Number(money(gross - deductions));
  if (net < 0) throw new Error('Deductions cannot exceed gross pay.');

  const rows = await q<any>(
    `INSERT INTO payroll (staff_id, period, gross, deductions, net)
     VALUES ($1::uuid, date_trunc('month', $2::date), $3::numeric, $4::numeric, $5::numeric)
     RETURNING *`,
    [staffId, period, money(gross), money(deductions), money(net)],
  );
  return rows[0];
}

export async function markPayrollPaid(id: string) {
  const rows = await q<any>(
    `UPDATE payroll SET paid = TRUE, paid_at = now()
      WHERE id = $1::uuid AND paid = FALSE RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listPayroll(period?: string) {
  return q<any>(
    `SELECT p.*, u.full_name AS staff_name, u.role, u.department
       FROM payroll p JOIN users u ON u.id = p.staff_id
      WHERE ($1::date IS NULL OR p.period = date_trunc('month', $1::date))
      ORDER BY p.period DESC, u.full_name ASC
      LIMIT 200`,
    [period ?? null],
  );
}
