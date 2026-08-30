'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authAPI, managementAPI, isLoggedIn } from '../../../lib/api';

const EXEC_ROLES = ['admin', 'ceo', 'coo', 'cto', 'cio', 'cfo', 'chro', 'national_compliance_director', 'national_security_director'];

export default function ExecutiveCenter() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'overview' | 'users' | 'enroll' | 'store'>('overview');

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/admin/control'); return; }
    authAPI.me().then((r) => {
      const u = (r as any).user || r;
      setAllowed(EXEC_ROLES.includes(u.role));
    }).catch(() => router.push('/auth/login?redirect=/admin/control'));
  }, [router]);

  if (allowed === null) return <div className="pt-32 text-center text-slate-400">Loading…</div>;
  if (!allowed) return <div className="pt-32 text-center"><p className="text-slate-600">Executive access only.</p><Link href="/dashboard" className="text-indigo-700 font-semibold hover:underline">← Dashboard</Link></div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="bg-gradient-to-br from-slate-900 to-indigo-900">
        <div className="max-w-5xl mx-auto px-4 py-8 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-indigo-300">Executive</p>
            <h1 className="text-3xl font-bold text-white">Control Center</h1>
            <p className="text-sm text-white/70 mt-1">Manage users, enroll buyers, create stores and curate store types.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/store-types" className="text-sm font-semibold px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white">🖼️ Store types &amp; pictures</Link>
            <Link href="/admin/security" className="text-sm font-semibold px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white">🛡️ Security log</Link>
            <Link href="/dashboard" className="text-sm font-semibold px-4 py-2 rounded-lg border border-white/25 text-white">← Dashboard</Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 mt-6">
        <div className="flex gap-2 mb-5">
          {([['overview', 'Overview'], ['users', 'Users'], ['enroll', 'Enroll a buyer'], ['store', 'Create a store']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`text-sm font-semibold px-4 py-2 rounded-lg ${tab === k ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{l}</button>
          ))}
        </div>
        {tab === 'overview' && <OverviewPanel />}
        {tab === 'users' && <UsersPanel />}
        {tab === 'enroll' && <EnrollPanel />}
        {tab === 'store' && <CreateStorePanel />}
      </div>
    </div>
  );
}

function OverviewPanel() {
  const [data, setData] = useState<{ stats: any; trend: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { managementAPI.platformStats().then(setData).catch(() => {}).finally(() => setLoading(false)); }, []);

  if (loading) return <p className="text-slate-400 text-sm">Loading platform overview…</p>;
  if (!data) return <p className="text-slate-400 text-sm">Could not load stats.</p>;
  const s = data.stats;
  const money = (n: number) => `GHS ${Math.round(n || 0).toLocaleString()}`;
  const maxRev = Math.max(1, ...data.trend.map((d) => d.revenue));

  const cards = [
    { label: 'Gross merchandise value', value: money(s.gmv), tone: 'text-emerald-700', sub: `${s.paidCount} paid orders` },
    { label: 'Total orders', value: (s.orders || 0).toLocaleString(), tone: 'text-indigo-700' },
    { label: 'Delivery fees (completed)', value: money(s.deliveryFees), tone: 'text-amber-700', sub: `${s.delivered}/${s.deliveries} delivered` },
    { label: 'Total users', value: (s.users || 0).toLocaleString(), tone: 'text-slate-800', sub: `+${s.newUsers} this week` },
    { label: 'Buyers', value: (s.buyers || 0).toLocaleString(), tone: 'text-slate-800' },
    { label: 'Sellers', value: (s.sellers || 0).toLocaleString(), tone: 'text-slate-800' },
    { label: 'Riders & drivers', value: (s.riders || 0).toLocaleString(), tone: 'text-slate-800' },
    { label: 'Stores · live products', value: `${(s.stores || 0).toLocaleString()} · ${(s.products || 0).toLocaleString()}`, tone: 'text-slate-800' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className={`text-xl font-bold ${c.tone}`}>{c.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
            {c.sub && <p className="text-[10px] text-slate-400 mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-900 text-sm mb-3">Last 7 days — orders &amp; revenue</h3>
        <div className="flex items-end justify-between gap-2 h-32">
          {data.trend.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-slate-400">{d.orders}</span>
              <div className="w-full rounded-t bg-indigo-500/80" style={{ height: `${Math.max(4, (d.revenue / maxRev) * 100)}px` }} title={`${money(d.revenue)} · ${d.orders} orders`} />
              <span className="text-[10px] text-slate-400">{d.label}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">Bar height = paid revenue · number above = orders that day.</p>
      </div>

      <MigratePanel />
    </div>
  );
}

function MigratePanel() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async () => {
    if (!confirm('Migrate all existing sellers and riders/drivers to the new yearly pricing (GHS 200 / 300 / 300)? This is safe to run more than once.')) return;
    setBusy(true); setMsg('');
    try { const r = await managementAPI.migrateSubscriptions(); setMsg(`✓ Updated ${r.sellersUpdated} sellers and ${r.partnersUpdated} riders/drivers to yearly pricing.`); }
    catch (e: any) { setMsg(e.message || 'Migration failed.'); } finally { setBusy(false); }
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <h3 className="font-bold text-slate-900 text-sm mb-1">Subscription migration</h3>
      <p className="text-xs text-slate-500 mb-3">Move existing accounts onto the new yearly plan (1 store ₵200, 2+ ₵300, riders/drivers ₵300). Buyers stay free.</p>
      <button onClick={run} disabled={busy} className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-800 text-white disabled:opacity-50">{busy ? 'Migrating…' : 'Run migration'}</button>
      {msg && <p className="text-sm text-indigo-700 mt-2">{msg}</p>}
    </div>
  );
}

function UsersPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    managementAPI.listUsers({ search: search.trim() || undefined, role: role || undefined })
      .then((r) => setUsers(r.users || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t); }, [search, role]);

  const del = async (u: any) => {
    if (!confirm(`Permanently delete ${u.fullName} (${u.role})? This cannot be undone.`)) return;
    try { await managementAPI.deleteUser(u._id); setMsg(`Deleted ${u.fullName}.`); load(); }
    catch (e: any) { setMsg(e.message || 'Could not delete (top executive accounts are protected).'); }
  };
  const moderate = async (u: any, action: 'suspend' | 'reactivate') => {
    try { await managementAPI.moderate(u._id, action); setMsg(`${action === 'suspend' ? 'Suspended' : 'Reactivated'} ${u.fullName}.`); load(); }
    catch (e: any) { setMsg(e.message || 'Action failed.'); }
  };

  const input = 'border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200';
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex gap-2 mb-4 flex-wrap">
        <input className={input + ' flex-1 min-w-[200px]'} placeholder="Search by name, email, phone, username…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={input} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          <option value="buyer">Buyers</option>
          <option value="seller">Sellers</option>
          <option value="rider">Riders</option>
          <option value="driver">Drivers</option>
        </select>
      </div>
      {msg && <p className="text-sm text-indigo-700 mb-3">{msg}</p>}
      {loading ? <p className="text-slate-400 text-sm">Loading users…</p> : (
        <div className="space-y-2">
          {users.length === 0 && <p className="text-slate-400 text-sm">No users match.</p>}
          {users.map((u) => (
            <div key={u._id} className="flex items-center justify-between gap-3 border border-slate-100 rounded-xl p-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm truncate">{u.fullName} <span className="text-xs text-slate-400 capitalize">· {u.role?.replace(/_/g, ' ')}</span></p>
                <p className="text-xs text-slate-500">{u.email} · {u.phone} · {u.district || u.region || '—'}
                  {u.accountStatus && u.accountStatus !== 'active' && <span className="text-amber-600 font-semibold"> · {u.accountStatus}</span>}</p>
              </div>
              <div className="flex gap-2">
                {u.accountStatus === 'suspended'
                  ? <button onClick={() => moderate(u, 'reactivate')} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700">Reactivate</button>
                  : <button onClick={() => moderate(u, 'suspend')} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700">Suspend</button>}
                <button onClick={() => del(u)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EnrollPanel() {
  const [f, setF] = useState({ fullName: '', email: '', phone: '', password: '', region: '', district: '', buyerType: 'buyer' });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const up = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200';
  const submit = async () => {
    if (!f.fullName || !f.email || !f.phone || !f.password) { setMsg('Name, email, phone and password are required.'); return; }
    setBusy(true); setMsg('');
    try { const r = await managementAPI.enrollBuyer(f); setMsg(`Enrolled ${r.buyer.fullName}.`); setF({ fullName: '', email: '', phone: '', password: '', region: '', district: '', buyerType: 'buyer' }); }
    catch (e: any) { setMsg(e.message || 'Could not enroll buyer.'); } finally { setBusy(false); }
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <h3 className="font-bold text-slate-900 mb-3">Enroll a buyer</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <input className={input} placeholder="Full name *" value={f.fullName} onChange={(e) => up('fullName', e.target.value)} />
        <select className={input} value={f.buyerType} onChange={(e) => up('buyerType', e.target.value)}>
          <option value="buyer">Individual buyer</option>
          <option value="business_buyer">Business buyer</option>
          <option value="corporate_buyer">Corporate buyer</option>
          <option value="government_buyer">Government buyer</option>
        </select>
        <input className={input} placeholder="Email *" value={f.email} onChange={(e) => up('email', e.target.value)} />
        <input className={input} placeholder="Phone *" value={f.phone} onChange={(e) => up('phone', e.target.value)} />
        <input className={input} placeholder="Temporary password *" value={f.password} onChange={(e) => up('password', e.target.value)} />
        <input className={input} placeholder="Region (optional)" value={f.region} onChange={(e) => up('region', e.target.value)} />
      </div>
      {msg && <p className="text-sm text-indigo-700 mt-3">{msg}</p>}
      <button onClick={submit} disabled={busy} className="btn-primary text-sm py-2 px-5 mt-4 disabled:opacity-50">{busy ? 'Enrolling…' : 'Enroll buyer'}</button>
    </div>
  );
}

function CreateStorePanel() {
  const [f, setF] = useState({ ownerEmail: '', name: '', type: 'general', region: '', district: '' });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const up = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200';
  const submit = async () => {
    if (!f.ownerEmail || !f.name) { setMsg('Owner email and store name are required.'); return; }
    setBusy(true); setMsg('');
    try { const r = await managementAPI.createStoreFor(f); setMsg(`Created “${r.store.name}” (code ${r.store.storeCode}).`); setF({ ownerEmail: '', name: '', type: 'general', region: '', district: '' }); }
    catch (e: any) { setMsg(e.message || 'Could not create store (owner must be a registered seller).'); } finally { setBusy(false); }
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <h3 className="font-bold text-slate-900 mb-1">Create a store for a seller</h3>
      <p className="text-sm text-slate-500 mb-3">The owner must already be a registered seller. Use the store-types page to manage available types.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <input className={input} placeholder="Owner's seller email *" value={f.ownerEmail} onChange={(e) => up('ownerEmail', e.target.value)} />
        <input className={input} placeholder="Store name *" value={f.name} onChange={(e) => up('name', e.target.value)} />
        <input className={input} placeholder="Type key (e.g. pharmacy, short_stay)" value={f.type} onChange={(e) => up('type', e.target.value)} />
        <input className={input} placeholder="Region (optional)" value={f.region} onChange={(e) => up('region', e.target.value)} />
        <input className={input} placeholder="District (optional)" value={f.district} onChange={(e) => up('district', e.target.value)} />
      </div>
      {msg && <p className="text-sm text-indigo-700 mt-3">{msg}</p>}
      <button onClick={submit} disabled={busy} className="btn-primary text-sm py-2 px-5 mt-4 disabled:opacity-50">{busy ? 'Creating…' : 'Create store'}</button>
    </div>
  );
}
