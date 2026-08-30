'use client';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { storesAPI, productsAPI } from '../../lib/api';
import { STORE_CATEGORIES, STORE_CATEGORY_MAP } from '../../lib/storeCategories';
import { CategoryIcon } from '../../components/ui/CategoryIcon';
import { useCurrency, convertPrice } from '../../components/ui/Navbar';

function InternationalInner() {
  const params = useSearchParams();
  const initialType = params.get('type') || '';
  const { currency } = useCurrency();

  const [stores, setStores] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [type, setType] = useState(initialType);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      storesAPI.browse({ type: type || undefined, market: 'international' }),
      productsAPI.list({ market: 'international', limit: 24, ...(type ? { category: type } : {}) }),
    ]).then(([sRes, pRes]) => {
      if (sRes.status === 'fulfilled') setStores((sRes.value as any).stores || []);
      else setStores([]);
      if (pRes.status === 'fulfilled') setProducts((pRes.value as any).products || []);
      else setProducts([]);
      setLoading(false);
    });
  }, [type]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ─── Header strip ─────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-600 text-white py-10 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-9v18m9-9H3" /></svg>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-100">International Market</p>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>
            Buy from Ghanaian sellers — worldwide.
          </h1>
          <p className="mt-3 text-indigo-100 max-w-2xl">
            Verified stores and products available for international shipping. Prices in USD with live conversion. International delivery quotes are confirmed by the seller after you place an order.
          </p>
          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <Link href="/stores" className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white font-semibold px-4 py-2 rounded-lg border border-white/20 transition-colors text-sm">
              <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              Back to Local Market
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Category chips */}
        <div className="flex items-start gap-2 flex-wrap mb-8">
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

        {loading ? (
          <p className="text-slate-400 text-center py-20">Loading international market…</p>
        ) : stores.length === 0 && products.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
            <p className="text-slate-500 font-medium">No international listings yet for this category.</p>
            <p className="text-slate-400 text-sm mt-2">Try a different category or check back soon.</p>
          </div>
        ) : (
          <>
            {/* Stores */}
            {stores.length > 0 && (
              <section className="mb-12">
                <h2 className="text-xl font-bold text-slate-900 mb-4">International stores</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {stores.map(s => {
                    const cat = STORE_CATEGORY_MAP[s.type] || STORE_CATEGORY_MAP.general;
                    return (
                      <Link key={s._id} href={`/store/${s.slug}`} className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md hover:border-indigo-200 transition-all group">
                        <div
                          className="h-24 relative flex items-end p-4"
                          style={{ background: `linear-gradient(135deg, ${s.theme?.primaryColor || '#312e81'} 0%, ${s.theme?.accentColor || '#818cf8'} 100%)` }}
                        >
                          <h3 className="font-bold text-white text-lg leading-tight" style={{ fontFamily: s.theme?.font || 'Georgia, serif' }}>
                            {s.name}
                          </h3>
                        </div>
                        <div className="p-4">
                          <div className={`inline-flex items-center gap-1.5 ${cat.swatch.bg} ${cat.swatch.text} text-xs font-semibold px-2 py-1 rounded-full mb-2`}>
                            <CategoryIcon path={cat.iconPath} className="w-3.5 h-3.5" />
                            {cat.label}
                          </div>
                          <p className="text-sm text-slate-500 line-clamp-2 min-h-[2.5rem]">{s.description || cat.tagline}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Products */}
            {products.length > 0 && (
              <section>
                <h2 className="text-xl font-bold text-slate-900 mb-4">International products</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {products.map((p: any) => (
                    <Link key={p._id} href={`/catalog/${p._id}`} className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md hover:border-indigo-200 transition-all group">
                      <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center overflow-hidden">
                        {p.images?.[0]
                          ? <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          : <svg className="w-14 h-14 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        }
                      </div>
                      <div className="p-4">
                        <p className="text-xs text-slate-400 uppercase font-semibold tracking-wide capitalize">{(p.category || 'Product').replace(/_/g, ' ')}</p>
                        <h3 className="font-semibold text-slate-900 text-sm mt-1 group-hover:text-indigo-700 line-clamp-2 min-h-[2.5rem]">{p.title}</h3>
                        <p className="font-bold text-slate-900 mt-2 text-base">
                          {convertPrice(p.pricePerUnit, currency)}
                          <span className="text-xs font-normal text-slate-400"> / {p.unit}</span>
                        </p>
                        <p className="text-xs text-slate-400 mt-1 truncate">{p.seller?.company || p.seller?.fullName || 'Seller'} · {p.origin || 'Ghana'}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function InternationalPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-slate-400">Loading…</div>}>
      <InternationalInner />
    </Suspense>
  );
}
