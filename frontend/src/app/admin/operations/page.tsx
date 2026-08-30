'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authAPI, managementAPI, walletAPI, isLoggedIn } from '../../../lib/api';
import { DashPage, DashHeader, HeaderAction, DashBody, TabBar } from '../../../components/ui/Dash';

const ALLOWED = /admin|ceo|coo|cto|cio|cfo|chro|finance|hr|logistics|security|compliance|fleet|dispatch|director|officer/i;
const money = (n: number) => `GHS ${Math.round(n || 0).toLocaleString()}`;

export default function OperationsCenter() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'finance' | 'hr' | 'logistics' | 'security'>('finance');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/admin/operations'); return; }
    authAPI.me().then((r) => {
      const u = (r as any).user || r;
      const ok = ALLOWED.test(u.role || '');
      setAllowed(ok);
      if (ok) managementAPI.officeStats().then(setData).catch(() => {});
    }).catch(() => router.push('/auth/login?redirect=/admin/operations'));
  }, [router]);

  if (allowed === null) return <div className="pt-32 text-center text-slate-400">Loading…</div>;
  if (!allowed) return <div className="pt-32 text-center"><p className="text-slate-600">Officer access only.</p><Link href="/dashboard" className="text-indigo-700 font-semibold hover:underline">← Dashboard</Link></div>;

  return (
    <DashPage>
      <DashHeader
        eyebrow="Operations" icon="🗂️" accent="indigo"
        title="Operations Center"
        subtitle="Finance, HR, logistics and security — one command view."
        actions={<HeaderAction href="/dashboard">← Dashboard</HeaderAction>}
      />
      <DashBody>
        <TabBar
          tabs={[{ key: 'finance', label: '💰 Finance' }, { key: 'hr', label: '👥 HR' }, { key: 'logistics', label: '🛵 Logistics' }, { key: 'security', label: '🛡️ Security' }]}
          active={tab} onChange={(k) => setTab(k as any)}
        />
        {!data ? <p className="text-slate-400 text-sm">Loading office data…</p> : (
          <>
            {tab === 'finance' && <Finance d={data.finance} />}
            {tab === 'hr' && <HR d={data.hr} />}
            {tab === 'logistics' && <Logistics d={data.logistics} />}
            {tab === 'security' && <Security d={data.security} />}
          </>
        )}
      </DashBody>
    </DashPage>
  );
}

