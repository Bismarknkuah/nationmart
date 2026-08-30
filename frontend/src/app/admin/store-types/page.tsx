'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authAPI, storeCategoriesAPI, isLoggedIn } from '../../../lib/api';
import { uploadImage } from '../../../lib/upload';

const ADMIN_ROLES = ['admin', 'super_admin', 'ceo', 'coo'];

type Cat = { _id?: string; value: string; label: string; tagline: string; imageUrl: string; order?: number; active?: boolean };

export default function AdminStoreTypes() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/admin/store-types'); return; }
    authAPI.me().then((r) => {
      const u = (r as any).user || r;
      const ok = ADMIN_ROLES.includes(u.role);
      setAllowed(ok);
      if (ok) load(); else setLoading(false);
    }).catch(() => router.push('/auth/login?redirect=/admin/store-types'));
  }, [router]);

  const load = () => {
    setLoading(true);
    storeCategoriesAPI.list(true).then((r) => setCats(r.categories || [])).catch(() => {}).finally(() => setLoading(false));
  };

  if (allowed === null || loading) return <div className="pt-32 text-center text-slate-400">Loading store types…</div>;
  if (!allowed) {
    return (
      <div className="pt-32 text-center">
        <p className="text-slate-600">This area is for administrators.</p>
        <Link href="/dashboard" className="text-indigo-700 font-semibold hover:underline">← Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-8 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-indigo-300">Admin</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Store types</h1>
            <p className="text-sm text-white/70 mt-1">Change a type’s picture, edit its name, deactivate it, or add new ones.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding((a) => !a)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg text-sm">{adding ? 'Close' : '+ Add store type'}</button>
            <Link href="/dashboard" className="text-sm font-semibold px-4 py-2 rounded-lg border border-white/25 text-white">← Dashboard</Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 mt-6 space-y-4">
        {adding && <CatEditor onSaved={() => { setAdding(false); load(); }} />}
        {cats.map((c) => <CatEditor key={c.value} cat={c} onSaved={load} />)}
      </div>
    </div>
  );
}

function CatEditor({ cat, onSaved }: { cat?: Cat; onSaved: () => void }) {
  const isNew = !cat;
  const [f, setF] = useState<Cat>(cat || { value: '', label: '', tagline: '', imageUrl: '', active: true });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const up = (k: keyof Cat, v: any) => setF((p) => ({ ...p, [k]: v }));
  const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200';

  const pickFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true); setMsg('');
    try { const url = await uploadImage(file, { maxPx: 1200 }); up('imageUrl', url); setMsg('✓ Photo ready — click Save to apply.'); }
    catch { setMsg('Could not process that image.'); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!f.value || !f.label) { setMsg('Value and label are required.'); return; }
    setBusy(true); setMsg('');
    try {
      await storeCategoriesAPI.upsert({ value: f.value, label: f.label, tagline: f.tagline, imageUrl: f.imageUrl, active: f.active });
      setMsg('✓ Saved'); onSaved();
    } catch (e: any) { setMsg(e.message || 'Could not save'); }
    finally { setBusy(false); }
  };
  const toggleActive = async () => { up('active', !f.active); setBusy(true); try { await storeCategoriesAPI.upsert({ value: f.value, label: f.label, tagline: f.tagline, imageUrl: f.imageUrl, active: !f.active }); onSaved(); } catch { /* */ } finally { setBusy(false); } };

  return (
    <div className={`bg-white rounded-2xl border p-4 ${f.active === false ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
      <div className="flex gap-4 flex-col sm:flex-row">
        <div className="w-full sm:w-44 shrink-0">
          <div className="aspect-[16/10] rounded-lg overflow-hidden bg-slate-100">
            {f.imageUrl ? <img src={f.imageUrl} alt={f.label} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">No image</div>}
          </div>
          <label className="mt-2 block">
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files)} />
            <span className={`block text-center text-sm font-semibold py-2 rounded-lg border cursor-pointer ${uploading ? 'opacity-60' : 'border-indigo-300 text-indigo-700 hover:bg-indigo-50'}`}>
              {uploading ? 'Uploading…' : f.imageUrl ? '📷 Replace photo' : '📷 Upload photo'}
            </span>
          </label>
        </div>
        <div className="flex-1 space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <input className={input} placeholder="Key (e.g. pharmacy)" value={f.value} disabled={!isNew}
              onChange={(e) => up('value', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} />
            <input className={input} placeholder="Display name" value={f.label} onChange={(e) => up('label', e.target.value)} />
          </div>
          <input className={input} placeholder="Tagline" value={f.tagline} onChange={(e) => up('tagline', e.target.value)} />
          <input className={input} placeholder="Or paste an image URL" value={f.imageUrl} onChange={(e) => up('imageUrl', e.target.value)} />
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={save} disabled={busy || uploading} className="btn-primary text-sm py-2 px-4 disabled:opacity-50">{busy ? 'Saving…' : isNew ? 'Add type' : 'Save'}</button>
            {!isNew && (
              <button onClick={toggleActive} disabled={busy} className="text-sm font-semibold px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">
                {f.active === false ? 'Reactivate' : 'Deactivate'}
              </button>
            )}
            {msg && <span className="text-xs text-slate-500">{msg}</span>}
          </div>
          <p className="text-[11px] text-slate-400">Upload a photo from your device, or paste an image URL. Leave blank to use the default themed photo.</p>
        </div>
      </div>
    </div>
  );
}
