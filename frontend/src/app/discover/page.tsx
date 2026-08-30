'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { productsAPI, discoverAPI, authAPI, isLoggedIn, storeCategoriesAPI } from '../../lib/api';
import { COUNTRIES } from '../../lib/countries';
import { GHANA_REGIONS } from '../../lib/ghanaRegions';
import { useCurrency, convertPrice } from '../../components/ui/Navbar';

const SORTS = [
  { key: 'new', label: 'Newest', sortBy: 'createdAt', sortOrder: 'desc' as const },
  { key: 'price_asc', label: 'Price: low → high', sortBy: 'pricePerUnit', sortOrder: 'asc' as const },
  { key: 'price_desc', label: 'Price: high → low', sortBy: 'pricePerUnit', sortOrder: 'desc' as const },
  { key: 'nearby', label: 'Nearby (uses my location)', sortBy: 'createdAt', sortOrder: 'desc' as const },
];

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function DiscoverPage() {
  const { currency } = useCurrency();
  const [homeCountry, setHomeCountry] = useState('Ghana');
  const [country, setCountry] = useState('Ghana');
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('');
  const [district, setDistrict] = useState('');
  const [town, setTown] = useState('');
  const [sortKey, setSortKey] = useState('new');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [photoNote, setPhotoNote] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cats, setCats] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Category chips (same catalogue admins manage).
  useEffect(() => { storeCategoriesAPI.list().then((r) => setCats(r.categories || [])).catch(() => {}); }, []);

  // Read ?q= / ?cat= from the URL (e.g. tapped a category on the homepage).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const urlQ = sp.get('q') || sp.get('cat') || '';
    if (urlQ) { setQ(urlQ); search(urlQ); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Registered country is always first + default.
  useEffect(() => {
    if (!isLoggedIn()) return;
    authAPI.me().then((r) => {
      const u = (r as any).user || r;
      if (u?.country) { setHomeCountry(u.country); setCountry(u.country); }
    }).catch(() => {});
  }, []);

  const countryOptions = useMemo(() => {
    const rest = COUNTRIES.filter((c) => c !== homeCountry);
    return [homeCountry, ...rest];
  }, [homeCountry]);

  const regions = country === 'Ghana' ? GHANA_REGIONS : [];
  const districts = useMemo(() => regions.find((r) => r.name === region)?.districts || [], [regions, region]);

  const search = async (overrideQ?: string) => {
    setLoading(true);
    const term = overrideQ ?? q;
    const s = SORTS.find((x) => x.key === sortKey)!;
    try {
      const res = await productsAPI.list({
        search: term || undefined,
        region: region || undefined,
        district: district || undefined,
        town: town || undefined,
        sortBy: s.sortBy, sortOrder: s.sortOrder,
        market: 'local', limit: 40,
      });
      let items = res.products || [];
      if (sortKey === 'nearby' && myLoc) {
        items = [...items].sort((a, b) => {
          const da = a.coordinates ? haversine(myLoc, a.coordinates) : 1e9;
          const db = b.coordinates ? haversine(myLoc, b.coordinates) : 1e9;
          return da - db;
        });
      }
      setResults(items);
    } catch { setResults([]); } finally { setLoading(false); }
  };

  useEffect(() => { search(); /* on filter/sort change */ }, [region, district, sortKey, country]);

  const onSortChange = (key: string) => {
    setSortKey(key);
    if (key === 'nearby' && !myLoc && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => setMyLoc({ lat: p.coords.latitude, lng: p.coords.longitude }));
    }
  };

  const onPhoto = async (file: File) => {
    setScanning(true); setPhotoNote('');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const r = await discoverAPI.visual(String(reader.result));
        if (r.query) { setQ(r.query); await search(r.query); setPhotoNote(`Showing matches for: ${r.query}`); }
        else setPhotoNote(r.note || 'Could not read the photo. Try typing instead.');
      } catch { setPhotoNote('Photo search is unavailable right now. Please type what you want.'); }
      finally { setScanning(false); }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Hero */}
      <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-green-700">
        <div className="max-w-5xl mx-auto px-4 pt-14 pb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-white text-center">What are you looking for?</h1>
          <p className="text-center text-white/80 mt-2 text-sm">Search anything across {homeCountry} — by region, district or town. Or snap a photo.</p>

          {/* Country */}
          <div className="flex justify-center mt-5">
            <div className="bg-white/10 rounded-full px-1 py-1 flex items-center gap-1 backdrop-blur">
              <select value={country} onChange={(e) => { setCountry(e.target.value); setRegion(''); setDistrict(''); }}
                className="bg-transparent text-white text-sm font-semibold px-3 py-1.5 rounded-full focus:outline-none">
                {countryOptions.map((c) => <option key={c} value={c} className="text-slate-900">{c === homeCountry ? `📍 ${c} (home)` : c}</option>)}
              </select>
            </div>
          </div>

          {/* Search bar + photo */}
          <div className="mt-4 bg-white rounded-2xl p-2 flex items-center gap-2 shadow-xl max-w-3xl mx-auto">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="e.g. iPhone 13, office chair, building cement…"
              className="flex-1 px-4 py-3 text-sm focus:outline-none" />
            <button onClick={() => fileRef.current?.click()} title="Search by photo"
              className="px-3 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">{scanning ? '…' : '📷'}</button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); }} />
            <button onClick={() => search()} className="px-5 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm">Search</button>
          </div>
          {photoNote && <p className="text-center text-white/90 text-xs mt-2">{photoNote}</p>}
        </div>
      </div>

      {/* Category chips */}
      {cats.length > 0 && (
        <div className="max-w-5xl mx-auto px-4 mt-7">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {cats.map((c) => (
              <button key={c.value} onClick={() => { setQ(c.label); search(c.label); }}
                className="shrink-0 flex items-center gap-2 bg-white border border-slate-200 rounded-full pl-1.5 pr-3 py-1.5 hover:border-emerald-400 hover:shadow-sm transition">
                {c.imageUrl && <img src={c.imageUrl} alt="" className="w-7 h-7 rounded-full object-cover" />}
                <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="max-w-5xl mx-auto px-4 mt-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap gap-3">
          {country === 'Ghana' ? (
            <>
              <select value={region} onChange={(e) => { setRegion(e.target.value); setDistrict(''); }} className={selCls}>
                <option value="">All regions</option>
                {GHANA_REGIONS.map((r) => <option key={r.code} value={r.name}>{r.name}</option>)}
              </select>
              <select value={district} onChange={(e) => setDistrict(e.target.value)} className={selCls} disabled={!region}>
                <option value="">{region ? 'All districts' : 'Select region first'}</option>
                {districts.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
              </select>
            </>
          ) : (
            <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Region / state" className={selCls} />
          )}
          <input value={town} onChange={(e) => setTown(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Town / area" className={selCls} />
          <select value={sortKey} onChange={(e) => onSortChange(e.target.value)} className={selCls + ' ml-auto'}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <p className="text-sm text-slate-500 mb-4">{loading ? 'Searching…' : `${results.length} result${results.length === 1 ? '' : 's'}`}{region ? ` · ${region}` : ''}{district ? ` · ${district}` : ''}</p>
        {!loading && results.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-4xl mb-3">🔍</p>
            <p>No items found. Try a different search or widen your location.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {results.map((p) => {
              const hasDisc = p.discountPercent > 0;
              const price = hasDisc ? p.pricePerUnit * (1 - p.discountPercent / 100) : p.pricePerUnit;
              return (
                <Link key={p._id} href={`/catalog/${p._id}`} className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="aspect-square bg-slate-100 overflow-hidden relative">
                    {p.images?.[0]
                      ? <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      : <div className="w-full h-full flex items-center justify-center text-slate-300 text-3xl">📦</div>}
                    {hasDisc && <span className="absolute top-2 left-2 bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">-{p.discountPercent}%</span>}
                    {p.store?.theme?.logoUrl && (
                      <img src={p.store.theme.logoUrl} alt={p.store.name || 'store'} title={p.store.name}
                        className="absolute bottom-2 right-2 w-8 h-8 rounded-full object-cover border-2 border-white shadow" />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400 truncate">{p.location || p.seller?.region || ''}</p>
                    <div className="mt-1.5 flex items-baseline gap-1.5">
                      <span className="font-bold text-emerald-700">{convertPrice(price, currency)}</span>
                      {hasDisc && <span className="text-xs text-slate-400 line-through">{convertPrice(p.pricePerUnit, currency)}</span>}
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

const selCls = 'border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white';
