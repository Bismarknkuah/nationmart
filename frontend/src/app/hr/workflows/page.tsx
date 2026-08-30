'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authAPI, hrAPI, isLoggedIn } from '../../../lib/api';
import { DashPage, DashHeader, HeaderAction } from '../../../components/ui/Dash';

const HR_ROLES_RX = /admin|ceo|coo|chro|hr|human/i;
const LEAVE_TYPES = ['annual', 'sick', 'maternity', 'paternity', 'bereavement', 'unpaid', 'other'];
const fmt = (d: string) => new Date(d).toLocaleDateString();
const badge: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700', approved: 'bg-emerald-50 text-emerald-700',
  declined: 'bg-rose-50 text-rose-700', cancelled: 'bg-slate-100 text-slate-500',
};

export default function HRWorkflows() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [tab, setTab] = useState<'mine' | 'approvals' | 'onboarding'>('mine');

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/hr/workflows'); return; }
    authAPI.me().then((r) => { const u = (r as any).user || r; setMe(u); }).catch(() => router.push('/auth/login'));
  }, [router]);

  if (!me) return <div className="pt-32 text-center text-slate-400">Loading…</div>;
  const isHR = HR_ROLES_RX.test(me.role || '');

  return (
    <DashPage>
      <DashHeader
        eyebrow="Human Resources" icon="🗓️" accent="indigo"
        title="Leave & Onboarding"
        subtitle="Request leave, approve requests, and track new-staff onboarding."
        actions={<HeaderAction href="/dashboard">← Dashboard</HeaderAction>}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-5 relative z-10 pb-16">
        <div className="flex gap-2 mb-5 flex-wrap">
          <TabBtn k="mine" cur={tab} set={setTab}>My leave</TabBtn>
          {isHR && <TabBtn k="approvals" cur={tab} set={setTab}>Leave approvals</TabBtn>}
          {isHR && <TabBtn k="onboarding" cur={tab} set={setTab}>Onboarding</TabBtn>}
        </div>
        {tab === 'mine' && <MyLeave />}
        {tab === 'approvals' && isHR && <Approvals />}
        {tab === 'onboarding' && isHR && <OnboardingPanel />}
      </div>
    </DashPage>
  );
}

