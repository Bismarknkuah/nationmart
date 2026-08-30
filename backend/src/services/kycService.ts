const f: any = (globalThis as any).fetch;

const CARD_RE = /^GHA-\d{9}-\d$/;

export interface KycResult { valid: boolean; verified: boolean; reason?: string }

/**
 * Verify a Ghana Card. When GHANA_CARD_VERIFY_URL + NIA_API_KEY are configured
 * it calls the NIA endpoint; otherwise it falls back to format validation only
 * (verified=false so the back office knows it wasn't checked against NIA).
 */
export async function verifyGhanaCard(cardNumber: string): Promise<KycResult> {
  const num = (cardNumber || '').trim().toUpperCase();
  if (!CARD_RE.test(num)) return { valid: false, verified: false, reason: 'Invalid format (expected GHA-XXXXXXXXX-X).' };

  const url = process.env.GHANA_CARD_VERIFY_URL;
  const key = process.env.NIA_API_KEY;
  if (!url || !key || !f) return { valid: true, verified: false, reason: 'Format OK; NIA verification not configured.' };

  try {
    const res = await f(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ pin: num }),
    });
    const data = await res.json();
    const ok = !!(data?.verified ?? data?.valid ?? data?.success);
    return { valid: ok, verified: ok, reason: ok ? undefined : 'NIA could not verify this card.' };
  } catch (e) {
    return { valid: true, verified: false, reason: `NIA unreachable (${(e as Error).message}); accepted on format.` };
  }
}

/**
 * Heuristic fraud/risk score (0 = clean, higher = riskier). Transparent signals
 * only — no opaque ML. Used to assist (not replace) human moderators.
 */
export function scoreUserRisk(u: any, signals: { recentOrders?: number; failedDeliveries?: number; reports?: number } = {}): {
  score: number; band: 'low' | 'medium' | 'high'; reasons: string[];
} {
  let score = 0; const reasons: string[] = [];
  if (!u.ghanaCardStatus || u.ghanaCardStatus !== 'verified') { score += 25; reasons.push('Ghana Card not NIA-verified'); }
  if (!u.phone) { score += 10; reasons.push('No phone on file'); }
  if (u.accountStatus === 'pending_review') { score += 15; reasons.push('Account pending review'); }
  if ((signals.reports || 0) > 0) { score += 20 * Math.min(3, signals.reports!); reasons.push(`${signals.reports} report(s) filed`); }
  if ((signals.failedDeliveries || 0) >= 3) { score += 15; reasons.push('High failed-delivery count'); }
  const ageDays = u.createdAt ? (Date.now() - new Date(u.createdAt).getTime()) / 86400000 : 999;
  if (ageDays < 2 && (signals.recentOrders || 0) > 5) { score += 20; reasons.push('New account with unusually high activity'); }
  score = Math.min(100, score);
  const band = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  return { score, band, reasons };
}
