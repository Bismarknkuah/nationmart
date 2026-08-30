'use client';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { productsAPI } from '../../lib/api';
import { useCurrency, convertPrice } from '../../components/ui/Navbar';

const CATEGORIES = [
  'All', 'grocery', 'electronics', 'fashion', 'pharmacy', 'health', 'beauty',
  'home_garden', 'appliances', 'vehicle', 'spare_parts', 'building_materials',
  'agriculture', 'farm_produce', 'restaurant', 'service', 'books_stationery',
  'wholesale', 'furniture', 'timber',
];
const SORTS = [
  { value: 'createdAt:desc', label: 'Newest' },
  { value: 'pricePerUnit:asc', label: 'Price: Low to High' },
  { value: 'pricePerUnit:desc', label: 'Price: High to Low' },
];

function CatalogInner() {
  const params = useSearchParams();
  const { currency } = useCurrency();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState(params.get('search') || '');
  const [debounced, setDebounced] = useState(search);
  const [sort, setSort] = useState('createdAt:desc');

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 400); return () => clearTimeout(t); }, [search]);

  useEffect(() => {
    setLoading(true);
    const [sortBy, sortOrder] = sort.split(':');
    productsAPI.list({
      category: category === 'All' ? undefined : category,
      search: debounced || undefined,
      sort, limit: 40,
      ...({ sortBy, sortOrder } as any),
    }).then((r: any) => setProducts(r.products || r.data || (Array.isArray(r) ? r : [])))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [category, debounced, sort]);

  return (
    <div className="min-h-screen bg-slate-50 pt-8 pb-16 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Browse</p>
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>Catalog</h1>
          <p className="text-slate-500 text-sm mt-1">Products from verified NationMart sellers across Ghana.</p>
        </div>

        <div className="flex flex-wrap gap-3 items-center mb-5">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products…"
            className="flex-1 min-w-[200px] border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 bg-white"
          />
          <select value={sort} onChange={e => setSort(e.target.value)} className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200">
            {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div className="flex gap-2 flex-wrap mb-6">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border capitalize transition-all ${category === c ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
            >
              {c.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-center text-slate-400 py-20">Loading products…</p>
        ) : products.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
            <p className="text-slate-500 font-medium">No products match these filters.</p>
            <p className="text-slate-400 text-sm mt-2">
              Try a different category, or{' '}
              <Link href="/sell" className="text-indigo-700 font-semibold hover:underline">list the first one</Link>.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map(p => (
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
                    {currency === 'GHS' ? `₵${p.pricePerUnit?.toLocaleString()}` : convertPrice(p.pricePerUnit, currency)}
                    <span className="text-xs font-normal text-slate-400"> / {p.unit}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1 truncate">{p.seller?.company || p.seller?.fullName || 'Seller'} · {p.origin || p.seller?.region || 'Ghana'}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-slate-400">Loading…</div>}>
      <CatalogInner />
    </Suspense>
  );
}
