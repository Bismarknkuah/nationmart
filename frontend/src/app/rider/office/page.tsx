'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authAPI, deliveryAPI, walletAPI, isLoggedIn } from '../../../lib/api';
import PaymentsOffice from '../../../components/PaymentsOffice';
import { DashPage, DashHeader, HeaderAction, StatGrid, Stat, Panel, Empty } from '../../../components/ui/Dash';

const RIDER_RX = /rider|driver|dispatch_rider|courier/i;
const RIDER_COMMISSION_PCT = 10;

export default function RiderOffice() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<any>({ active: 0, completed: 0, earnings: 0, pending: 0 });
  const [wallet, setWallet] = useState<any>(null);
  const [duty, setDuty] = useState('offline');
  const [saving, setSaving] = useState(false);

  const load = () => {
    deliveryAPI.mine().then((r) => setSummary(r.summary || {})).catch(() => {});
    walletAPI.mine().then((r) => setWallet(r.wallet)).catch(() => {});
  };

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/rider/office'); return; }
    authAPI.me().then((r) => {
      const u = (r as any).user || r;
      setMe(u); setDuty(u.dutyStatus || 'offline');
      const ok = RIDER_RX.test(u.role || '');
      setAllowed(ok);
      if (ok) load();
    }).catch(() => router.push('/auth/login'));
  }, [router]);

  if (allowed === null) return <div className="pt-32 text-center text-slate-400">Loading…</div>;
  if (!allowed) return <div className="pt-32 text-center"><p className="text-slate-600">This office is for riders and drivers.</p><Link href="/dashboard" className="text-indigo-700 font-semibold">← Dashboard</Link></div>;

  const isDriver = /driver/i.test(me.role || '');
  const balance = wallet?.balance ?? 0;
  const owes = balance < 0;
  const gross = summary.earnings || 0;
  const commission = Math.round(gross * RIDER_COMMISSION_PCT) / 100;
  const net = gross - commission;

  const setDutyStatus = async (status: string) => {
    setSaving(true);
    try { await authAPI.updateProfile({ dutyStatus: status }); setDuty(status); }
    catch { /* */ } finally { setSaving(false); }
  };

  return (
    <DashPage>
      <DashHeader
        eyebrow={isDriver ? 'Driver office' : 'Rider office'} icon={isDriver ? '🚗' : '🛵'} accent="emerald"
        title={`Welcome, ${me.fullName?.split(' ')[0] || (isDriver ? 'Driver' : 'Rider')}`}
        subtitle="Your jobs, earnings and availability — all in one place."
        actions={<>
          <HeaderAction href="/dashboard">All my deliveries →</HeaderAction>
          <HeaderAction href="/wallet">💰 Wallet</HeaderAction>
        </>}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-5 relative z-10 space-y-5 pb-20">
        {/* Availability */}
        <Panel title="Availability">
          <p className="text-sm text-slate-500 mb-3">Set yourself available to receive jobs the AI dispatches near you.</p>
          <div className="grid grid-cols-3 gap-2">
            {[['available', '🟢 Available'], ['busy', '🟡 Busy'], ['offline', '⚫ Offline']].map(([k, l]) => (
              <button key={k} disabled={saving} onClick={() => setDutyStatus(k)}
                className={`text-sm font-semibold px-2 py-2.5 rounded-xl border transition-all ${duty === k ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                {l}
              </button>
            ))}
          </div>
        </Panel>

        {/* Job + earnings stats */}
        <StatGrid>
          <Stat label="To accept" value={summary.pending || 0} tone={summary.pending > 0 ? 'amber' : 'slate'} icon="📨" />
          <Stat label="Active jobs" value={summary.active || 0} tone="indigo" icon="📦" />
          <Stat label="Completed" value={summary.completed || 0} tone="slate" icon="✅" />
          <Stat label="Net earnings" value={`₵${net.toLocaleString()}`} tone="emerald" sub={`gross ₵${gross.toLocaleString()} − ${RIDER_COMMISSION_PCT}% commission`} icon="💵" />
        </StatGrid>

        {/* Wallet / commission */}
        <Panel title="Commission wallet" action={<Link href="/wallet" className="text-xs font-semibold text-indigo-700 hover:underline">Open wallet →</Link>}>
          {owes ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 flex items-center justify-between gap-2 flex-wrap">
              <span>You owe ₵{Math.abs(balance).toLocaleString()} in commission. Top up to keep accepting jobs.</span>
              <Link href="/wallet" className="font-semibold underline shrink-0">Top up →</Link>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Balance: <span className="font-semibold text-emerald-700">₵{balance.toLocaleString()}</span> — you're clear to accept jobs.</p>
          )}
        </Panel>

        {/* Payout methods + withdraw earnings */}
        <PaymentsOffice canWithdraw accent="#0f766e" />

        {/* Quick actions */}
        <Panel title="Quick actions">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Link href="/dashboard" className="rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 text-center">📋 My deliveries</Link>
            <Link href="/wallet" className="rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 text-center">💰 Wallet & top-up</Link>
            <Link href="/messages" className="rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 text-center">💬 Messages</Link>
          </div>
        </Panel>

        <p className="text-xs text-slate-400">Accept or reject jobs and share your live location from <Link href="/dashboard" className="underline">My deliveries</Link>. This office keeps your everyday tools in one tidy place.</p>
      </div>
    </DashPage>
  );
}
