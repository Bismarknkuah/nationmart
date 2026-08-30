'use client';
import { useState } from 'react';
import Link from 'next/link';

const ACTIVE_PROMOS = [
  { id: 'P001', code: 'FIRSTBUY', title: 'First-Time Buyer Discount', discount: '15% OFF', type: 'percentage', value: 15, category: 'All Products', validUntil: '2026-06-30', adminBy: 'Super Admin', region: 'All Regions', usageLeft: 500, usageTotal: 500, description: 'Get 15% off your first purchase on NationMart. Valid for all product categories.', badge: '🎁' },
  { id: 'P002', code: 'ASHANTI20', title: 'Ashanti Region Special', discount: '20% OFF', type: 'percentage', value: 20, category: 'Timber', validUntil: '2026-05-31', adminBy: 'Ashanti Regional Admin', region: 'Ashanti', usageLeft: 120, usageTotal: 200, description: 'Exclusive 20% discount on all Ashanti timber products this month.', badge: '🌟' },
  { id: 'P003', code: 'MOMO5', title: 'MoMo Payment Cashback', discount: 'GHS 5 OFF', type: 'fixed', value: 5, category: 'All', validUntil: '2026-12-31', adminBy: 'International Admin', region: 'All', usageLeft: 999, usageTotal: 1000, description: 'Get GHS 5 off any order when you pay with MTN MoMo or Telecel Cash.', badge: '📱' },
  { id: 'P004', code: 'EXPORT10', title: 'Export Orders Discount', discount: '10% OFF', type: 'percentage', value: 10, category: 'Export Orders', validUntil: '2026-06-15', adminBy: 'International Admin', region: 'International', usageLeft: 45, usageTotal: 100, description: '10% discount on all orders destined for export (USA, Europe, Asia).', badge: '🚢' },
  { id: 'P005', code: 'BAMBOO25', title: 'Bamboo Flash Sale', discount: '25% OFF', type: 'percentage', value: 25, category: 'Bamboo', validUntil: '2026-05-20', adminBy: 'Volta Regional Admin', region: 'Volta', usageLeft: 30, usageTotal: 50, description: 'Flash sale on all Volta Region bamboo products. Limited slots available!', badge: '🎋' },
];

const TYPE_COLORS: Record<string, string> = {
  percentage: 'bg-green-100 text-green-800',
  fixed:      'bg-blue-100 text-blue-800',
};

