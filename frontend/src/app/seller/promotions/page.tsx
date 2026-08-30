'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authAPI, productsAPI, isLoggedIn } from '../../../lib/api';

const GOLD = '#C8A24B';
const GOLD_DK = '#9A7A2E';
const SELLER_ROLES = ['seller', 'reseller', 'manufacturer', 'wholesaler', 'service_provider', 'corporate_seller'];

type Row = {
  _id: string;
  title: string;
  pricePerUnit: number;
  currency?: string;
  unit?: string;
  status?: string;
  images?: string[];
  discountPercent: number;
  promoLabel: string;
  saving?: boolean;
  saved?: boolean;
  error?: string;
};

function money(n: number, cur = 'GHS') {
  return `${cur} ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function SellerPromotions() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/seller/promotions'); return; }
    authAPI.me().then((r) => {
      const u = (r as any).user || r;
      const ok = SELLER_ROLES.includes(u.role);
      setAllowed(ok);
      if (ok) loadProducts();
      else setLoading(false);
    }).catch(() => router.push('/auth/login?redirect=/seller/promotions'));
  }, [router]);

  const loadProducts = () => {
    setLoading(true);
    productsAPI.mine({ limit: 200 }).then((r: any) => {
      const list: Row[] = (r.products || []).map((p: any) => ({
        _id: p._id,
        title: p.title,
        pricePerUnit: p.pricePerUnit,
        currency: p.currency || 'GHS',
        unit: p.unit,
        status: p.status,
        images: p.images,
        discountPercent: p.discountPercent || 0,
        promoLabel: p.promoLabel || '',
      }));
      setRows(list);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  const setRow = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch, saved: false } : r)));

  const save = async (id: string) => {
    const row = rows.find((r) => r._id === id);
    if (!row) return;
    const pct = Math.max(0, Math.min(90, Number(row.discountPercent) || 0));
    setRow(id, { saving: true, error: '' });
    try {
      await productsAPI.update(id, { discountPercent: pct, promoLabel: row.promoLabel.trim().slice(0, 40) });
      setRow(id, { saving: false, saved: true, discountPercent: pct });
    } catch (e: any) {
      setRow(id, { saving: false, error: e.message || 'Could not save' });
    }
  };

  const clear = async (id: string) => {
    setRow(id, { discountPercent: 0, promoLabel: '' });
    setRow(id, { saving: true, error: '' });
    try {
      await productsAPI.update(id, { discountPercent: 0, promoLabel: '' });
      setRow(id, { saving: false, saved: true });
    } catch (e: any) {
      setRow(id, { saving: false, error: e.message || 'Could not clear' });
    }
  };

  const quick = (id: string, pct: number, label: string) => {
    setRow(id, { discountPercent: pct, promoLabel: label });
  };

  if (allowed === null || loading) {
    return <div className="pt-32 text-center text-slate-400">Loading your products…</div>;
  }
  if (!allowed) {
    return (
      <div className="pt-32 text-center">
        <p className="text-slate-600">Promotions are available to sellers.</p>
        <Link href="/dashboard" className="text-amber-700 font-semibold hover:underline">← Back to dashboard</Link>
      </div>
    );
  }

  const input = 'border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300';

  return (
    <div className="min-h-screen pb-16">
      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(120deg,#1b1407,#2a2010 55%,#3b2a16)' }}>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: GOLD }}>Grow your sales</p>
              <h1 className="text-3xl font-bold text-white">Promotions &amp; Discounts</h1>
              <p className="text-sm text-white/70 mt-1">Run a free promo or give a discount on any of your items. Buyers see the new price instantly.</p>
            </div>
            <Link href="/dashboard" className="text-sm font-semibold px-4 py-2 rounded-lg border" style={{ background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff' }}>← Dashboard</Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 mt-6">
        {rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="text-slate-600 mb-3">You don’t have any products yet.</p>
            <Link href="/sell" className="text-white font-semibold px-5 py-2.5 rounded-lg inline-block" style={{ background: GOLD_DK }}>+ List your first product</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const effective = r.pricePerUnit * (1 - (Number(r.discountPercent) || 0) / 100);
              const hasPromo = (Number(r.discountPercent) || 0) > 0 || r.promoLabel.trim().length > 0;
              return (
                <div key={r._id} className="bg-white rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start gap-4 flex-wrap">
                    {/* Thumb + title */}
                    <div className="flex items-center gap-3 min-w-[200px] flex-1">
                      <div className="w-14 h-14 rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center text-slate-300">
                        {r.images?.[0]
                          ? <img src={r.images[0]} alt={r.title} className="w-full h-full object-cover" />
                          : <span className="text-xs">No image</span>}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{r.title}</p>
                        <p className="text-sm text-slate-500">
                          {hasPromo ? (
                            <>
                              <span className="line-through text-slate-400 mr-1">{money(r.pricePerUnit, r.currency)}</span>
                              <span className="font-semibold text-emerald-700">{money(effective, r.currency)}</span>
                            </>
                          ) : money(r.pricePerUnit, r.currency)}
                          {r.unit ? <span className="text-slate-400"> / {r.unit}</span> : null}
                        </p>
                        {r.promoLabel && <span className="inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#FdF6E3', color: GOLD_DK, border: '1px solid #E7CB77' }}>{r.promoLabel}</span>}
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-end gap-3 flex-wrap">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Discount %</label>
                        <input type="number" min={0} max={90} value={r.discountPercent}
                          onChange={(e) => setRow(r._id, { discountPercent: Number(e.target.value) })}
                          className={input + ' w-20'} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Promo label (optional)</label>
                        <input type="text" value={r.promoLabel} placeholder="e.g. Flash sale, Free delivery"
                          onChange={(e) => setRow(r._id, { promoLabel: e.target.value })}
                          className={input + ' w-48'} maxLength={40} />
                      </div>
                      <button onClick={() => save(r._id)} disabled={r.saving}
                        className="text-white font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50" style={{ background: GOLD_DK }}>
                        {r.saving ? 'Saving…' : r.saved ? '✓ Saved' : 'Apply'}
                      </button>
                      {hasPromo && (
                        <button onClick={() => clear(r._id)} disabled={r.saving}
                          className="text-sm font-semibold px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50">
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick presets */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 pl-[72px]">
                    <span className="text-xs text-slate-400">Quick:</span>
                    {[10, 15, 20, 25, 50].map((p) => (
                      <button key={p} onClick={() => quick(r._id, p, `${p}% OFF`)}
                        className="text-xs font-semibold px-2.5 py-1 rounded-full border border-slate-200 hover:border-amber-300 hover:bg-amber-50">
                        {p}% off
                      </button>
                    ))}
                    <button onClick={() => quick(r._id, 0, 'Free delivery')}
                      className="text-xs font-semibold px-2.5 py-1 rounded-full border border-slate-200 hover:border-amber-300 hover:bg-amber-50">
                      Free promo
                    </button>
                    {r.error && <span className="text-xs text-rose-600 ml-2">{r.error}</span>}
                    {r.status && r.status !== 'active' && (
                      <span className="text-[11px] text-slate-400 ml-auto">Status: {r.status.replace(/_/g, ' ')}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-slate-400 mt-6">
          Tip: a discount sets a reduced price buyers pay right away. A promo label (with 0% discount) is a free highlight — like “Free delivery” or “Buy 1 get 1” — shown as a badge on your item.
        </p>
      </div>
    </div>
  );
}