function Card({ label, value, tone = 'text-slate-800', sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Finance({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Total revenue (paid)" value={money(d.revenue)} tone="text-emerald-700" sub={`${d.paidOrders} paid orders`} />
        <Card label="Escrow held" value={money(d.escrowHeld)} tone="text-amber-700" sub="Awaiting delivery" />
        <Card label="Released / paid out" value={money(d.released)} tone="text-indigo-700" sub="On delivered orders" />
        <Card label="Payouts due" value={money(d.escrowHeld)} tone="text-slate-800" sub="= escrow to release" />
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-900 text-sm mb-3">Recent transactions</h3>
        {(!d.recentTx || d.recentTx.length === 0) ? <p className="text-sm text-slate-400">No paid transactions yet.</p> : (
          <div className="divide-y divide-slate-100">
            {d.recentTx.map((t: any) => (
              <div key={t._id} className="py-2 flex items-center justify-between text-sm">
                <div><span className="font-mono text-slate-700">{t.orderNumber}</span> <span className="text-slate-400 capitalize">· {t.status?.replace(/_/g, ' ')}</span></div>
                <div className="text-right"><span className="font-semibold text-slate-800">{t.currency || 'GHS'} {(t.totalAmount || 0).toLocaleString()}</span><p className="text-[10px] text-slate-400">{new Date(t.createdAt).toLocaleDateString()}</p></div>
              </div>
            ))}
          </div>
        )}
      </div>
      <WalletOverview />
    </div>
  );
}

function WalletOverview() {
  const [data, setData] = useState<{ owing: any[]; owed: any[] } | null>(null);
  const [busy, setBusy] = useState('');
  const load = () => walletAPI.overview().then(setData).catch(() => setData({ owing: [], owed: [] }));
  useEffect(() => { load(); }, []);
  const payout = async (w: any) => {
    if (!confirm(`Record a payout of ₵${w.balance.toLocaleString()} to ${w.user?.fullName}?`)) return;
    setBusy(w._id);
    try { await walletAPI.settle({ userId: w.user._id, amount: w.balance, note: 'Earnings payout' }); load(); }
    catch { /* */ } finally { setBusy(''); }
  };
  const clearOwed = async (w: any) => {
    if (!confirm(`Mark ₵${Math.abs(w.balance).toLocaleString()} commission as settled for ${w.user?.fullName}?`)) return;
    setBusy(w._id);
    try { await walletAPI.settle({ userId: w.user._id, amount: Math.abs(w.balance), note: 'Commission settled (finance)' }); load(); }
    catch { /* */ } finally { setBusy(''); }
  };
  if (!data) return <p className="text-sm text-slate-400">Loading wallets…</p>;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-900 text-sm mb-1">Owed to users (payouts due)</h3>
        <p className="text-xs text-slate-400 mb-3">Sellers/riders the platform owes earnings.</p>
        {(!Array.isArray(data.owed) || data.owed.length === 0) ? <p className="text-sm text-slate-400">Nobody is owed right now.</p> : (
          <div className="space-y-2">
            {data.owed.map((w) => (
              <div key={w._id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{w.user?.fullName} <span className="text-slate-400 capitalize text-xs">· {w.user?.role?.replace(/_/g, ' ')}</span></span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-emerald-700">₵{w.balance.toLocaleString()}</span>
                  <button onClick={() => payout(w)} disabled={busy === w._id} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-600 text-white disabled:opacity-50">Pay out</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-900 text-sm mb-1">Owing the platform (commission)</h3>
        <p className="text-xs text-slate-400 mb-3">Riders/sellers who owe commission.</p>
        {(!Array.isArray(data.owing) || data.owing.length === 0) ? <p className="text-sm text-slate-400">No outstanding commission.</p> : (
          <div className="space-y-2">
            {data.owing.map((w) => (
              <div key={w._id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{w.user?.fullName} <span className="text-slate-400 capitalize text-xs">· {w.user?.role?.replace(/_/g, ' ')}</span></span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-rose-600">₵{Math.abs(w.balance).toLocaleString()}</span>
                  <button onClick={() => clearOwed(w)} disabled={busy === w._id} className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 disabled:opacity-50">Mark settled</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HR({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card label="Total staff" value={String(d.staffTotal || 0)} tone="text-indigo-700" />
        <Card label="Departments" value={String(d.staffByDept?.length || 0)} />
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-900 text-sm mb-3">Staff by department</h3>
        {(!d.staffByDept || d.staffByDept.length === 0) ? <p className="text-sm text-slate-400">No departments recorded yet. Staff you create from the Control Center will appear here.</p> : (
          <div className="space-y-2">
            {d.staffByDept.map((s: any) => (
              <div key={s.department} className="flex items-center justify-between text-sm">
                <span className="text-slate-700 capitalize">{String(s.department).replace(/_/g, ' ')}</span>
                <span className="font-semibold text-slate-800">{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400">Onboarding & leave tracking can be layered on next — this view reflects the live staff roster.</p>
      <Link href="/hr/workflows" className="inline-block text-sm font-semibold px-4 py-2 rounded-lg bg-indigo-600 text-white">Open Leave &amp; Onboarding →</Link>
    </div>
  );
}

function Logistics({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Available riders" value={String(d.available)} tone="text-emerald-700" />
        <Card label="Busy" value={String(d.busy)} tone="text-amber-700" />
        <Card label="Offline" value={String(d.offline)} tone="text-slate-500" />
        <Card label="Active deliveries" value={String(d.activeDeliveries)} tone="text-indigo-700" sub={`${d.deliveredTotal} delivered all-time`} />
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-900 text-sm">Top riders</h3>
          <Link href="/logistics/riders" className="text-xs font-semibold text-indigo-700 hover:underline">Full roster →</Link>
        </div>
        {(!d.topRiders || d.topRiders.length === 0) ? <p className="text-sm text-slate-400">No completed deliveries yet.</p> : (
          <div className="space-y-2">
            {d.topRiders.map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{i + 1}. {r.name}</span>
                <span className="text-slate-400">{r.jobs} jobs · {money(r.earnings)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Security({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Failed logins (24h)" value={String(d.loginFails || 0)} tone="text-rose-700" sub="Login anomalies" />
        <Card label="Suspended accounts" value={String(d.suspended)} tone="text-rose-700" />
        <Card label="Flagged accounts" value={String(d.flagged)} tone="text-amber-700" />
        <Card label="Reports (24h)" value={String(d.recentReports)} tone="text-indigo-700" sub={`${d.reportsTotal} total`} />
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-900 text-sm">Recent sensitive / threat events</h3>
          <Link href="/admin/security" className="text-xs font-semibold text-indigo-700 hover:underline">Full activity log →</Link>
        </div>
        {(!d.recentSensitive || d.recentSensitive.length === 0) ? <p className="text-sm text-slate-400">No flagged events. Deletions, suspensions and failed logins will surface here.</p> : (
          <div className="space-y-2">
            {d.recentSensitive.map((l: any) => (
              <div key={l._id} className="flex items-start gap-2 text-sm">
                <span className="mt-1 w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                <div>
                  <p className="text-slate-700">{l.summary || l.action}</p>
                  <p className="text-[10px] text-slate-400"><span className="font-mono">{l.action}</span>{l.actor?.fullName ? ` · ${l.actor.fullName}` : ''} · {new Date(l.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
