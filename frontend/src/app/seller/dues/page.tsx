'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authAPI, paymentsAPI, isLoggedIn } from '../../../lib/api';

const FEE_GHS = 50;

export default function SellerDuesPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/seller/dues'); return; }
    (async () => {
      try {
        const u = await authAPI.me();
        setMe(u.user || u);
        const h = await paymentsAPI.mine().catch(() => ({ payments: [] }));
        setHistory(h.payments || []);
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="pt-32 text-center text-stone-400">Loading…</div>;
  if (!me) return null;

  const sub = me.subscription || {};
  const trialEnds = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const daysLeft = (d: Date | null) => d ? Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000)) : 0;

  const banner = (() => {
    switch (sub.status) {
      case 'trial':
        return { tone: 'bg-amber-50 border-amber-200 text-amber-900', icon: '🎁', title: 'Free trial active', body: `${daysLeft(trialEnds)} days remaining of your 2-month trial.` };
      case 'active':
        return { tone: 'bg-green-50 border-green-200 text-green-800', icon: '✅', title: 'Subscription active', body: periodEnd ? `Renews on ${periodEnd.toLocaleDateString()}.` : 'Your listings are live.' };
      case 'past_due':
        return { tone: 'bg-red-50 border-red-200 text-red-700', icon: '⏰', title: 'Payment past due', body: 'Pay your monthly fee to keep posting new listings.' };
      case 'exempt':
        return { tone: 'bg-blue-50 border-blue-200 text-blue-700', icon: 'ℹ️', title: 'Subscription not required', body: 'Buyers and platform admins do not pay subscription dues.' };
      default:
        return { tone: 'bg-stone-100 text-stone-700', icon: '❔', title: 'No subscription', body: 'Sign up as a seller to enable a 2-month free trial.' };
    }
  })();

  const canPay = sub.status === 'trial' || sub.status === 'active' || sub.status === 'past_due';

  return (
    <div className="min-h-screen bg-stone-50 pt-24 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-stone-900 mb-1" style={{ fontFamily: 'Georgia, serif' }}>Seller Subscription</h1>
        <p className="text-stone-500 text-sm mb-6">2 months free, then GHS {FEE_GHS}/month paid by Mobile Money. Cancel anytime.</p>

        {/* Status */}
        <div className={`rounded-2xl border p-5 mb-5 ${banner.tone}`}>
          <div className="text-3xl mb-1">{banner.icon}</div>
          <h2 className="font-bold">{banner.title}</h2>
          <p className="text-sm opacity-80 mt-0.5">{banner.body}</p>
        </div>

        {/* Pay card */}
        {canPay && (
          <div className="bg-white rounded-2xl border border-stone-200 p-6 mb-5">
            <h3 className="font-bold text-stone-900 mb-3">Pay your next month</h3>
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-xs text-stone-400">Monthly fee</p>
                <p className="text-4xl font-bold text-stone-900">₵{FEE_GHS}</p>
              </div>
              <p className="text-xs text-stone-400">MTN · Telecel · AirtelTigo</p>
            </div>
            <Link href={`/payment?purpose=subscription&amount=${FEE_GHS}&return=/seller/dues`}
              className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm text-center">
              📱 Pay with Mobile Money →
            </Link>
            <p className="text-xs text-stone-400 text-center mt-3">🔒 Secured by Paystack — runs in simulation mode in dev.</p>
          </div>
        )}

        {/* Payment history */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <h3 className="font-bold text-stone-900 mb-3">Payment history</h3>
          {history.length === 0 ? (
            <p className="text-sm text-stone-400 py-3 text-center">No payments yet.</p>
          ) : (
            <div className="divide-y divide-stone-100">
              {history.map((p: any) => (
                <div key={p._id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-mono text-xs text-stone-500">{p.reference}</p>
                    <p className="text-xs text-stone-400">{new Date(p.createdAt).toLocaleDateString()} · {p.purpose}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-stone-900">₵{p.amount?.toLocaleString()}</p>
                    <p className={`text-xs ${p.state === 'success' ? 'text-green-600' : p.state === 'failed' ? 'text-red-600' : 'text-amber-600'}`}>{p.state}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
