'use client';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { storesAPI } from '../../lib/api';
import { STORE_CATEGORIES, STORE_CATEGORY_MAP } from '../../lib/storeCategories';
import { CategoryIcon } from '../../components/ui/CategoryIcon';

function StoresInner() {
  const params = useSearchParams();
  const initialType = params.get('type') || '';

  const [stores, setStores] = useState<any[]>([]);
  const [type, setType] = useState(initialType);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      // Local market only — the international market is its own page.
      storesAPI.browse({ type: type || undefined, market: 'local', search: search.trim() || undefined })
        .then(r => setStores(r.stores || []))
        .catch(() => setStores([]))
        .finally(() => setLoading(false));
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [type, search]);

  return (
    <div className="min-h-screen bg-slate-50 pt-8 pb-16 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Marketplace</p>
            <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>Stores</h1>
            <p className="text-slate-500 text-sm mt-1">Browse verified NationMart digital stores.</p>
          </div>
          <Link href="/stores/manage" className="btn-primary text-sm py-2 px-4">+ Open my store</Link>
        </div>

        {/* Search by store code, number, name, or area */}
        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by store code (e.g. GH-GA-ACM-PHA-WP), store number, name, region or district…"
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          />
        </div>

        {/* Category chips */}
        <div className="flex items-start gap-2 flex-wrap mb-6">
          <button
            onClick={() => setType('')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${type === '' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
          >
            All
          </button>
          {STORE_CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => setType(c.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${type === c.value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
            Showing: Local market (Ghana)
          </p>
          <Link href="/international" className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-9v18m9-9H3" /></svg>
            Switch to International Market
          </Link>
        </div>

        {loading ? (
          <p className="text-slate-400 text-center py-20">Loading stores…</p>
        ) : stores.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
            <p className="text-slate-500 font-medium">No stores match these filters yet.</p>
            <p className="text-slate-400 text-sm mt-2">Try clearing the category filter or be the first to open one.</p>
            <Link href="/stores/manage" className="inline-block mt-6 btn-primary text-sm py-2 px-4">+ Open the first store</Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {stores.map(s => {
              const cat = STORE_CATEGORY_MAP[s.type] || STORE_CATEGORY_MAP.general;
              return (
                <Link key={s._id} href={`/store/${s.slug}`} className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md hover:border-indigo-200 transition-all group">
                  {s.theme?.bannerUrl ? (
                    <div className="h-28 relative overflow-hidden">
                      <img src={s.theme.bannerUrl} alt={s.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                        <h3 className="font-bold text-white text-lg leading-tight">{s.name}</h3>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="h-24 relative flex items-end p-4"
                      style={{ background: `linear-gradient(135deg, ${s.theme?.primaryColor || '#312e81'} 0%, ${s.theme?.accentColor || '#818cf8'} 100%)` }}
                    >
                      <h3 className="font-bold text-white text-lg leading-tight" style={{ fontFamily: s.theme?.font || 'Georgia, serif' }}>
                        {s.name}
                      </h3>
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className={`inline-flex items-center gap-1.5 ${cat.swatch.bg} ${cat.swatch.text} text-xs font-semibold px-2 py-1 rounded-full`}>
                        <CategoryIcon path={cat.iconPath} className="w-3.5 h-3.5" />
                        {cat.label}
                      </div>
                      {s.isInternational && <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">International</span>}
                    </div>
                    <p className="text-sm text-slate-500 line-clamp-2 min-h-[2.5rem]">{s.description || cat.tagline}</p>
                    <div className="flex items-center gap-3 mt-3 text-xs text-slate-500 font-medium">
                      <span>{(s.ratingAverage || 0).toFixed(1)} ★ ({s.ratingCount || 0})</span>
                      <span>{s.productCount || 0} items</span>
                      {s.verified && (
                        <span className="ml-auto text-emerald-700 inline-flex items-center gap-0.5">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                          Verified
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StoresPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-slate-400">Loading…</div>}>
      <StoresInner />
    </Suspense>
  );
}
