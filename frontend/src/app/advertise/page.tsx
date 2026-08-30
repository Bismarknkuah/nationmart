'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI, adsAPI, storesAPI, productsAPI, isLoggedIn } from '../../lib/api';
import { DashPage, DashHeader, DashBody, HeaderAction, StatGrid, Stat, Panel, Empty } from '../../components/ui/Dash';

/**
 * Advertise — sellers fund and manage promo campaigns.
 *
 * A campaign is pre-paid from the wallet, so the budget shown is money already
 * committed; the platform bills it down per impression/click and the ad stops
 * when it's spent. Cancelling refunds whatever's left. The seller can never be
 * charged more than they funded — the database guarantees it.
 */

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700', paused: 'bg-amber-50 text-amber-700',
  exhausted: 'bg-slate-100 text-slate-500', cancelled: 'bg-red-50 text-red-700',
  pending_review: 'bg-blue-50 text-blue-700',
};

export default function AdvertisePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/advertise'); return; }
    authAPI.me().then((u) => {
      const role = (u.user || u).role;
      const isSeller = ['seller', 'reseller', 'wholesaler', 'manufacturer', 'service_provider', 'corporate_seller'].includes(role);
      if (!isSeller) { router.replace('/dashboard'); return; }
      setReady(true);
    }).catch(() => router.push('/auth/login?redirect=/advertise'));
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try { setAds((await adsAPI.mine()).ads || []); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (ready) load(); }, [ready, load]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };
  async function act(fn: () => Promise<any>, ok?: string) {
    setErr('');
    try { const r = await fn(); flash(ok || r?.message || 'Done.'); load(); }
    catch (e: any) { setErr(e.message); }
  }

  if (!ready) return <DashPage><div className="min-h-[50vh] flex items-center justify-center text-slate-400">Checking access…</div></DashPage>;

  const active = ads.filter((a) => a.status === 'active').length;
  const totalSpent = ads.reduce((s, a) => s + a.spent, 0);
  const totalImpr = ads.reduce((s, a) => s + a.impressions, 0);

  return (
    <DashPage>
      <DashHeader
        eyebrow="Grow your sales"
        title="Advertise"
        subtitle="Promote your products in search and browse. You only ever spend what you fund."
        icon="📣"
        accent="violet"
        actions={
          <>
            <HeaderAction href="/dashboard">← Dashboard</HeaderAction>
            <HeaderAction onClick={() => setShowCreate(true)} primary>+ New ad</HeaderAction>
          </>
        }
      />

      <DashBody>
        <StatGrid cols={3}>
          <Stat label="Active ads" value={active} icon="📣" tone={active > 0 ? 'violet' : 'slate'} />
          <Stat label="Total spent" value={`₵${totalSpent.toLocaleString()}`} icon="💸" tone="indigo" />
          <Stat label="Impressions" value={totalImpr.toLocaleString()} icon="👁️" tone="emerald" />
        </StatGrid>

        {err && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{err}</div>}
        {msg && <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">{msg}</div>}

        <div className="mt-4">
          <Panel title="Your campaigns">
            {loading ? <div className="py-8 text-center text-slate-400 text-sm">Loading…</div>
              : ads.length === 0 ? <Empty>No ads yet. Create one to start reaching more buyers.</Empty>
              : (
                <div className="space-y-2">
                  {ads.map((a) => {
                    const pct = a.budget > 0 ? Math.round((a.spent / a.budget) * 100) : 0;
                    return (
                      <div key={a.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 text-sm">
                              {a.title}
                              <span className={`ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${STATUS_STYLE[a.status]}`}>{a.status.replace('_', ' ')}</span>
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {a.placement} · {a.billKind === 'per_click' ? 'per click' : 'per view'} ·
                              {' '}{a.impressions} views · {a.clicks} clicks{a.ctr > 0 ? ` · ${a.ctr}% CTR` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {a.status === 'active' && <button onClick={() => act(() => adsAPI.pause(a.id), 'Paused.')} className="text-xs px-2.5 py-1 rounded-lg border border-amber-200 text-amber-700">Pause</button>}
                            {a.status === 'paused' && <button onClick={() => act(() => adsAPI.resume(a.id), 'Resumed.')} className="text-xs px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-700">Resume</button>}
                            {['active', 'paused'].includes(a.status) && <button onClick={() => act(() => adsAPI.cancel(a.id))} className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600">Cancel</button>}
                          </div>
                        </div>
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-slate-500 mb-1">
                            <span>₵{a.spent.toLocaleString()} spent</span>
                            <span>₵{a.remaining.toLocaleString()} left of ₵{a.budget.toLocaleString()}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full bg-violet-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </Panel>
        </div>
      </DashBody>

      {showCreate && <CreateAdModal onClose={() => setShowCreate(false)} onCreated={(m) => { setShowCreate(false); flash(m); load(); }} />}
    </DashPage>
  );
}

function CreateAdModal({ onClose, onCreated }: { onClose: () => void; onCreated: (m: string) => void }) {
  const [products, setProducts] = useState<any[]>([]);
  const [f, setF] = useState({ title: '', productId: '', budget: '', billKind: 'per_impression', placement: 'search' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    productsAPI.list({ limit: 50 }).then((r: any) => setProducts(r.products || [])).catch(() => {});
  }, []);

  async function submit() {
    setBusy(true); setErr('');
    try {
      const chosen = products.find((p) => (p.id || p._id) === f.productId);
      const r = await adsAPI.create({
        title: f.title,
        budget: Number(f.budget),
        billKind: f.billKind as any,
        placement: f.placement,
        productId: f.productId || undefined,
        storeId: chosen?.store?.id || chosen?.storeId || undefined,
        targetCategory: chosen?.category || undefined,
      });
      onCreated(r.message);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">New ad campaign</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-sm text-red-700">{err}</div>}
          <div>
            <label className="text-xs font-medium text-slate-600">Ad title</label>
            <input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Premium cement — free delivery"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Promote which product?</label>
            <select value={f.productId} onChange={(e) => set('productId', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              <option value="">Select a product…</option>
              {products.map((p) => <option key={p.id || p._id} value={p.id || p._id}>{p.title}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Budget (₵)</label>
              <input value={f.budget} onChange={(e) => set('budget', e.target.value)} inputMode="decimal" placeholder="50"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Bill by</label>
              <select value={f.billKind} onChange={(e) => set('billKind', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                <option value="per_impression">Per view (2p)</option>
                <option value="per_click">Per click (50p)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Where</label>
            <select value={f.placement} onChange={(e) => set('placement', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              <option value="search">Search results</option>
              <option value="browse">Browse / catalog</option>
              <option value="category">Category pages</option>
              <option value="home">Home page</option>
            </select>
          </div>
          <p className="text-xs text-slate-400">
            Your budget is taken from your wallet now. You only spend as buyers see or click your ad, and you can cancel any time to get the rest back.
          </p>
          <button onClick={submit} disabled={busy || !f.title || !f.productId || !f.budget}
            className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'Launching…' : 'Fund & launch'}
          </button>
        </div>
      </div>
    </div>
  );
}
