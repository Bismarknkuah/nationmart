'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authAPI, managementAPI, isLoggedIn } from '../../lib/api';
import { staffRoles, DEPARTMENTS, LEVEL_LABELS, formatRole } from '../../lib/roleConfig';
import { GHANA_REGIONS } from '../../lib/ghanaRegions';

const GOLD = '#C8A24B'; const GOLD_DK = '#9A7A2E';
const HR_ROLES = ['admin', 'ceo', 'coo', 'chro', 'national_hr_director'];
const ALL_ROLES = staffRoles();
const STAFF_DEPTS = Array.from(new Set(ALL_ROLES.map((r) => r.dept)));
const csvHint = 'fullName,email,role,region,district,department,assignedDuty';

function csvToRows(text: string): any[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const keys = lines[0].split(',').map((s) => s.trim());
  return lines.slice(1).map((line) => { const v = line.split(','); const o: any = {}; keys.forEach((k, i) => { o[k] = (v[i] || '').trim(); }); return o; });
}

export default function HRDashboard() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [q, setQ] = useState(''); const [deptFilter, setDeptFilter] = useState('all');

  // Add-staff form
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', dept: 'exec', role: '', region: '', district: '', assignedDuty: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bulkRows, setBulkRows] = useState<any[]>([]);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/hr'); return; }
    authAPI.me().then((r) => {
      const u = (r as any).user || r; setMe(u);
      setAllowed(HR_ROLES.includes(u.role));
    }).catch(() => router.push('/auth/login?redirect=/hr'));
  }, [router]);

  const load = () => { managementAPI.listStaff().then((r) => setStaff(r.staff || [])).catch(() => {}); };
  useEffect(() => { if (allowed) load(); }, [allowed]);

  const rolesForDept = useMemo(() => ALL_ROLES.filter((r) => r.dept === form.dept), [form.dept]);
  const selectedRole = ALL_ROLES.find((r) => r.role === form.role);
  const lvl = selectedRole?.level ?? 0;
  const needsRegion = lvl >= 3;
  const needsDistrict = lvl >= 4;
  const needsDuty = lvl === 2;
  const regionObj = GHANA_REGIONS.find((g) => g.name === form.region);

  const stats = useMemo(() => {
    const byDept: Record<string, number> = {};
    staff.forEach((s) => { const d = s.department || (ALL_ROLES.find((r) => r.role === s.role)?.dept) || 'other'; byDept[d] = (byDept[d] || 0) + 1; });
    return { total: staff.length, byDept };
  }, [staff]);

  const filtered = useMemo(() => staff.filter((s) => {
    if (deptFilter !== 'all') { const d = s.department || ALL_ROLES.find((r) => r.role === s.role)?.dept; if (d !== deptFilter) return false; }
    if (!q) return true;
    const hay = `${s.fullName} ${s.email} ${s.role} ${s.region} ${s.district} ${s.assignedDuty}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  }), [staff, q, deptFilter]);

  const submit = async () => {
    setMsg(null);
    if (!form.role) { setMsg({ ok: false, text: 'Choose a role.' }); return; }
    if (needsRegion && !form.region) { setMsg({ ok: false, text: 'This level requires a region.' }); return; }
    if (needsDistrict && !form.district) { setMsg({ ok: false, text: 'District officers need a specific district.' }); return; }
    if (needsDuty && !form.assignedDuty.trim()) { setMsg({ ok: false, text: 'National officers need a specific assigned task/duty.' }); return; }
    try {
      await managementAPI.createStaff({
        fullName: form.fullName, email: form.email, phone: form.phone, password: form.password || undefined,
        role: form.role, region: form.region, district: form.district, department: form.dept, assignedDuty: form.assignedDuty,
      });
      setMsg({ ok: true, text: `✓ ${form.fullName} added as ${formatRole(form.role)}.` });
      setForm({ fullName: '', email: '', phone: '', password: '', dept: form.dept, role: '', region: '', district: '', assignedDuty: '' });
      load();
    } catch (e: any) { setMsg({ ok: false, text: e.message || 'Failed' }); }
  };

  const runBulk = async () => {
    if (bulkRows.length === 0) { setMsg({ ok: false, text: 'Choose a CSV first.' }); return; }
    try { const r = await managementAPI.bulkStaff(bulkRows); setMsg({ ok: true, text: `✓ Created ${r.createdCount}${r.errorCount ? `, ${r.errorCount} error(s)` : ''}.` }); setBulkRows([]); load(); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  if (allowed === null) return <div className="pt-32 text-center text-slate-400">Loading…</div>;
  if (!allowed) return (
    <div className="pt-32 text-center">
      <p className="text-slate-600">The HR office is available to administrators and the national HR (CHRO).</p>
      <Link href="/dashboard" className="text-amber-700 font-semibold hover:underline">← Back to dashboard</Link>
    </div>
  );

  const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300';

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(120deg,#0f1228,#181a36 55%,#3b2a16)' }}>
        <div className="max-w-6xl mx-auto px-4 py-8 relative z-10">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: GOLD }}>Human Resources</p>
              <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>HR Office</h1>
              <p className="text-sm text-white/70 mt-1">Recruit, assign, and govern staff across the national, regional and district tiers.</p>
            </div>
            <Link href="/hr/workflows" className="text-sm font-semibold px-4 py-2 rounded-lg border mr-2" style={{ background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff' }}>🗓️ Leave &amp; Onboarding</Link>
            <Link href="/dashboard" className="text-sm font-semibold px-4 py-2 rounded-lg border" style={{ background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff' }}>← Dashboard</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
            <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.10)' }}>
              <p className="text-[11px] text-white/60">Total staff</p><p className="text-xl font-bold text-white">{stats.total}</p>
            </div>
            {Object.entries(stats.byDept).slice(0, 3).map(([d, n]) => (
              <div key={d} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.10)' }}>
                <p className="text-[11px] text-white/60 truncate">{DEPARTMENTS[d as keyof typeof DEPARTMENTS]?.label || d}</p>
                <p className="text-xl font-bold text-white">{n as number}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 -mt-4 grid lg:grid-cols-2 gap-6">
        {/* Add staff */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-bold text-slate-900 text-lg mb-1">Add a staff member</h2>
          <p className="text-sm text-slate-500 mb-4">Pick the office, role and posting. The form asks for exactly what the role's tier needs.</p>

          <div className="grid sm:grid-cols-2 gap-3">
            <input className={input} placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            <input className={input} type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className={input} placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className={input} placeholder="Temp password (optional)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>

          <label className="text-sm font-medium text-slate-700 block mt-3 mb-1">Office / department</label>
          <select className={input} value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value, role: '' })}>
            {STAFF_DEPTS.map((id) => <option key={id} value={id}>{DEPARTMENTS[id].label}</option>)}
          </select>

          <label className="text-sm font-medium text-slate-700 block mt-3 mb-1">Role</label>
          <select className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, region: '', district: '', assignedDuty: '' })}>
            <option value="">Select a role…</option>
            {rolesForDept.map((r) => <option key={r.role} value={r.role}>{r.label} · {LEVEL_LABELS[r.level] || `L${r.level}`}</option>)}
          </select>

          {selectedRole && (
            <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-3">
              <p className="text-xs text-slate-500">
                {needsDuty ? 'National officer — assign a specific task/duty.'
                  : needsDistrict ? 'District officer — assign a region and a specific district.'
                  : needsRegion ? 'Regional officer — assign a region.'
                  : 'Executive — no regional posting needed.'}
              </p>
              {needsRegion && (
                <div className="grid sm:grid-cols-2 gap-2">
                  <select className={input} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value, district: '' })}>
                    <option value="">Select region…</option>
                    {GHANA_REGIONS.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
                  </select>
                  {needsDistrict && (
                    <select className={input} value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} disabled={!regionObj}>
                      <option value="">{regionObj ? 'Select district…' : 'Pick a region first'}</option>
                      {regionObj?.districts.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                    </select>
                  )}
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Assigned duty / task {needsDuty && <span className="text-rose-500">*</span>}</label>
                <input className={input} placeholder="e.g. Lead Q3 cybersecurity audit; oversee regional onboarding…" value={form.assignedDuty} onChange={(e) => setForm({ ...form, assignedDuty: e.target.value })} />
              </div>
            </div>
          )}

          {msg && <p className="text-sm mt-3" style={{ color: msg.ok ? '#047857' : '#dc2626' }}>{msg.text}</p>}
          <button onClick={submit} className="mt-4 text-white font-semibold px-5 py-2.5 rounded-lg" style={{ background: GOLD_DK }}>Add staff</button>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="font-semibold text-slate-800 text-sm mb-1">Bulk add (CSV)</h3>
            <p className="text-xs text-slate-500 mb-2">Columns: <span className="font-mono">{csvHint}</span></p>
            <input type="file" accept=".csv,text/csv" className="text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { const rows = csvToRows(String(rd.result || '')); setBulkRows(rows); setMsg({ ok: true, text: `${rows.length} row(s) ready.` }); }; rd.readAsText(f); }} />
            <button onClick={runBulk} disabled={bulkRows.length === 0} className="ml-2 text-xs font-semibold text-white px-3 py-1.5 rounded-lg disabled:opacity-50" style={{ background: GOLD_DK }}>Upload {bulkRows.length || ''}</button>
          </div>
        </div>

        {/* Directory */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h2 className="font-bold text-slate-900 text-lg">Staff directory <span className="text-sm text-slate-400 font-normal">({filtered.length})</span></h2>
            <select className="border border-slate-300 rounded-lg px-2 py-1 text-sm" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
              <option value="all">All offices</option>
              {STAFF_DEPTS.map((id) => <option key={id} value={id}>{DEPARTMENTS[id].label}</option>)}
            </select>
          </div>
          <input className={input + ' mb-3'} placeholder="Search name, email, role, region, duty…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="space-y-2 max-h-[28rem] overflow-y-auto">
            {filtered.length === 0 ? <p className="text-slate-400 text-sm py-6 text-center">No staff match.</p>
              : filtered.map((s) => (
                <div key={s._id} className="border border-slate-200 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{s.fullName} <span className="text-xs font-normal text-slate-400">{s.email}</span></p>
                      <p className="text-xs text-slate-500">{formatRole(s.role)}{s.region ? ` · ${s.district || s.region}` : ''}</p>
                      {s.assignedDuty && <p className="text-xs text-amber-700 mt-0.5">📋 {s.assignedDuty}</p>}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${s.accountStatus === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{s.accountStatus}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
