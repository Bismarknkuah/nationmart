'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authAPI, deliveryAPI, isLoggedIn } from '../../../lib/api';

const LOGISTICS_ROLES = [
  'admin', 'ceo', 'coo', 'national_logistics_director', 'national_operations_director',
  'logistics_officer', 'logistics_inspector', 'region_admin', 'regional_operations_manager',
  'regional_logistics_officer', 'district_admin', 'district_logistics_officer',
  'fleet_manager', 'logistics_company',
];

const STATUS_META: Record<string, { label: string; dot: string; chip: string }> = {
  available: { label: 'Available (online)', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  busy:      { label: 'Busy', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  offline:   { label: 'Offline', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-500 border-slate-200' },
};

type Rider = {
  _id: string; fullName: string; phone: string; email: string; role: string;
  region?: string; district?: string; partnerCode?: string; vehicleLicense?: string;
  dutyStatus?: 'available' | 'busy' | 'offline'; activeJobs?: number; isApproved?: boolean;
};

export default function LogisticsRiders() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [counts, setCounts] = useState({ available: 0, busy: 0, offline: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'' | 'available' | 'busy' | 'offline'>('');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/logistics/riders'); return; }
    authAPI.me().then((r) => {
      const u = (r as any).user || r;
      const ok = LOGISTICS_ROLES.includes(u.role);
      setAllowed(ok);
      if (ok) load();
      else setLoading(false);
    }).catch(() => router.push('/auth/login?redirect=/logistics/riders'));
  }, [router]);

  const load = () => {
    setLoading(true);
    deliveryAPI.riders().then((r) => {
      setRiders(r.riders || []);
      setCounts(r.counts || { available: 0, busy: 0, offline: 0, total: 0 });
    }).catch(() => {}).finally(() => setLoading(false));
  };

  const setDuty = async (id: string, status: 'available' | 'busy' | 'offline') => {
    try { await deliveryAPI.setRiderDuty(id, status); load(); } catch { /* */ }
  };

  if (allowed === null || loading) return <div className="pt-32 text-center text-slate-400">Loading riders…</div>;
  if (!allowed) {
    return (
      <div className="pt-32 text-center">
        <p className="text-slate-600">This area is for logistics officers.</p>
        <Link href="/dashboard" className="text-indigo-700 font-semibold hover:underline">← Back to dashboard</Link>
      </div>
    );
  }

  const shown = filter ? riders.filter((r) => (r.dutyStatus || 'offline') === filter) : riders;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-8 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-indigo-300">Logistics</p>
            <h1 className="text-3xl font-bold text-white">Riders &amp; Drivers</h1>
            <p className="text-sm text-white/70 mt-1">See who’s available, busy or offline — and register new riders.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm((s) => !s)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg text-sm">
              {showForm ? 'Close' : '+ Register a rider'}
            </button>
            <Link href="/dashboard" className="text-sm font-semibold px-4 py-2 rounded-lg border border-white/25 text-white">← Dashboard</Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 mt-6 space-y-5">
        {showForm && <RegisterForm onDone={() => { setShowForm(false); load(); }} />}

        {/* Status summary / filters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            ['', 'All', counts.total, 'bg-slate-800'],
            ['available', 'Available', counts.available, 'bg-emerald-600'],
            ['busy', 'Busy', counts.busy, 'bg-amber-600'],
            ['offline', 'Offline', counts.offline, 'bg-slate-500'],
          ] as const).map(([key, label, n, color]) => (
            <button key={key} onClick={() => setFilter(key as any)}
              className={`rounded-2xl border p-4 text-left transition-all ${filter === key ? 'border-indigo-400 ring-2 ring-indigo-100 bg-white' : 'border-slate-200 bg-white hover:border-indigo-200'}`}>
              <div className={`w-8 h-8 rounded-lg ${color} text-white flex items-center justify-center font-bold text-sm mb-2`}>{n}</div>
              <p className="text-sm font-semibold text-slate-700">{label}</p>
            </button>
          ))}
        </div>

        {/* Roster */}
        {shown.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">No riders in this view yet.</div>
        ) : (
          <div className="space-y-3">
            {shown.map((r) => {
              const meta = STATUS_META[r.dutyStatus || 'offline'];
              return (
                <div key={r._id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3 min-w-[220px] flex-1">
                    <span className={`mt-1.5 w-2.5 h-2.5 rounded-full ${meta.dot} shrink-0`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">{r.fullName} <span className="text-xs text-slate-400 capitalize">· {r.role}</span></p>
                      <p className="text-xs text-slate-500">{r.district || r.region || 'Ghana'} · {r.phone}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {r.partnerCode && <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">{r.partnerCode}</span>}
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.chip}`}>{meta.label}</span>
                        {!!r.activeJobs && <span className="text-[11px] text-slate-500">{r.activeJobs} active job{r.activeJobs > 1 ? 's' : ''}</span>}
                        {r.isApproved === false && <span className="text-[11px] text-amber-600 font-semibold">Pending approval</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <a href={`tel:${r.phone}`} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white">📞 Call</a>
                    <a href={`sms:${r.phone}`} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">💬 Text</a>
                    <select value={r.dutyStatus || 'offline'} onChange={(e) => setDuty(r._id, e.target.value as any)}
                      className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
                      <option value="available">Set available</option>
                      <option value="busy">Set busy</option>
                      <option value="offline">Set offline</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RegisterForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ fullName: '', email: '', phone: '', password: '', role: 'rider', region: '', district: '', vehicleLicense: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const up = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200';

  const submit = async () => {
    setErr(''); setOk('');
    if (!f.fullName || !f.email || !f.phone || !f.password) { setErr('Name, email, phone and password are required.'); return; }
    setBusy(true);
    try {
      const r = await deliveryAPI.registerRider(f);
      setOk(`Registered ${r.rider.fullName} · code ${r.rider.partnerCode}`);
      setF({ fullName: '', email: '', phone: '', password: '', role: 'rider', region: '', district: '', vehicleLicense: '' });
      setTimeout(onDone, 900);
    } catch (e: any) { setErr(e.message || 'Could not register rider.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="font-bold text-slate-900 text-lg mb-4">Register a new rider / driver</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <input className={input} placeholder="Full name *" value={f.fullName} onChange={(e) => up('fullName', e.target.value)} />
        <select className={input} value={f.role} onChange={(e) => up('role', e.target.value)}>
          <option value="rider">Rider (motorbike)</option>
          <option value="driver">Driver (car/van)</option>
        </select>
        <input className={input} placeholder="Email *" type="email" value={f.email} onChange={(e) => up('email', e.target.value)} />
        <input className={input} placeholder="Phone *" value={f.phone} onChange={(e) => up('phone', e.target.value)} />
        <input className={input} placeholder="Temporary password *" value={f.password} onChange={(e) => up('password', e.target.value)} />
        <input className={input} placeholder="Vehicle licence / plate (e.g. GR-4471-X)" value={f.vehicleLicense} onChange={(e) => up('vehicleLicense', e.target.value.toUpperCase())} />
        <input className={input} placeholder="Region (optional)" value={f.region} onChange={(e) => up('region', e.target.value)} />
        <input className={input} placeholder="District (optional)" value={f.district} onChange={(e) => up('district', e.target.value)} />
      </div>
      {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
      {ok && <p className="text-sm text-emerald-700 mt-3">{ok}</p>}
      <button onClick={submit} disabled={busy} className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm disabled:opacity-50">
        {busy ? 'Registering…' : 'Register rider'}
      </button>
    </div>
  );
}
