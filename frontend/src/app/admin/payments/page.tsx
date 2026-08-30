'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI, paymentMgmtAPI, isLoggedIn } from '../../../lib/api';
import { DashPage, DashHeader, DashBody, HeaderAction, StatGrid, Stat, Panel, Empty } from '../../../components/ui/Dash';

/**
 * Payment management — the finance/exec money console.
 *
 * Every figure here is derived from the ledger and the payments table: GMV,
 * commission earned, escrow held, payouts in flight, and a live transaction
 * feed. It is read-only by design — a dashboard can show the money but must not
 * be able to move it. The one active check is ledger integrity: the wallet-drift
 * view must always be empty, and this flags it loudly if it ever isn't.
 */

const isFinance = (role: string) => /finance|account|cfo|ceo|coo|admin/i.test(role);

const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700', pending: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700', refunded: 'bg-violet-50 text-violet-700',
  unpaid: 'bg-slate-100 text-slate-500',
};

export default function PaymentManagementPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [ov, setOv] = useState<any>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [integrity, setIntegrity] = useState<{ ok: boolean; driftCount: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/admin/payments'); return; }
    authAPI.me().then((u) => {
      const user = u.user || u;
      if (!isFinance(user.role)) { router.replace('/dashboard'); return; }
      setReady(true);
    }).catch(() => router.push('/auth/login?redirect=/admin/payments'));
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    paymentMgmtAPI.overview().then(setOv).catch((e) => setErr(e.message));
    paymentMgmtAPI.integrity().then((r) => setIntegrity({ ok: r.ok, driftCount: r.driftCount })).catch(() => {});
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    paymentMgmtAPI.transactions(statusFilter || undefined, 40).then((r) => setTxns(r.transactions || [])).catch(() => {});
  }, [ready, statusFilter]);

  const money = (n: number) => `₵${Number(n || 0).toLocaleString()}`;

  if (!ready) return <DashPage><div className="min-h-[50vh] flex items-center justify-center text-slate-400">Checking access…</div></DashPage>;

  return (
    <DashPage>
      <DashHeader
        eyebrow="Finance"
        title="Payment Management"
        subtitle="Platform revenue, escrow, payouts, and every transaction — straight from the ledger."
        icon="💰"
        accent="amber"
        actions={<HeaderAction href="/office">← Office</HeaderAction>}
      />

      <DashBody>
        {err && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{err}</div>}

        {/* Ledger integrity — the one thing that must always be true */}
        {integrity && (
          <div className={`mb-4 rounded-xl border p-3 text-sm flex items-center gap-2 ${integrity.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {integrity.ok
              ? <>✅ <span className="font-semibold">Books balance.</span> Every wallet agrees with its ledger.</>
              : <>🚨 <span className="font-semibold">{integrity.driftCount} wallet(s) disagree with the ledger.</span> Investigate immediately.</>}
          </div>
        )}

        {!ov ? (
          <div className="py-8 text-center text-slate-400 text-sm">Loading money figures…</div>
        ) : (
          <>
            <StatGrid cols={4}>
              <Stat label="Paid GMV" value={money(ov.gmv)} icon="🛒" tone="indigo" />
              <Stat label="Commission earned" value={money(ov.commissionEarned)} icon="💵" tone="emerald" />
              <Stat label="Escrow held" value={money(ov.escrowHeld)} icon="🔒" tone="amber" />
              <Stat label="Refunded" value={money(ov.refunded)} icon="↩️" tone={ov.refunded > 0 ? 'rose' : 'slate'} />
            </StatGrid>

            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <Panel title="Payouts">
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="In flight" value={`${ov.payouts.inFlightCount}`} sub={money(ov.payouts.inFlightValue)} tone="amber" />
                  <MiniStat label="Paid out" value={money(ov.payouts.paidOut)} sub="landed" tone="emerald" />
                  <MiniStat label="Failed" value={`${ov.payouts.failed}`} sub="returned to wallets" tone={ov.payouts.failed > 0 ? 'rose' : 'slate'} />
                  <MiniStat label="Pending pmts" value={`${ov.counts.pending}`} sub="awaiting settle" tone="slate" />
                </div>
                {ov.inFlight?.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Money in flight</p>
                    {ov.inFlight.slice(0, 5).map((p: any) => (
                      <div key={p.reference} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                        <span className="text-slate-600 truncate">{p.full_name || p.destination}</span>
                        <span className="font-medium">{money(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="How buyers pay">
                {ov.channels.length === 0 ? <Empty>No payments yet.</Empty> : (
                  <div className="space-y-2">
                    {ov.channels.map((c: any) => {
                      const total = ov.channels.reduce((s: number, x: any) => s + x.value, 0) || 1;
                      const pct = Math.round((c.value / total) * 100);
                      return (
                        <div key={c.channel}>
                          <div className="flex justify-between text-sm">
                            <span className="capitalize text-slate-700">{c.channel === 'momo' ? 'Mobile money' : c.channel}</span>
                            <span className="text-slate-500">{money(c.value)} · {pct}%</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </div>
          </>
        )}

        {/* Transaction feed */}
        <div className="mt-4">
          <Panel
            title="Recent transactions"
            action={
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs rounded-lg border border-slate-200 px-2 py-1 bg-white">
                <option value="">All</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
              </select>
            }
          >
            {txns.length === 0 ? <Empty>No transactions match.</Empty> : (
              <div className="space-y-1.5">
                {txns.map((t) => (
                  <div key={t.reference} className="flex items-center justify-between gap-3 text-sm py-2 border-b border-slate-100 last:border-0">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">
                        {t.payerName || 'Payment'}
                        <span className="text-slate-400 font-normal"> · {t.purpose}{t.orderNumber ? ` · ${t.orderNumber}` : ''}</span>
                      </p>
                      <p className="text-xs text-slate-400 font-mono">{t.reference}{t.channel ? ` · ${t.channel}` : ''}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-slate-800">{money(t.amount)}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_STYLE[t.status] || 'bg-slate-100'}`}>{t.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </DashBody>
    </DashPage>
  );
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  const toneMap: Record<string, string> = {
    amber: 'text-amber-700', emerald: 'text-emerald-700', rose: 'text-rose-700', slate: 'text-slate-700',
  };
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-lg font-bold ${toneMap[tone] || 'text-slate-700'}`}>{value}</p>
      <p className="text-[11px] text-slate-400">{sub}</p>
    </div>
  );
}
