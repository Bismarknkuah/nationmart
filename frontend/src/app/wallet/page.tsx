'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { walletAPI, isLoggedIn } from '../../lib/api';
import { DashPage, DashHeader, HeaderAction } from '../../components/ui/Dash';

const catLabel: Record<string, string> = {
  sale_earning: 'Sale earning', delivery_earning: 'Delivery earning', commission: 'Platform commission',
  payout: 'Payout', settlement: 'Settlement', adjustment: 'Adjustment',
};

function CustomTopUp({ suggested }: { suggested: number }) {
  const [amt, setAmt] = useState('');
  const router = useRouter();
  const go = () => {
    const n = Math.ceil(Number(amt));
    if (!n || n <= 0) return;
    router.push(`/payment?purpose=wallet_topup&amount=${n}&return=/wallet`);
  };
  return (
    <div className="flex gap-2 flex-wrap">
      <div className="relative flex-1 min-w-[160px]">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₵</span>
        <input type="number" min="1" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
          placeholder={`Enter any amount (e.g. ${suggested})`}
          className="w-full border border-slate-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" />
      </div>
      <button onClick={go} disabled={!Number(amt)} className="btn-primary text-sm py-2 px-5 disabled:opacity-40">Top up via MoMo</button>
    </div>
  );
}

export default function WalletPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<any>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => walletAPI.mine().then((r) => { setWallet(r.wallet); setTxns(r.transactions || []); }).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { if (!isLoggedIn()) { router.push('/auth/login?redirect=/wallet'); return; } load(); }, [router]);

  if (loading) return <div className="pt-32 text-center text-slate-400">Loading wallet…</div>;

  const balance = wallet?.balance || 0;
  const owes = balance < 0;
  const settle = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setMsg('Enter a valid amount.'); return; }
    setBusy(true); setMsg('');
    try { await walletAPI.settle({ amount: amt, note: 'Commission settled by user' }); setAmount(''); setMsg('Recorded. Thank you.'); load(); }
    catch (e: any) { setMsg(e.message || 'Could not record.'); } finally { setBusy(false); }
  };

  return (
    <DashPage>
      <DashHeader
        eyebrow="My account" icon="💰" accent={owes ? 'rose' : 'emerald'}
        title="My wallet"
        subtitle="Your earnings and platform commission, tracked transparently."
        actions={<HeaderAction href="/dashboard">← Dashboard</HeaderAction>}
      />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 -mt-5 relative z-10 pb-20">
        <div className={`rounded-2xl p-6 mb-5 text-white shadow-lg ${owes ? 'bg-gradient-to-br from-rose-600 to-rose-700' : 'bg-gradient-to-br from-emerald-600 to-green-700'}`}>
        <p className="text-sm text-white/80">{owes ? 'You owe the platform' : 'Available balance'}</p>
        <p className="text-4xl font-bold mt-1">₵{Math.abs(balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        <div className="flex gap-6 mt-4 text-sm text-white/90">
          <span>Earned: ₵{(wallet?.totalEarned || 0).toLocaleString()}</span>
          <span>Commission: ₵{(wallet?.totalCommission || 0).toLocaleString()}</span>
        </div>
      </div>

      {owes && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5">
          <h3 className="font-bold text-slate-900 mb-1">Top up your wallet</h3>
          <p className="text-sm text-slate-500 mb-3">Riders & drivers must keep a non-negative balance to accept new jobs. Top up via mobile money — enter any amount or use a quick option.</p>
          <CustomTopUp suggested={Math.ceil(Math.abs(balance))} />
          <div className="flex gap-2 flex-wrap mt-3">
            {[Math.abs(balance), Math.abs(balance) + 20, 50, 100].filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 4).map((v) => (
              <Link key={v} href={`/payment?purpose=wallet_topup&amount=${Math.ceil(v)}&return=/wallet`}
                className="text-sm font-semibold px-4 py-2 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                Top up ₵{Math.ceil(v).toLocaleString()}
              </Link>
            ))}
          </div>
        </div>
      )}

      {!owes && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5">
          <h3 className="font-bold text-slate-900 mb-1">Add funds</h3>
          <p className="text-sm text-slate-500 mb-3">Top up with any amount, or keep a buffer so commission on completed jobs is settled automatically.</p>
          <CustomTopUp suggested={50} />
          <div className="flex gap-2 flex-wrap mt-3">
            {[20, 50, 100, 200].map((v) => (
              <Link key={v} href={`/payment?purpose=wallet_topup&amount=${v}&return=/wallet`}
                className="text-sm font-semibold px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
                +₵{v}
              </Link>
            ))}
          </div>
        </div>
      )}

      {owes && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5">
          <h3 className="font-bold text-slate-900 mb-1">Settle commission</h3>
          <p className="text-sm text-slate-500 mb-3">Record a payment of the commission you owe the platform.</p>
          <div className="flex gap-2 flex-wrap">
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Amount (up to ₵${Math.abs(balance).toLocaleString()})`}
              className="flex-1 min-w-[180px] border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <button onClick={settle} disabled={busy} className="btn-primary text-sm py-2 px-5 disabled:opacity-50">{busy ? 'Recording…' : 'Mark as paid'}</button>
          </div>
          {msg && <p className="text-sm text-indigo-700 mt-2">{msg}</p>}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-900 mb-3">Transactions</h3>
        {txns.length === 0 ? <p className="text-sm text-slate-400">No transactions yet.</p> : (
          <div className="divide-y divide-slate-100">
            {txns.map((t) => (
              <div key={t._id} className="py-2.5 flex items-center justify-between text-sm">
                <div>
                  <p className="text-slate-700">{catLabel[t.category] || t.category}</p>
                  <p className="text-[11px] text-slate-400">{t.description} · {new Date(t.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`font-semibold ${t.type === 'credit' ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {t.type === 'credit' ? '+' : '−'}₵{t.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400 mt-4">A negative balance means commission owed to the platform; a positive balance is earnings due to you.</p>
      </div>
    </DashPage>
  );
}
