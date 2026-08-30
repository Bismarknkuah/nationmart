'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminAPI } from '../../../lib/api';

const LEVEL_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'L1 — Executive',          color: 'bg-rose-100 text-rose-800 border-rose-200' },
  2: { label: 'L2 — National',           color: 'bg-amber-100 text-amber-800 border-amber-200' },
  3: { label: 'L3 — Regional',           color: 'bg-blue-100 text-blue-800 border-blue-200' },
  4: { label: 'L4 — District',           color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  5: { label: 'L5 — Field / Store',      color: 'bg-slate-100 text-slate-700 border-slate-200' },
};

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CommandCenterPage() {
  const router = useRouter();
  const [officers, setOfficers] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('wt_token') : null;
    if (!token) { router.replace('/auth/login?redirect=/admin/command-center'); return; }

    (async () => {
      try {
        const [o, a] = await Promise.all([
          adminAPI.officers({ level: level || undefined, search: search || undefined }).catch(() => ({ officers: [], totalRoles: 0 })),
          adminAPI.auditLog({ limit: 30 }).catch(() => ({ entries: [], total: 0, page: 1, limit: 30 })),
        ]);
        setOfficers((o as any).officers || []);
        setAudit((a as any).entries || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load command center.');
      } finally {
        setLoading(false);
      }
    })();
  }, [level, search, router]);

  // Group officers by access level for display
  const grouped: Record<number, any[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  officers.forEach((o) => {
    const lvl = o.accessLevel || 5;
    grouped[lvl] = grouped[lvl] || [];
    grouped[lvl].push(o);
  });

  return (
    <div className="min-h-screen bg-slate-50 pt-8 pb-16 px-4">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-700 to-blue-700 text-white rounded-2xl p-6 mb-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-200 mb-1">Administration</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>National Command Center</h1>
          <p className="text-sm text-indigo-100 mt-1 max-w-2xl">
            Full administrative hierarchy and audit trail. Every officer&apos;s action is logged here for compliance and accountability.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="flex-1 min-w-[200px] border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value ? Number(e.target.value) : '')}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">All access levels</option>
            {[1, 2, 3, 4, 5].map((l) => (
              <option key={l} value={l}>{LEVEL_LABELS[l].label}</option>
            ))}
          </select>
          <Link href="/admin" className="text-sm font-semibold text-indigo-700 hover:underline ml-auto">
            &larr; Back to Admin
          </Link>
        </div>

        {loading ? (
          <p className="text-center text-slate-400 py-20">Loading command center…</p>
        ) : (
          <div className="grid lg:grid-cols-3 gap-5">

            {/* Officer hierarchy */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="font-bold text-slate-900 text-lg mb-1">Officer hierarchy</h2>
              <p className="text-sm text-slate-500 mb-5">{officers.length} officer{officers.length === 1 ? '' : 's'} across {Object.values(grouped).filter(arr => arr.length > 0).length} access level{Object.values(grouped).filter(arr => arr.length > 0).length === 1 ? '' : 's'}.</p>

              {officers.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">
                  No officers match these filters. Run <code className="bg-slate-100 px-1 rounded">npm run seed</code> to create demo officers.
                </div>
              ) : (
                [1, 2, 3, 4, 5].map((lvl) => grouped[lvl] && grouped[lvl].length > 0 && (
                  <div key={lvl} className="mb-6 last:mb-0">
                    <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold border ${LEVEL_LABELS[lvl].color} mb-3`}>
                      {LEVEL_LABELS[lvl].label}
                    </div>
                    <div className="space-y-2">
                      {grouped[lvl].map((o) => (
                        <div key={o._id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 hover:border-indigo-200 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-sm font-bold shrink-0">
                              {o.fullName?.[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 text-sm truncate">{o.fullName}</p>
                              <p className="text-xs text-slate-500 truncate">{formatRole(o.role)}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-slate-500">{o.region || 'National'}{o.district ? ` · ${o.district}` : ''}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {o.lastLogin ? `Last seen ${new Date(o.lastLogin).toLocaleDateString()}` : 'Never signed in'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Audit log */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="font-bold text-slate-900 text-lg mb-1">Recent activity</h2>
              <p className="text-sm text-slate-500 mb-5">Last 30 administrative actions recorded.</p>

              {audit.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">
                  No audit entries yet — officers&apos; future actions will appear here.
                </div>
              ) : (
                <div className="space-y-3">
                  {audit.map((e) => (
                    <div key={e._id} className="border-l-2 border-indigo-200 pl-3">
                      <p className="text-sm font-semibold text-slate-800">{e.summary}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {e.actor?.fullName || 'Unknown'} · <span className="capitalize">{(e.actorRole || '').replace(/_/g, ' ')}</span>
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(e.createdAt).toLocaleString()} · <code className="bg-slate-100 px-1 rounded">{e.action}</code>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
