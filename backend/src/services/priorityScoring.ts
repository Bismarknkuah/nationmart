/**
 * Workflow priority scoring.
 *
 * This is NOT a machine-learning model and NOT an LLM call. It is a
 * deterministic, fully auditable scoring function built from signals the
 * platform already collects.
 *
 * Score range: 0 – 100. Items with higher scores rank higher in the inbox.
 * Each component is exposed in the breakdown so officers can see *why* a
 * task ranks where it does and challenge the ranking if needed.
 *
 * Components
 * ──────────
 *   sla          0..40    fraction of time elapsed vs allowed; overdue → 40
 *   reports      0..25    count of prior reports against the entity, capped
 *   escalation   0..15    +15 if the workflow has been escalated at any step
 *   value        0..10    log scale of any monetary value tied to the entity
 *   age          0..10    capped linear scale of time since creation
 *
 * Risk tier
 * ─────────
 *   critical:  >= 75 OR (overdue AND any reports against entity)
 *   high:      >= 55
 *   medium:    >= 30
 *   low:       <  30
 */

export interface PriorityBreakdown {
  sla: number;
  reports: number;
  escalation: number;
  value: number;
  age: number;
}

export interface PrioritizedInstance {
  score: number;                                  // 0–100
  tier: 'critical' | 'high' | 'medium' | 'low';
  breakdown: PriorityBreakdown;
  reasons: string[];                              // human-readable explanations
}

export interface PriorityInputs {
  createdAt: Date | string;
  currentDueAt?: Date | string | null;
  escalated?: boolean;
  reportCountAgainstEntity?: number;
  entityMonetaryValue?: number;                   // GHS
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function priorityScore(input: PriorityInputs): PrioritizedInstance {
  const now = Date.now();
  const created = new Date(input.createdAt).getTime();

  const reasons: string[] = [];
  const breakdown: PriorityBreakdown = { sla: 0, reports: 0, escalation: 0, value: 0, age: 0 };

  // ── SLA (0-40) ─────────────────────────────────────────────────────────
  if (input.currentDueAt) {
    const due = new Date(input.currentDueAt).getTime();
    const totalWindowMs = Math.max(due - created, 1);
    const elapsedMs = now - created;
    const fraction = elapsedMs / totalWindowMs;     // <1 = on time, >=1 = overdue

    if (fraction >= 1) {
      breakdown.sla = 40;
      const hoursOverdue = Math.round((now - due) / 3600_000);
      reasons.push(`Overdue by ${hoursOverdue}h (+40)`);
    } else if (fraction >= 0.75) {
      breakdown.sla = 30;
      reasons.push('SLA window 75%+ elapsed (+30)');
    } else if (fraction >= 0.5) {
      breakdown.sla = 20;
      reasons.push('SLA window half elapsed (+20)');
    } else if (fraction >= 0.25) {
      breakdown.sla = 10;
    }
  }

  // ── Prior reports (0-25) ───────────────────────────────────────────────
  const reports = input.reportCountAgainstEntity ?? 0;
  if (reports > 0) {
    breakdown.reports = clamp(reports * 5, 0, 25);
    reasons.push(`${reports} prior report${reports === 1 ? '' : 's'} against entity (+${breakdown.reports})`);
  }

  // ── Escalation (0-15) ──────────────────────────────────────────────────
  if (input.escalated) {
    breakdown.escalation = 15;
    reasons.push('Escalated to higher level (+15)');
  }

  // ── Monetary value (0-10) ──────────────────────────────────────────────
  const value = input.entityMonetaryValue ?? 0;
  if (value > 0) {
    // log10 scale: GHS 100 → 2, GHS 10k → 4, GHS 1M → 6. Cap contribution at 10.
    breakdown.value = clamp(Math.round(Math.log10(value + 1) * 1.7), 0, 10);
    if (breakdown.value > 0) reasons.push(`High value entity (GHS ${value.toLocaleString()}) (+${breakdown.value})`);
  }

  // ── Age (0-10) ─────────────────────────────────────────────────────────
  const ageDays = (now - created) / 86_400_000;
  breakdown.age = clamp(Math.round(ageDays * 1.5), 0, 10);
  if (breakdown.age >= 5) reasons.push(`Open ${Math.round(ageDays)} days (+${breakdown.age})`);

  const score = breakdown.sla + breakdown.reports + breakdown.escalation + breakdown.value + breakdown.age;

  let tier: PrioritizedInstance['tier'] = 'low';
  const isOverdueWithReports = breakdown.sla === 40 && reports > 0;
  if (score >= 75 || isOverdueWithReports) tier = 'critical';
  else if (score >= 55) tier = 'high';
  else if (score >= 30) tier = 'medium';

  return { score, tier, breakdown, reasons };
}
