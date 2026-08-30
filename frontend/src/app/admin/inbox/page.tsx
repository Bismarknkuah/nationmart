'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { workflowAPI } from '../../../lib/api';

const TIER_STYLES: Record<string, { dot: string; chip: string; label: string }> = {
  critical: { dot: 'bg-red-500',     chip: 'bg-red-50 text-red-700 border-red-200',           label: 'Critical' },
  high:     { dot: 'bg-orange-500',  chip: 'bg-orange-50 text-orange-700 border-orange-200',  label: 'High' },
  medium:   { dot: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-700 border-amber-200',     label: 'Medium' },
  low:      { dot: 'bg-slate-400',   chip: 'bg-slate-50 text-slate-600 border-slate-200',     label: 'Low' },
};

function relativeTime(d: string | Date): string {
  const ms = new Date(d).getTime() - Date.now();
  const absMin = Math.abs(ms) / 60000;
  const absHrs = absMin / 60;
  const absDays = absHrs / 24;
  if (absDays >= 2) return ms < 0 ? `${Math.floor(absDays)}d overdue` : `in ${Math.floor(absDays)}d`;
  if (absHrs >= 1) return ms < 0 ? `${Math.floor(absHrs)}h overdue` : `in ${Math.floor(absHrs)}h`;
  return ms < 0 ? `${Math.floor(absMin)}m overdue` : `in ${Math.floor(absMin)}m`;
}

export default function InboxPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ total: 0, overdue: 0, critical: 0, high: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState<string | null>(null);    // instance id currently being decided
  const [expanded, setExpanded] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await workflowAPI.inbox();
      setItems(r.inbox || []);
      setSummary(r.summary || { total: 0, overdue: 0 });
    } catch (e: any) {
      setError(e.message || 'Failed to load inbox.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('wt_token') : null;
    if (!token) { router.replace('/auth/login?redirect=/admin/inbox'); return; }
    load();
  }, [router]);

  const decide = async (id: string, decision: 'approved' | 'rejected' | 'escalated') => {
    setActing(id);
    setError('');
    try {
      await workflowAPI.decide(id, { decision, comment: comment.trim() || undefined });
      setComment('');
      setExpanded(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Decision failed.');
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pt-8 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-700 to-blue-700 text-white rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-200 mb-1">Approvals</p>
              <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>My Inbox</h1>
              <p className="text-sm text-indigo-100 mt-1 max-w-2xl">
                Workflow items assigned to your role and jurisdiction, ranked by priority.
              </p>
            </div>
            <Link href="/admin/command-center" className="bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white text-sm font-semibold px-4 py-2 rounded-lg border border-white/20">
              Command Center &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-4 py-3">
              <p className="text-xs text-indigo-200 font-semibold uppercase tracking-wide">Total</p>
              <p className="text-2xl font-bold mt-1">{summary.total}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-4 py-3">
              <p className="text-xs text-indigo-200 font-semibold uppercase tracking-wide">Critical</p>
              <p className="text-2xl font-bold mt-1">{summary.critical || 0}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-4 py-3">
              <p className="text-xs text-indigo-200 font-semibold uppercase tracking-wide">High</p>
              <p className="text-2xl font-bold mt-1">{summary.high || 0}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-4 py-3">
              <p className="text-xs text-indigo-200 font-semibold uppercase tracking-wide">Overdue</p>
              <p className="text-2xl font-bold mt-1">{summary.overdue || 0}</p>
            </div>
          </div>
        </div>

        {/* Algorithm transparency note */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4 text-sm text-indigo-800">
          <p className="font-semibold">How is this ordered?</p>
          <p className="text-indigo-700/90 mt-1">
            Items are ranked by a transparent priority score (0–100) computed from SLA progress, prior reports against the entity, escalation status, entity value, and age. Click <b>Why this priority?</b> on any item to see the exact breakdown.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>
        )}

        {loading ? (
          <p className="text-slate-400 text-center py-16">Loading inbox…</p>
        ) : items.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <p className="text-slate-500 font-medium">Your inbox is clear.</p>
            <p className="text-slate-400 text-sm mt-2">
              No workflow items are currently assigned to your role and jurisdiction.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((it: any) => {
              const tier = TIER_STYLES[it.priority?.tier || 'low'];
              const isOpen = expanded === it._id;
              const isOverdue = it.currentDueAt && new Date(it.currentDueAt) < new Date();
              return (
                <div key={it._id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      {/* Tier indicator */}
                      <div className="flex flex-col items-center pt-1 shrink-0">
                        <span className={`w-3 h-3 rounded-full ${tier.dot}`} />
                        <span className="text-xs font-bold text-slate-400 mt-1">{it.priority?.score ?? 0}</span>
                      </div>

                      {/* Body */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] uppercase font-bold tracking-wide px-2 py-0.5 rounded border ${tier.chip}`}>
                            {tier.label}
                          </span>
                          <span className="text-xs text-slate-400 font-semibold">{it.definitionKey}</span>
                          {it.status === 'escalated' && (
                            <span className="text-[10px] uppercase font-bold tracking-wide px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                              Escalated
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-slate-900 mt-2">
                          {it.entityType} review — step {it.currentStepOrder}
                        </h3>
                        <p className="text-sm text-slate-500 mt-0.5">
                          Initiated by {it.initiatedBy?.fullName || 'system'}
                          {it.district ? ` · ${it.district}` : it.region ? ` · ${it.region}` : ''}
                          {' · '}
                          <span className={isOverdue ? 'text-red-600 font-semibold' : ''}>
                            {it.currentDueAt ? relativeTime(it.currentDueAt) : 'no SLA'}
                          </span>
                        </p>

                        {/* Reasons */}
                        {it.priority?.reasons?.length > 0 && (
                          <button
                            onClick={() => setExpanded(isOpen ? null : it._id)}
                            className="text-xs text-indigo-700 font-semibold mt-2 hover:underline"
                          >
                            {isOpen ? 'Hide breakdown' : 'Why this priority?'}
                          </button>
                        )}
                        {isOpen && (
                          <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-xs font-bold text-slate-600 uppercase mb-2">Priority breakdown</p>
                            <ul className="text-xs text-slate-700 space-y-1">
                              {it.priority?.reasons.length > 0
                                ? it.priority.reasons.map((r: string, i: number) => (
                                    <li key={i}>• {r}</li>
                                  ))
                                : <li className="text-slate-400">No risk signals; baseline priority only.</li>}
                            </ul>
                            <div className="grid grid-cols-5 gap-2 mt-3 text-center text-[10px] uppercase tracking-wide">
                              {(['sla', 'reports', 'escalation', 'value', 'age'] as const).map(k => (
                                <div key={k} className="bg-white border border-slate-200 rounded px-2 py-1.5">
                                  <p className="font-bold text-slate-700">{it.priority.breakdown[k]}</p>
                                  <p className="text-slate-400">{k}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Decision controls */}
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <textarea
                        value={expanded === it._id ? comment : ''}
                        onChange={(e) => { setExpanded(it._id); setComment(e.target.value); }}
                        onFocus={() => setExpanded(it._id)}
                        placeholder="Optional comment for the audit log…"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 mb-3"
                        rows={2}
                      />
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => decide(it._id, 'approved')}
                          disabled={acting === it._id}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                        >
                          {acting === it._id ? 'Working…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => decide(it._id, 'rejected')}
                          disabled={acting === it._id}
                          className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => decide(it._id, 'escalated')}
                          disabled={acting === it._id}
                          className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                        >
                          Escalate
                        </button>
                      </div>
                    </div>
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
