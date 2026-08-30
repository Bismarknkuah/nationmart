'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authAPI, managementAPI, storeCategoriesAPI, isLoggedIn } from '../../../lib/api';
import { GHANA_REGIONS } from '../../../lib/ghanaRegions';
import { DashPage, DashHeader, HeaderAction } from '../../../components/ui/Dash';

// Roles allowed to create stores for sellers (management levels 1–4).
const MGMT_RX = /admin|ceo|coo|cto|cio|cfo|chro|director|officer|manager|national|regional|district/i;

export default function CreateStorePage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [types, setTypes] = useState<any[]>([]);
  const [f, setF] = useState({ ownerEmail: '', name: '', type: 'general', region: '', district: '' });
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/admin/create-store'); return; }
    authAPI.me().then((r) => {
      const u = (r as any).user || r; setMe(u); setAllowed(MGMT_RX.test(u.role || ''));
      setF((p) => ({ ...p, region: u.region || '', district: u.district || '' }));
    }).catch(() => router.push('/auth/login'));
    storeCategoriesAPI.list().then((r: any) => setTypes(r.categories || r || [])).catch(() => {});
  }, [router]);

  if (allowed === null) return <div className="pt-32 text-center text-slate-400">Loading…</div>;
  if (!allowed) return <div className="pt-32 text-center"><p className="text-slate-600">Management access only.</p><Link href="/dashboard" className="text-indigo-700 font-semibold">← Dashboard</Link></div>;

  // National roles can pick any region/district; regional/district are locked to their own.
  const isNational = /admin|ceo|coo|cto|cio|cfo|chro|national/i.test(me.role || '');
  const isRegional = /regional|region_admin/i.test(me.role || '') && !isNational;
  const regionObj = GHANA_REGIONS.find((r) => r.name === f.region);

  const submit = async () => {
    if (!f.ownerEmail.trim() || !f.name.trim()) { setMsg('Seller email and store name are required.'); return; }
    setBusy(true); setMsg(''); setOk('');
    try {
      const r = await managementAPI.createStoreFor({
        ownerEmail: f.ownerEmail.trim(), name: f.name.trim(), type: f.type,
        region: f.region || undefined, district: f.district || undefined,
      });
      setOk(`✓ Created “${r.store.name}” (${r.store.storeCode}) for ${r.store.owner} in ${r.store.district || ''} ${r.store.region || ''}.`.trim());
      setF((p) => ({ ...p, ownerEmail: '', name: '' }));
    } catch (e: any) { setMsg(e.message || 'Could not create the store.'); }
    finally { setBusy(false); }
  };

  const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200';

  return (
    <DashPage>
      <DashHeader
        eyebrow="Commerce" icon="🏪" accent="emerald"
        title="Create a store for a seller"
        subtitle="For sellers who can't set one up themselves."
        actions={<HeaderAction href="/dashboard">← Dashboard</HeaderAction>}
      />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 -mt-5 relative z-10">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
          <p className="text-xs text-slate-500">
            {isNational ? 'As a national officer you can create stores anywhere in the country.'
              : isRegional ? `You can create stores within ${me.region || 'your region'}.`
              : `You can create stores within ${me.district || 'your district'}, ${me.region || ''}.`}
          </p>
          <div>
            <label className="text-xs text-slate-500">Seller's account email</label>
            <input className={input} value={f.ownerEmail} onChange={(e) => setF({ ...f, ownerEmail: e.target.value })} placeholder="seller@example.com" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Store name</label>
            <input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Kumasi Fresh Produce" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Store type</label>
            <select className={input} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {types.length === 0 ? <option value="general">General</option>
                : types.map((t: any) => <option key={t.key || t.type || t.label} value={t.key || t.type}>{t.label || t.key}</option>)}
            </select>
          </div>
          {isNational && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Region</label>
                <select className={input} value={f.region} onChange={(e) => setF({ ...f, region: e.target.value, district: '' })}>
                  <option value="">Seller's region</option>
                  {GHANA_REGIONS.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">District</label>
                <select className={input} value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} disabled={!regionObj}>
                  <option value="">{regionObj ? 'Select district' : 'Pick a region first'}</option>
                  {regionObj?.districts.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              </div>
            </div>
          )}
          {msg && <p className="text-sm text-rose-600">{msg}</p>}
          {ok && <p className="text-sm text-emerald-700">{ok}</p>}
          <button onClick={submit} disabled={busy} className="btn-primary text-sm py-2.5 px-6 disabled:opacity-50">{busy ? 'Creating…' : 'Create store & assign'}</button>
        </div>
        <p className="text-xs text-slate-400 mt-3">The seller will own the store immediately and can manage listings, logo, and payouts from their dashboard.</p>
      </div>
    </DashPage>
  );
}
