'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { STORE_CATEGORIES, categoryImage } from '../lib/storeCategories';
import { CategoryIcon } from '../components/ui/CategoryIcon';
import { storesAPI, productsAPI, storeCategoriesAPI } from '../lib/api';
import { useCurrency, convertPrice } from '../components/ui/Navbar';

const HERO_STATS = [
  { value: '17+', label: 'Store Categories' },
  { value: '16',  label: 'Ghanaian Regions' },
  { value: '6',   label: 'Supported Currencies' },
  { value: '24/7', label: 'MoMo Payments' },
];

const PLATFORM_FEATURES = [
  {
    title: 'Branded Digital Stores',
    desc: 'Build a category-tailored storefront with your own colours, banner, and layout — no design skills needed.',
    iconPath: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  },
  {
    title: 'Verified Identities',
    desc: 'Every seller is tied to a Ghana Card. Buyers see verified badges, trust scores and public ratings.',
    iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    title: 'Mobile Money + Multi-Currency',
    desc: 'Accept MTN MoMo, Telecel Cash, AirtelTigo Money. Switch between GHS and international currencies in one tap.',
    iconPath: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  },
  {
    title: 'Custom Staff Permissions',
    desc: 'Add team members to your store and pick exactly what each one can do — inventory, finance, messages, or all.',
    iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  },
  {
    title: 'Local + International Markets',
    desc: 'Stay focused on Ghana by default, then toggle a switch to list internationally with live currency conversion.',
    iconPath: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-9v18m9-9H3',
  },
  {
    title: 'Hierarchical Oversight',
    desc: 'District and regional admins review their own jurisdiction. National admins see the whole picture.',
    iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Create your account', desc: 'Register with your Ghana Card or browse as a guest. Buyers, sellers, and service providers all welcome.' },
  { step: '02', title: 'Build your branded store', desc: 'Pick a category template, set your colours and banner, upload products in bulk via CSV.' },
  { step: '03', title: 'Sell across Ghana', desc: 'List in your district, region, or the whole country. Accept MoMo and bank transfers from day one.' },
  { step: '04', title: 'Go international', desc: 'Toggle one switch to put your products on the international market dashboard with USD pricing.' },
];

function ProductCard({ p }: { p: any }) {
  const { currency } = useCurrency();
  const img = p.images?.[0];
  const pct = Number(p.discountPercent) || 0;
  const hasDiscount = pct > 0;
  const effective = p.pricePerUnit * (1 - pct / 100);
  return (
    <Link href={`/catalog/${p._id}`} className="group block bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all overflow-hidden">
      <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden relative">
        {(hasDiscount || p.promoLabel) && (
          <span className="absolute top-2 left-2 z-10 text-[11px] font-bold px-2 py-0.5 rounded-full shadow"
            style={{ background: hasDiscount ? '#dc2626' : '#C8A24B', color: '#fff' }}>
            {hasDiscount ? `-${pct}%` : p.promoLabel}
          </span>
        )}
        {img ? (
          <img src={img} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </div>
        )}
        {p.store?.theme?.logoUrl && (
          <img src={p.store.theme.logoUrl} alt={p.store.name || 'store'} title={p.store.name}
            className="absolute bottom-2 right-2 w-9 h-9 rounded-full object-cover border-2 border-white shadow" />
        )}
      </div>
      <div className="p-4">
        <p className="text-xs text-slate-400 uppercase font-semibold tracking-wide mb-1">{p.category || 'Product'}</p>
        <h3 className="font-semibold text-slate-900 text-sm leading-snug mb-2 line-clamp-2 group-hover:text-indigo-700 transition-colors">{p.title}</h3>
        <div className="flex items-end justify-between mt-3">
          <div>
            {hasDiscount ? (
              <>
                <p className="text-lg font-bold text-slate-900">{convertPrice(effective, currency)}</p>
                <p className="text-xs text-slate-400 line-through">{convertPrice(p.pricePerUnit, currency)}</p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-slate-900">{convertPrice(p.pricePerUnit, currency)}</p>
                <p className="text-xs text-slate-400">per {p.unit}</p>
              </>
            )}
          </div>
          <span className="text-xs text-indigo-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">View &rarr;</span>
        </div>
      </div>
    </Link>
  );
}

function StoreCard({ s }: { s: any }) {
  return (
    <Link href={`/store/${s.slug}`} className="group block bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all overflow-hidden">
      <div
        className="h-20 relative"
        style={{ background: `linear-gradient(135deg, ${s.theme?.primaryColor || '#312e81'} 0%, ${s.theme?.accentColor || '#818cf8'} 100%)` }}
      />
      <div className="p-4 -mt-8">
        <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-700 mb-3">
          <span className="font-bold text-lg">{s.name?.[0] || 'S'}</span>
        </div>
        <h3 className="font-semibold text-slate-900 leading-snug group-hover:text-indigo-700 transition-colors">{s.name}</h3>
        <p className="text-xs text-slate-500 mt-1 capitalize">{(s.type || '').replace('_', ' ')} · {s.region || 'Ghana'}</p>
        {s.verified && <span className="inline-flex items-center gap-1 text-xs text-emerald-700 mt-2 font-semibold">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
          Verified
        </span>}
      </div>
    </Link>
  );
}

export default function HomePage() {
  const [products, setProducts] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>(
    STORE_CATEGORIES.map((c) => ({ value: c.value, label: c.label, tagline: c.tagline, imageUrl: '', iconPath: c.iconPath, swatch: c.swatch })),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      productsAPI.list({ limit: 8 }),
      storesAPI.browse({}),
      storeCategoriesAPI.list(),
    ]).then(([pRes, sRes, cRes]) => {
      if (pRes.status === 'fulfilled') setProducts((pRes.value as any).products?.slice(0, 8) || []);
      if (sRes.status === 'fulfilled') setStores((sRes.value as any).stores?.slice(0, 6) || []);
      if (cRes.status === 'fulfilled' && (cRes.value as any).categories?.length) {
        setCategories((cRes.value as any).categories);
      }
      setLoading(false);
    });
  }, []);

  return (
    <>
      {/* ─── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative bg-mesh overflow-hidden">
        {/* Kejetia market backdrop (Kumasi) — dimmed so text stays legible */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/market-home.webp')", filter: 'brightness(0.32) saturate(0.9)' }}
        />
        {/* Guaranteed dark overlay (inline rgba so it can't be purged) */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(120deg, rgba(8,10,20,0.86) 0%, rgba(8,10,20,0.78) 45%, rgba(0,0,0,0.88) 100%)' }}
        />
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(90deg,#9A7A2E,#E7CB77,#C8A24B)' }} />
        <div className="absolute inset-0 bg-grid opacity-10" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-28 md:pt-28 md:pb-36">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 text-xs font-semibold text-indigo-200 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live in 16 regions across Ghana
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight tracking-tight text-balance">
              The marketplace built for{' '}
              <span className="bg-gradient-to-r from-indigo-300 to-cyan-300 bg-clip-text text-transparent">
                every Ghanaian business.
              </span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-slate-300 max-w-2xl leading-relaxed">
              Pharmacies, electronics shops, vehicle dealers, restaurants, farms, fashion boutiques, building suppliers — open a branded online store on NationMart, sell across Ghana, and reach the world.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <Link href="/auth/register" className="inline-flex items-center justify-center gap-2 font-semibold px-6 py-3 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98] text-base"
                style={{ background: 'linear-gradient(180deg,#E7CB77,#C8A24B)', color: '#3a2c0a' }}>
                Open Your Store
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
              <Link href="/stores" className="btn-primary text-base">
                Explore the Marketplace
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </div>

            {/* Trust strip */}
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                Free 60-day trial
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                No card required
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                MoMo &amp; card payments
              </span>
            </div>

            <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-2xl">
              {HERO_STATS.map(s => (
                <div key={s.label}>
                  <div className="text-2xl md:text-3xl font-bold text-white">{s.value}</div>
                  <div className="text-xs text-slate-400 font-medium uppercase tracking-wider mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom curve / fade into next section */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-b from-transparent to-slate-50" />
      </section>

      {/* ─── STORE CATEGORIES ─────────────────────────────────────────── */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <p className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-2">Store Categories</p>
            <h2 className="section-heading">A storefront tailored to every kind of business.</h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              Pick a category and get a professional, ready-to-customise digital store designed for that line of business — with the right layout, colours and tools out of the box.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {categories.map(cat => (
              <Link
                key={cat.value}
                href={`/discover?cat=${encodeURIComponent(cat.label)}`}
                className="group bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md overflow-hidden transition-all"
              >
                <div className="aspect-[16/10] bg-slate-100 overflow-hidden relative">
                  <img src={cat.imageUrl || categoryImage(cat.value)} alt={cat.label} loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-3">
                  <h3 className="font-semibold text-sm text-slate-900 leading-tight group-hover:text-indigo-700 transition-colors">{cat.label}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-snug line-clamp-2">{cat.tagline}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── INTERNATIONAL MARKET SWITCH ──────────────────────────────── */}
      <section className="bg-slate-50 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/international"
            className="group block bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md rounded-2xl p-6 transition-all"
          >
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-9v18m9-9H3" /></svg>
                </div>
                <div>
                  <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-0.5">Buying from abroad?</p>
                  <h3 className="font-bold text-slate-900 text-lg">Switch to the International Market</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Browse Ghanaian sellers shipping worldwide, with prices in USD and global delivery options.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700 group-hover:text-indigo-900">
                Open International Market
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* ─── FEATURED STORES ──────────────────────────────────────────── */}
      {stores.length > 0 && (
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-12">
              <div>
                <p className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-2">Featured Stores</p>
                <h2 className="section-heading">Verified businesses you can trust.</h2>
              </div>
              <Link href="/stores" className="hidden md:inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900">
                See all stores
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {stores.map(s => <StoreCard key={s._id} s={s} />)}
            </div>
          </div>
        </section>
      )}

      {/* ─── FEATURED PRODUCTS ────────────────────────────────────────── */}
      {products.length > 0 && (
        <section className="py-20 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-12">
              <div>
                <p className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-2">Now on the Marketplace</p>
                <h2 className="section-heading">Fresh listings from across Ghana.</h2>
              </div>
              <Link href="/catalog" className="hidden md:inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900">
                Browse catalog
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map(p => <ProductCard key={p._id} p={p} />)}
            </div>
          </div>
        </section>
      )}

      {!loading && products.length === 0 && stores.length === 0 && (
        <section className="py-20 bg-slate-50">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <h2 className="section-heading">A marketplace ready for you to fill.</h2>
            <p className="mt-4 text-slate-600">
              No public listings yet in this environment. Sign in and create your first store to get the catalog going.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/auth/register" className="btn-primary">Open Your Store</Link>
              <Link href="/auth/login" className="btn-secondary">Log in</Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── PLATFORM FEATURES ────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <p className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-2">Why NationMart</p>
            <h2 className="section-heading">A serious platform for serious businesses.</h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              NationMart is built on the same foundations as a modern enterprise SaaS — verified identities, role-based teams, multi-currency, audit trails — designed for Ghanaian conditions and Ghanaian sellers.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PLATFORM_FEATURES.map(f => (
              <div key={f.title} className="bg-slate-50 border border-slate-200 rounded-2xl p-6 hover:border-indigo-200 hover:shadow-sm transition-all">
                <div className="w-11 h-11 rounded-lg bg-indigo-600 text-white flex items-center justify-center mb-4">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d={f.iconPath} /></svg>
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─────────────────────────────────────────────── */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-16">
            <p className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-2">Get Started</p>
            <h2 className="section-heading">From sign-up to selling in four steps.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map(s => (
              <div key={s.step} className="relative bg-white rounded-2xl p-6 border border-slate-200">
                <div className="text-5xl font-bold text-indigo-100" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>{s.step}</div>
                <h3 className="font-bold text-slate-900 mt-3 mb-2">{s.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-indigo-700 via-indigo-600 to-blue-600 rounded-3xl p-10 md:p-16 text-center text-white shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-grid opacity-30" />
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-balance" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>
                Ready to put your business online?
              </h2>
              <p className="mt-4 text-indigo-100 max-w-2xl mx-auto leading-relaxed">
                Open a branded store in under 5 minutes. Free 60-day trial — no credit card needed.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/auth/register" className="bg-white text-indigo-700 font-bold px-8 py-3 rounded-xl hover:bg-indigo-50 transition-all shadow-md">
                  Create Your Free Account
                </Link>
                <Link href="/stores" className="border border-white/40 text-white font-semibold px-8 py-3 rounded-xl hover:bg-white/10 transition-all">
                  Browse as Guest
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
