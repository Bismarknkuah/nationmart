'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { productsAPI, storesAPI, isLoggedIn } from '../../lib/api';
import { uploadImage } from '../../lib/upload';

// Generic categories — anything a NationMart store might list.
const CATEGORIES = [
  'grocery', 'electronics', 'fashion', 'pharmacy', 'health', 'beauty',
  'home_garden', 'appliances', 'vehicle', 'spare_parts', 'building_materials',
  'agriculture', 'farm_produce', 'restaurant', 'service', 'books_stationery',
  'wholesale', 'furniture', 'timber', 'other',
];
const UNITS = ['piece', 'pack', 'kg', 'tonne', 'litre', 'set', 'bundle', 'sheet', 'm', 'm2', 'm3', 'hour', 'day'];

const input = 'w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 bg-white';
const label = 'text-sm font-medium text-slate-700 block mb-1.5';

export default function SellPage() {
  const router = useRouter();
  const [stores, setStores] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    title: '', category: 'grocery', species: '', grade: '', origin: '',
    description: '', pricePerUnit: '', currency: 'GHS', unit: 'piece',
    minimumOrder: '1', availableQuantity: '', store: '',
    marketScope: 'local' as 'local' | 'international' | 'both',
  });
  const [images, setImages] = useState<string[]>([]);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));

  // Downscale + (optionally) upload to Cloudinary, then store the returned URL.
  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const room = 5 - images.length;
    Array.from(files).slice(0, room).forEach(async (file) => {
      try { const url = await uploadImage(file); setImages((prev) => prev.length >= 5 ? prev : [...prev, url]); }
      catch { /* skip */ }
    });
  };

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/sell'); return; }
    storesAPI.mine().then(r => setStores(r.stores || [])).catch(() => {});
  }, [router]);

  const submit = async () => {
    if (!f.title || !f.pricePerUnit || !f.availableQuantity) {
      setError('Please fill in title, price and available quantity.'); return;
    }
    setSaving(true); setError('');
    try {
      const store = stores.find(s => s._id === f.store);
      // Auto region/district + coordinates from the seller's store, so Discover
      // location filters and "Nearby" work out of the box.
      const locText = store
        ? [store.district, store.region].filter(Boolean).join(', ') || store.region || f.origin || 'Ghana'
        : (f.origin || 'Ghana');
      const coordinates = (store && typeof store.lat === 'number' && typeof store.lng === 'number')
        ? { lat: store.lat, lng: store.lng } : undefined;
      await productsAPI.create({
        ...f,
        images,
        location: locText,
        coordinates,
        // Backend still requires species & origin as legacy fields — send safe defaults
        species: f.species || 'N/A',
        origin: f.origin || (store?.region || 'Ghana'),
        grade: f.grade || 'Standard',
        pricePerUnit: Number(f.pricePerUnit),
        minimumOrder: Number(f.minimumOrder) || 1,
        availableQuantity: Number(f.availableQuantity),
        store: f.store || undefined,
      } as any);
      setOk(true);
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (e: any) {
      setError(e.message || 'Could not create the listing.');
    } finally { setSaving(false); }
  };

  if (ok) return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-md">
        <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900">Listing submitted</h2>
        <p className="text-slate-500 text-sm mt-2">Your product is pending review and will appear in the catalog once approved.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pt-8 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">New Listing</p>
        <h1 className="text-3xl font-bold text-slate-900 mb-1" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>List a product</h1>
        <p className="text-slate-500 text-sm mb-6">New listings are reviewed before going live. Active subscription required after the 60-day free trial.</p>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-5">{error}</div>}

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm">
          <div><label className={label}>Title *</label><input className={input} value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Long-grain rice 50kg bag" /></div>

          <div>
            <label className={label}>Photos <span className="text-slate-400 font-normal">(up to 5 — first is the cover)</span></label>
            <div className="flex flex-wrap gap-2 mt-1">
              {images.map((src, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
                  <img src={src} alt={`photo ${i + 1}`} className="w-full h-full object-cover" />
                  {i === 0 && <span className="absolute bottom-0 inset-x-0 bg-emerald-600 text-white text-[9px] text-center font-semibold">COVER</span>}
                  <button type="button" onClick={() => setImages(prev => prev.filter((_, x) => x !== i))}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center">×</button>
                </div>
              ))}
              {images.length < 5 && (
                <label className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:border-emerald-400 hover:text-emerald-500">
                  <span className="text-xl leading-none">+</span>
                  <span className="text-[10px]">Add</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
                </label>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Category *</label>
              <select className={input} value={f.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div><label className={label}>Brand / species (optional)</label><input className={input} value={f.species} onChange={e => set('species', e.target.value)} placeholder="e.g. Samsung, Iroko, Tema" /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Quality / grade</label><input className={input} value={f.grade} onChange={e => set('grade', e.target.value)} placeholder="e.g. New, Grade A" /></div>
            <div><label className={label}>Origin region</label><input className={input} value={f.origin} onChange={e => set('origin', e.target.value)} placeholder="e.g. Ashanti, China" /></div>
          </div>

          <div><label className={label}>Description</label><textarea className={input} rows={3} value={f.description} onChange={e => set('description', e.target.value)} placeholder="Describe your product, condition, what's included…" /></div>

          <div className="grid grid-cols-3 gap-3">
            <div><label className={label}>Price *</label><input type="number" className={input} value={f.pricePerUnit} onChange={e => set('pricePerUnit', e.target.value)} /></div>
            <div>
              <label className={label}>Currency</label>
              <select className={input} value={f.currency} onChange={e => set('currency', e.target.value)}><option>GHS</option><option>USD</option></select>
            </div>
            <div>
              <label className={label}>Unit</label>
              <select className={input} value={f.unit} onChange={e => set('unit', e.target.value)}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Minimum order</label><input type="number" className={input} value={f.minimumOrder} onChange={e => set('minimumOrder', e.target.value)} /></div>
            <div><label className={label}>Available quantity *</label><input type="number" className={input} value={f.availableQuantity} onChange={e => set('availableQuantity', e.target.value)} /></div>
          </div>

          {stores.length > 0 && (
            <div>
              <label className={label}>Store</label>
              <select className={input} value={f.store} onChange={e => set('store', e.target.value)}>
                <option value="">— Personal listing (no store) —</option>
                {stores.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className={label}>Where to list this product *</label>
            <select className={input} value={f.marketScope} onChange={e => set('marketScope', e.target.value)}>
              <option value="local">Local market only — Ghana buyers</option>
              <option value="international">International market only — buyers abroad</option>
              <option value="both">Both markets — local and international</option>
            </select>
            <p className="text-xs text-slate-400 mt-1">
              {f.marketScope === 'local' && 'Visible only to buyers browsing the Ghana market.'}
              {f.marketScope === 'international' && 'Visible only to buyers who have opened the International market dashboard.'}
              {f.marketScope === 'both' && 'Visible in both dashboards. Pricing shown in GHS locally and converted to USD internationally.'}
            </p>
          </div>

          <button onClick={submit} disabled={saving} className="w-full btn-primary disabled:opacity-60">
            {saving ? 'Submitting…' : 'Submit listing'}
          </button>
        </div>
      </div>
    </div>
  );
}