function TabBtn({ k, cur, set, children }: any) {
  return <button onClick={() => set(k)} className={`text-sm font-semibold px-4 py-2 rounded-lg ${cur === k ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{children}</button>;
}

const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200';

function MyLeave() {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [f, setF] = useState({ type: 'annual', startDate: '', endDate: '', reason: '' });
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const load = () => hrAPI.myLeave().then((r) => setLeaves(r.leaves || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  const submit = async () => {
    if (!f.startDate || !f.endDate) { setMsg('Pick start and end dates.'); return; }
    setBusy(true); setMsg('');
    try { await hrAPI.submitLeave(f); setF({ type: 'annual', startDate: '', endDate: '', reason: '' }); setMsg('Request submitted.'); load(); }
    catch (e: any) { setMsg(e.message || 'Could not submit.'); } finally { setBusy(false); }
  };
  const cancel = async (id: string) => { try { await hrAPI.cancelLeave(id); load(); } catch { /* */ } };
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-900 mb-3">Request leave</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <select className={input} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {LEAVE_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
          <div />
          <div><label className="text-xs text-slate-500">Start date</label><input type="date" className={input} value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></div>
          <div><label className="text-xs text-slate-500">End date</label><input type="date" className={input} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></div>
        </div>
        <textarea className={input + ' mt-3'} rows={2} placeholder="Reason (optional)" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        {msg && <p className="text-sm text-indigo-700 mt-2">{msg}</p>}
        <button onClick={submit} disabled={busy} className="btn-primary text-sm py-2 px-5 mt-3 disabled:opacity-50">{busy ? 'Submitting…' : 'Submit request'}</button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-900 mb-3">My requests</h3>
        {leaves.length === 0 ? <p className="text-sm text-slate-400">No requests yet.</p> : (
          <div className="space-y-2">
            {leaves.map((l) => (
              <div key={l._id} className="flex items-center justify-between border border-slate-100 rounded-xl p-3 text-sm flex-wrap gap-2">
                <div>
                  <span className="capitalize font-semibold text-slate-800">{l.type}</span>
                  <span className="text-slate-500"> · {fmt(l.startDate)} → {fmt(l.endDate)} · {l.days} day{l.days > 1 ? 's' : ''}</span>
                  {l.decisionNote && <p className="text-xs text-slate-400">Note: {l.decisionNote}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${badge[l.status]}`}>{l.status}</span>
                  {l.status === 'pending' && <button onClick={() => cancel(l._id)} className="text-xs text-slate-400 hover:text-rose-600">Cancel</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Approvals() {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [filter, setFilter] = useState('pending');
  const load = () => hrAPI.listLeave(filter || undefined).then((r) => setLeaves(r.leaves || [])).catch(() => {});
  useEffect(() => { load(); }, [filter]);
  const decide = async (id: string, decision: 'approved' | 'declined') => {
    const note = decision === 'declined' ? (prompt('Reason for declining (optional):') || '') : '';
    try { await hrAPI.decideLeave(id, decision, note); load(); } catch { /* */ }
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-900">Leave approvals</h3>
        <select className="border border-slate-300 rounded-lg px-2 py-1 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="pending">Pending</option><option value="approved">Approved</option><option value="declined">Declined</option><option value="">All</option>
        </select>
      </div>
      {leaves.length === 0 ? <p className="text-sm text-slate-400">Nothing here.</p> : (
        <div className="space-y-2">
          {leaves.map((l) => (
            <div key={l._id} className="border border-slate-100 rounded-xl p-3 text-sm">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="font-semibold text-slate-800">{l.staff?.fullName || 'Staff'}</span>
                  <span className="text-slate-400 capitalize"> · {l.staff?.role?.replace(/_/g, ' ')}</span>
                  <p className="text-slate-500 capitalize">{l.type} · {fmt(l.startDate)} → {fmt(l.endDate)} · {l.days} day{l.days > 1 ? 's' : ''}</p>
                  {l.reason && <p className="text-xs text-slate-400">“{l.reason}”</p>}
                </div>
                {l.status === 'pending' ? (
                  <div className="flex gap-2">
                    <button onClick={() => decide(l._id, 'approved')} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white">Approve</button>
                    <button onClick={() => decide(l._id, 'declined')} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700">Decline</button>
                  </div>
                ) : <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${badge[l.status]}`}>{l.status}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OnboardingPanel() {
  const [records, setRecords] = useState<any[]>([]);
  const [email, setEmail] = useState(''); const [msg, setMsg] = useState('');
  const load = () => hrAPI.listOnboarding().then((r) => setRecords(r.records || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  const start = async () => {
    if (!email.trim()) { setMsg('Enter the staff email.'); return; }
    try { await hrAPI.startOnboarding({ email: email.trim() }); setEmail(''); setMsg('Checklist started.'); load(); }
    catch (e: any) { setMsg(e.message || 'Could not start (staff must exist).'); }
  };
  const toggle = async (rec: any, idx: number, done: boolean) => {
    try { const r = await hrAPI.toggleTask(rec._id, idx, done); setRecords((prev) => prev.map((x) => x._id === rec._id ? r.record : x)); } catch { /* */ }
  };
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-900 mb-2">Start an onboarding checklist</h3>
        <div className="flex gap-2 flex-wrap">
          <input className={input + ' flex-1 min-w-[220px]'} placeholder="New staff email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button onClick={start} className="btn-primary text-sm py-2 px-5">Start checklist</button>
        </div>
        {msg && <p className="text-sm text-indigo-700 mt-2">{msg}</p>}
      </div>

      {records.length === 0 ? <p className="text-sm text-slate-400">No onboarding records yet.</p> : records.map((rec) => {
        const doneCount = rec.tasks.filter((t: any) => t.done).length;
        return (
          <div key={rec._id} className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-semibold text-slate-800">{rec.staff?.fullName || 'Staff'} <span className="text-xs text-slate-400 capitalize">· {rec.staff?.role?.replace(/_/g, ' ')}</span></p>
                <p className="text-xs text-slate-400">{doneCount}/{rec.tasks.length} complete {rec.completed && '· ✅ Fully onboarded'}</p>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 mb-3 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${(doneCount / rec.tasks.length) * 100}%` }} /></div>
            <div className="space-y-1.5">
              {rec.tasks.map((t: any, i: number) => (
                <label key={i} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={t.done} onChange={(e) => toggle(rec, i, e.target.checked)} />
                  <span className={t.done ? 'text-slate-400 line-through' : 'text-slate-700'}>{t.label}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