export default function PromotionsPage() {
  const [copied, setCopied] = useState('');
  const [filterRegion, setFilterRegion] = useState('All');
  const [filterCategory, setFilterCategory] = useState('All');
  const [applyCode, setApplyCode] = useState('');
  const [applied, setApplied] = useState<typeof ACTIVE_PROMOS[0] | null>(null);
  const [applyError, setApplyError] = useState('');

  const copy = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(code);
    setTimeout(() => setCopied(''), 2000);
  };

  const applyPromo = () => {
    const found = ACTIVE_PROMOS.find(p => p.code === applyCode.toUpperCase().trim());
    if (!found) { setApplyError('Invalid promo code. Please check and try again.'); setApplied(null); return; }
    if (found.usageLeft === 0) { setApplyError('This promo code has been fully redeemed.'); setApplied(null); return; }
    setApplied(found);
    setApplyError('');
  };

  const regions = ['All', 'All Regions', 'Ashanti', 'Greater Accra', 'Volta', 'International'];
  const categories = ['All', 'Timber', 'Bamboo', 'Plywood', 'Export Orders'];

  const filtered = ACTIVE_PROMOS.filter(p => {
    const matchRegion = filterRegion === 'All' || p.region === filterRegion || p.region === 'All Regions' || p.region === 'All';
    const matchCat = filterCategory === 'All' || p.category === filterCategory || p.category === 'All';
    return matchRegion && matchCat;
  });

  const urgentPromos = ACTIVE_PROMOS.filter(p => {
    const days = Math.ceil((new Date(p.validUntil).getTime() - Date.now()) / 86400000);
    return days <= 10;
  });

  return (
    <div className="pt-16 min-h-screen bg-stone-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#3d2210] to-[#6b4f3a] text-white py-12 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="text-5xl mb-3">🏷️</div>
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'Georgia, serif' }}>
            Promotions & Discounts
          </h1>
          <p className="text-amber-200">Exclusive deals from NationMart admins across all 16 regions</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Promo code checker */}
        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-stone-900 mb-3">🎟️ Have a Promo Code?</h3>
          <div className="flex gap-3">
            <input type="text" value={applyCode} onChange={e => setApplyCode(e.target.value.toUpperCase())}
              placeholder="Enter code e.g. FIRSTBUY"
              className="flex-1 border border-stone-300 rounded-xl px-4 py-3 text-sm font-mono font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-300 uppercase" />
            <button onClick={applyPromo} className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-6 py-3 rounded-xl text-sm transition-all shadow-md">
              Apply
            </button>
          </div>
          {applyError && <p className="text-xs text-red-600 mt-2 flex items-center gap-1"><span>⚠️</span> {applyError}</p>}
          {applied && (
            <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
              <span className="text-3xl">{applied.badge}</span>
              <div>
                <p className="font-bold text-green-800">✅ Code applied: {applied.code}</p>
                <p className="text-sm text-green-700">{applied.title} — <strong>{applied.discount}</strong></p>
                <p className="text-xs text-green-600 mt-0.5">Valid until {applied.validUntil} • {applied.usageLeft} uses left</p>
              </div>
              <Link href="/catalog" className="ml-auto bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-xl text-sm">
                Shop Now →
              </Link>
            </div>
          )}
        </div>

        {/* Urgent/expiring promos */}
        {urgentPromos.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <h3 className="font-bold text-red-800 mb-3 flex items-center gap-2">⏰ Expiring Soon!</h3>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {urgentPromos.map(p => {
                const days = Math.ceil((new Date(p.validUntil).getTime() - Date.now()) / 86400000);
                return (
                  <div key={p.id} className="bg-white border border-red-200 rounded-xl p-3 shrink-0 min-w-[200px]">
                    <div className="text-2xl mb-1">{p.badge}</div>
                    <p className="font-bold text-stone-900 text-sm">{p.title}</p>
                    <p className="text-red-700 font-bold text-lg">{p.discount}</p>
                    <p className="text-xs text-red-600 font-semibold">⏰ Expires in {days} day{days !== 1 ? 's' : ''}!</p>
                    <button onClick={() => copy(p.code)} className="mt-2 w-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-1.5 rounded-lg">
                      {copied === p.code ? '✓ Copied!' : `Copy ${p.code}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex gap-1 bg-white border border-stone-200 rounded-xl p-1">
            {regions.map(r => (
              <button key={r} onClick={() => setFilterRegion(r)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${filterRegion === r ? 'bg-amber-500 text-white' : 'text-stone-600 hover:bg-stone-100'}`}>
                {r}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-white border border-stone-200 rounded-xl p-1">
            {categories.map(c => (
              <button key={c} onClick={() => setFilterCategory(c)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${filterCategory === c ? 'bg-amber-500 text-white' : 'text-stone-600 hover:bg-stone-100'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Promo grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map(p => {
            const days = Math.ceil((new Date(p.validUntil).getTime() - Date.now()) / 86400000);
            const pctUsed = ((p.usageTotal - p.usageLeft) / p.usageTotal) * 100;
            return (
              <div key={p.id} className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm hover:border-amber-300 hover:shadow-md transition-all">
                {/* Top stripe */}
                <div className="bg-gradient-to-r from-amber-600 to-amber-800 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{p.badge}</span>
                    <div>
                      <p className="font-bold text-white text-sm">{p.title}</p>
                      <p className="text-amber-200 text-xs">{p.adminBy}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-white">{p.discount}</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${TYPE_COLORS[p.type]}`}>
                      {p.type === 'percentage' ? '% Discount' : 'Fixed Savings'}
                    </span>
                  </div>
                </div>

                {/* Body */}
                <div className="p-4 space-y-3">
                  <p className="text-sm text-stone-600">{p.description}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-stone-400">Category:</span> <strong>{p.category}</strong></div>
                    <div><span className="text-stone-400">Region:</span> <strong>{p.region}</strong></div>
                    <div><span className="text-stone-400">Valid until:</span> <strong className={days <= 7 ? 'text-red-600' : ''}>{p.validUntil}</strong></div>
                    <div><span className="text-stone-400">Uses left:</span> <strong>{p.usageLeft} / {p.usageTotal}</strong></div>
                  </div>

                  {/* Usage bar */}
                  <div>
                    <div className="flex justify-between text-xs text-stone-400 mb-1">
                      <span>Claimed</span>
                      <span>{Math.round(pctUsed)}%</span>
                    </div>
                    <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pctUsed > 80 ? 'bg-red-400' : 'bg-amber-400'}`} style={{ width: `${pctUsed}%` }} />
                    </div>
                  </div>

                  {/* Code + CTA */}
                  <div className="flex gap-2">
                    <div className="flex-1 bg-stone-100 border border-stone-200 rounded-xl px-3 py-2 font-mono font-bold text-amber-700 text-sm tracking-widest text-center">
                      {p.code}
                    </div>
                    <button onClick={() => copy(p.code)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${copied === p.code ? 'bg-green-500 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}>
                      {copied === p.code ? '✓ Copied!' : 'Copy'}
                    </button>
                    <Link href="/catalog" className="bg-stone-800 hover:bg-stone-700 text-white px-3 py-2 rounded-xl text-sm font-bold transition-all">
                      Shop
                    </Link>
                  </div>

                  {days <= 10 && (
                    <p className="text-xs text-red-600 font-semibold flex items-center gap-1">
                      <span>⏰</span> Expires in {days} day{days !== 1 ? 's' : ''}!
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-stone-400">
            <p className="text-4xl mb-3">🏷️</p>
            <p className="font-semibold">No promotions for this filter</p>
            <button onClick={() => { setFilterRegion('All'); setFilterCategory('All'); }} className="text-amber-700 underline text-sm mt-2">Clear filters</button>
          </div>
        )}

        {/* Admin info */}
        <div className="bg-indigo-800 text-white rounded-2xl p-6 text-center">
          <h3 className="font-bold text-xl mb-2" style={{ fontFamily: 'Georgia, serif' }}>Are You a NationMart Admin?</h3>
          <p className="text-stone-300 text-sm mb-4">Regional admins and the Super Admin can create promotions, set discounts, and issue promo codes for their regions.</p>
          <Link href="/admin" className="bg-amber-500 hover:bg-amber-400 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all">
            Go to Admin Panel →
          </Link>
        </div>
      </div>
    </div>
  );
}
