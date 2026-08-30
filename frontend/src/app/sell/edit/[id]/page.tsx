'use client';
import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { productsAPI, isLoggedIn } from '../../../../lib/api';
import { uploadImage } from '../../../../lib/upload';

const CATEGORIES = ['grocery', 'electronics', 'fashion', 'vehicle', 'building_materials', 'pharmacy', 'farm', 'furniture', 'services', 'beauty', 'other'];
const UNITS = ['piece', 'kg', 'bag', 'box', 'litre', 'pack', 'set', 'dozen', 'metre', 'unit'];

export default function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [f, setF] = useState<any>(null);

  useEffect(() => {
    if (!isLoggedIn()) { router.push(`/auth/login?redirect=/sell/edit/${id}`); return; }
    productsAPI.getById(id).then((r: any) => {
      const p = r.product || r;
      setF({
        title: p.title || '', category: p.category || 'other', description: p.description || '',
        pricePerUnit: String(p.pricePerUnit ?? ''), currency: p.currency || 'GHS', unit: p.unit || 'piece',
        minimumOrder: String(p.minimumOrder ?? 1), availableQuantity: String(p.availableQuantity ?? ''),
        discountPercent: String(p.discountPercent ?? 0), promoLabel: p.promoLabel || '',
        status: p.status || 'active', marketScope: p.marketScope || 'local',
      });
      setImages(p.images || []);
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [id, router]);

  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const room = 5 - images.length;
    Array.from(files).slice(0, room).forEach(async (file) => {
      try { const url = await uploadImage(file); setImages((prev) => prev.length >= 5 ? prev : [...prev, url]); }
      catch { /* skip */ }
    });
  };
  const move = (i: number, dir: -1 | 1) => {
    setImages((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next;
    });
  };
  const makeCover = (i: number) => setImages((prev) => (i === 0 ? prev : [prev[i], ...prev.filter((_, x) => x !== i)]));
  const remove = (i: number) => setImages((prev) => prev.filter((_, x) => x !== i));

  const save = async () => {
    if (!f.title || !f.pricePerUnit) { setError('Title and price are required.'); return; }
    setSaving(true); setError(''); setOk('');
    try {
      await productsAPI.update(id, {
        ...f,
        images,
        pricePerUnit: Number(f.pricePerUnit),
        minimumOrder: Number(f.minimumOrder) || 1,
        availableQuantity: Number(f.availableQuantity) || 0,
        discountPercent: Math.max(0, Math.min(90, Number(f.discountPercent) || 0)),
      });
      setOk('Saved. Your changes are live.');
      setTimeout(() => setOk(''), 2500);
    } catch (e: any) { setError(e.message || 'Could not save.'); }
    finally { setSaving(false); }
  };

  const duplicate = async () => {
    setSaving(true); setError('');
    try {
      const r: any = await productsAPI.create({
        ...f,
        title: `${f.title} (copy)`,
        images,
        species: 'N/A', origin: 'Ghana', grade: 'Standard',
        pricePerUnit: Number(f.pricePerUnit) || 0,
        minimumOrder: Number(f.minimumOrder) || 1,
        availableQuantity: Number(f.availableQuantity) || 0,
        discountPercent: Math.max(0, Math.min(90, Number(f.discountPercent) || 0)),
      });
      const np = r.product || r;
      if (np?._id) router.push(`/sell/edit/${np._id}`);
      else setOk('Duplicated.');
    } catch (e: any) { setError(e.message || 'Could not duplicate.'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="pt-32 text-center text-slate-400">Loading listing…</div>;
  if (!f) return <div className="pt-32 text-center text-slate-500">{error || 'Listing not found.'}</div>;

  const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200';
  const label = 'block text-xs font-semibold text-slate-600 mb-1';

  return (
    <div className="max-w-2xl mx-auto px-4 pt-10 pb-20">
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">← Back to dashboard</Link>
      <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-1">Edit listing</h1>
      <p className="text-slate-500 text-sm mb-6">Update details, add or reorder photos, or pause the listing.</p>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>}
      {ok && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3 mb-4">{ok}</div>}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm">
        {/* Photos */}
        <div>
          <label className={label}>Photos <span className="text-slate-400 font-normal">(drag order with the arrows · first = cover · up to 5)</span></label>
          <div className="flex flex-wrap gap-2 mt-1">
            {images.map((src, i) => (
              <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden border border-slate-200 group">
                <img src={src} alt={`photo ${i + 1}`} className="w-full h-full object-cover" />
                {i === 0 && <span className="absolute top-0 inset-x-0 bg-emerald-600 text-white text-[9px] text-center font-semibold">COVER</span>}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="w-6 h-6 rounded bg-white/90 text-slate-700 text-xs disabled:opacity-30">←</button>
                  {i !== 0 && <button type="button" onClick={() => makeCover(i)} title="Make cover" className="w-6 h-6 rounded bg-white/90 text-amber-600 text-xs">★</button>}
                  <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1} className="w-6 h-6 rounded bg-white/90 text-slate-700 text-xs disabled:opacity-30">→</button>
                  <button type="button" onClick={() => remove(i)} className="w-6 h-6 rounded bg-white/90 text-rose-600 text-xs">×</button>
                </div>
              </div>
            ))}
            {images.length < 5 && (
              <label className="w-24 h-24 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:border-emerald-400 hover:text-emerald-500">
                <span className="text-xl leading-none">+</span><span className="text-[10px]">Add photo</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
              </label>
            )}
          </div>
        </div>

        <div><label className={label}>Title</label><input className={input} value={f.title} onChange={(e) => set('title', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>Category</label>
            <select className={input} value={f.category} onChange={(e) => set('category', e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div><label className={label}>Status</label>
            <select className={input} value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="active">Active (visible)</option>
              <option value="draft">Hidden / paused</option>
              <option value="sold_out">Sold out</option>
            </select>
          </div>
        </div>
        <div><label className={label}>Description</label><textarea className={input} rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={label}>Price</label><input type="number" className={input} value={f.pricePerUnit} onChange={(e) => set('pricePerUnit', e.target.value)} /></div>
          <div><label className={label}>Currency</label><select className={input} value={f.currency} onChange={(e) => set('currency', e.target.value)}><option>GHS</option><option>USD</option></select></div>
          <div><label className={label}>Unit</label><select className={input} value={f.unit} onChange={(e) => set('unit', e.target.value)}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>Available quantity</label><input type="number" className={input} value={f.availableQuantity} onChange={(e) => set('availableQuantity', e.target.value)} /></div>
          <div><label className={label}>Minimum order</label><input type="number" className={input} value={f.minimumOrder} onChange={(e) => set('minimumOrder', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>Discount %</label><input type="number" min={0} max={90} className={input} value={f.discountPercent} onChange={(e) => set('discountPercent', e.target.value)} /></div>
          <div><label className={label}>Promo label</label><input className={input} value={f.promoLabel} onChange={(e) => set('promoLabel', e.target.value)} placeholder="e.g. Festive sale" /></div>
        </div>

        <div className="flex gap-3 pt-2 flex-wrap">
          <button onClick={save} disabled={saving} className="btn-primary text-sm py-2.5 px-6 disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
          <Link href={`/catalog/${id}`} className="text-sm py-2.5 px-5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">View listing</Link>
          <button onClick={duplicate} disabled={saving} className="text-sm py-2.5 px-5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 ml-auto">⧉ Duplicate</button>
        </div>
      </div>
    </div>
  );
}
