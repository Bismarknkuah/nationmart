'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authAPI, managementAPI, isLoggedIn } from '../../../lib/api';

const SECURITY_ROLES = [
  'admin', 'ceo', 'coo', 'cto', 'cio',
  'national_security_director', 'security_operations_officer', 'regional_security_officer',
  'cybersecurity_officer', 'security_analyst', 'national_compliance_director', 'compliance_officer',
];

export default function SecurityActivity() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [last24h, setLast24h] = useState(0);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/admin/security'); return; }
    authAPI.me().then((r) => {
      const u = (r as any).user || r;
      const ok = SECURITY_ROLES.includes(u.role);
      setAllowed(ok);
      if (ok) load(''); else setLoading(false);
    }).catch(() => router.push('/auth/login?redirect=/admin/security'));
  }, [router]);

  const load = (action: string) => {
    setLoading(true);
    managementAPI.activity({ action: action || undefined })
      .then((r) => { setLogs(r.logs || []); setLast24h(r.last24h || 0); setTotal(r.total || 0); })
      .catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { if (allowed) { const t = setTimeout(() => load(filter), 300); return () => clearTimeout(t); } }, [filter, allowed]);

  if (allowed === null) return <div className="pt-32 text-center text-slate-400">Loading…</div>;
  if (!allowed) return <div className="pt-32 text-center"><p className="text-slate-600">Security/compliance access only.</p><Link href="/dashboard" className="text-indigo-700 font-semibold hover:underline">← Dashboard</Link></div>;

  const RISKY = ['user.delete', 'user.suspend', 'login.fail'];
  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-8 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-emerald-300">Cybersecurity &amp; Trust</p>
            <h1 className="text-3xl font-bold text-white">System Activity Monitor</h1>
            <p className="text-sm text-white/70 mt-1">Every administrative action across the platform, newest first.</p>
          </div>
          <Link href="/dashboard" className="text-sm font-semibold px-4 py-2 rounded-lg border border-white/25 text-white">← Dashboard</Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 mt-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat label="Actions (last 24h)" value={last24h} />
          <Stat label="Total logged actions" value={total} />
          <Stat label="Showing" value={logs.length} />
        </div>

        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by action (e.g. user.delete, store, login)…"
          className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />

        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {loading ? <p className="p-5 text-slate-400 text-sm">Loading activity…</p> : logs.length === 0 ? (
            <p className="p-5 text-slate-400 text-sm">No activity logged yet. Administrative actions (deletes, suspensions, store changes) will appear here.</p>
          ) : logs.map((l) => (
            <div key={l._id} className="p-3.5 flex items-start gap-3">
              <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${RISKY.includes(l.action) ? 'bg-rose-500' : 'bg-slate-300'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800">{l.summary || l.action}</p>
                <p className="text-xs text-slate-400">
                  <span className="font-mono">{l.action}</span>
                  {l.actor?.fullName ? ` · by ${l.actor.fullName} (${l.actorRole || l.actor.role})` : ''}
                  {l.ipAddress ? ` · ${l.ipAddress}` : ''}
                  {' · '}{new Date(l.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400">This is an append-only audit trail. Rows with a red dot are sensitive actions (deletions, suspensions).</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
