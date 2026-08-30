'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authAPI, workflowAPI, managementAPI, isLoggedIn } from '../../lib/api';
import { getRoleProfile, type RoleProfile } from '../../lib/roleConfig';
import { officeForRole, officeTagline, type OfficeSection } from '../../lib/officeConfig';
import { DashPage, DashHeader, DashBody, HeaderAction, StatGrid, Stat, Panel, Empty } from '../../components/ui/Dash';

/**
 * "My Office" — one workspace, every officer and executive role.
 *
 * Buyers/sellers/partners don't have an office; they're bounced to their own
 * dashboard. Everyone else gets: a live task inbox they can act on, their key
 * stats, and role-tailored action sections wired to real pages — so each role
 * has an obvious place to actually do their job.
 */
export default function OfficePage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [profile, setProfile] = useState<RoleProfile | null>(null);
  const [sections, setSections] = useState<OfficeSection[]>([]);
  const [inbox, setInbox] = useState<any[]>([]);
  const [summary, setSummary] = useState<{ total: number; overdue: number }>({ total: 0, overdue: 0 });
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/office'); return; }
    (async () => {
      try {
        const u = await authAPI.me();
        const user = u.user || u;
        const prof = getRoleProfile(user.role);

        // Only officers/executives have an office.
        if (prof.persona !== 'officer') { router.replace('/dashboard'); return; }

        setMe(user);
        setProfile(prof);
        setSections(officeForRole(prof.role, prof.department, prof.level));

        const [inb] = await Promise.allSettled([workflowAPI.inbox()]);
        if (inb.status === 'fulfilled') {
          setInbox((inb.value as any).inbox || []);
          setSummary((inb.value as any).summary || { total: 0, overdue: 0 });
        }

        // Level 1–4 admins get office stats where available.
        if (['super_admin', 'admin', 'region_admin', 'district_admin'].includes(prof.role) || prof.level <= 2) {
          managementAPI.officeStats().then(setStats).catch(() => {});
        }
      } catch {
        router.push('/auth/login?redirect=/office');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const decide = async (id: string, decision: 'approved' | 'rejected' | 'escalated') => {
    setActing(id); setErr('');
    try {
      await workflowAPI.decide(id, { decision });
      const r = await workflowAPI.inbox();
      setInbox(r.inbox || []);
      setSummary(r.summary || { total: 0, overdue: 0 });
    } catch (e: any) {
      setErr(e.message || 'Could not record that decision.');
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <DashPage>
        <div className="min-h-[50vh] flex items-center justify-center text-slate-400">Loading your office…</div>
      </DashPage>
    );
  }
  if (!me || !profile) return null;

  const jurisdiction = me.district || me.region || 'Ghana · National';
  const overdue = summary.overdue || 0;

  return (
    <DashPage>
      <DashHeader
        eyebrow={`${profile.levelLabel} · ${profile.department ?? 'Office'}`}
        title={`${profile.title} Office`}
        subtitle={officeTagline(profile.department)}
        icon={profile.theme?.glyph || '🏛️'}
        accent="indigo"
        actions={
          <>
            <HeaderAction href="/dashboard">← Dashboard</HeaderAction>
            <HeaderAction href="/admin/inbox" primary>Task Inbox{overdue > 0 ? ` · ${overdue} overdue` : ''}</HeaderAction>
          </>
        }
      />

      <DashBody>
        {/* Who am I + jurisdiction */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm text-slate-500">Signed in as</p>
            <p className="font-semibold text-slate-900">{me.fullName || me.full_name} · <span className="text-slate-500 font-normal">{profile.title}</span></p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Jurisdiction</p>
            <p className="font-semibold text-slate-900">{jurisdiction}</p>
          </div>
        </div>

        {/* Quick stats */}
        <StatGrid cols={4}>
          <Stat label="Open tasks" value={summary.total || 0} tone={summary.total > 0 ? 'indigo' : 'slate'} icon="📥" />
          <Stat label="Overdue" value={overdue} tone={overdue > 0 ? 'rose' : 'slate'} icon="⏰" />
          {stats?.logistics && <Stat label="Active deliveries" value={stats.logistics.active ?? 0} tone="amber" icon="🚚" />}
          {stats?.finance && <Stat label="Escrow held" value={`₵${Number(stats.finance.escrowHeld ?? 0).toLocaleString()}`} tone="emerald" icon="💰" />}
          {!stats && <Stat label="Your level" value={profile.levelLabel.split('·')[0].trim()} tone="slate" icon="🎖️" />}
          {!stats && <Stat label="Department" value={profile.theme?.label || '—'} tone="slate" icon={profile.theme?.glyph || '🏛️'} />}
        </StatGrid>

        {err && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{err}</div>}

        {/* Task inbox — act right here */}
        <div className="mt-6">
          <Panel
            title="Decisions waiting on you"
            action={<Link href="/admin/inbox" className="text-xs font-semibold text-indigo-700 hover:underline">Open full inbox →</Link>}
          >
            {inbox.length === 0 ? (
              <Empty>Nothing waiting. You’re all caught up. 🎉</Empty>
            ) : (
              <div className="space-y-2">
                {inbox.slice(0, 5).map((t: any) => {
                  const isOverdue = t.currentDueAt && new Date(t.currentDueAt) < new Date();
                  return (
                    <div key={t._id || t.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 text-sm">
                            {t.title || t.type || 'Task'}
                            {isOverdue && <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">Overdue</span>}
                            {t.priority?.tier === 'critical' && <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Critical</span>}
                          </p>
                          {t.summary && <p className="text-xs text-slate-500 mt-0.5">{t.summary}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button disabled={acting === (t._id || t.id)} onClick={() => decide(t._id || t.id, 'approved')}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-600 text-white disabled:opacity-50">Approve</button>
                          <button disabled={acting === (t._id || t.id)} onClick={() => decide(t._id || t.id, 'rejected')}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-300 text-slate-700 disabled:opacity-50">Reject</button>
                          <button disabled={acting === (t._id || t.id)} onClick={() => decide(t._id || t.id, 'escalated')}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-amber-300 text-amber-700 disabled:opacity-50">Escalate</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* Role-tailored action sections */}
        {sections.map((section) => (
          <div key={section.id} className="mt-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-3">{section.title}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {section.actions.map((a) => (
                <Link key={a.id} href={a.href}
                  className="group rounded-2xl border border-slate-200 bg-white p-4 hover:border-indigo-300 hover:shadow-md transition-all">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0">{a.glyph}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm group-hover:text-indigo-700 transition-colors">{a.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">{a.desc}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}

        {/* Capabilities reminder — what this role may and may not do */}
        {(profile.can.length > 0 || profile.cannot.length > 0) && (
          <div className="mt-6 grid sm:grid-cols-2 gap-4">
            {profile.can.length > 0 && (
              <Panel title="You can">
                <ul className="space-y-1.5">
                  {profile.can.map((c) => <li key={c} className="text-sm text-slate-600 flex items-start gap-2"><span className="text-emerald-500 mt-0.5">✓</span>{c}</li>)}
                </ul>
              </Panel>
            )}
            {profile.cannot.length > 0 && (
              <Panel title="Guardrails">
                <ul className="space-y-1.5">
                  {profile.cannot.map((c) => <li key={c} className="text-sm text-slate-500 flex items-start gap-2"><span className="text-rose-400 mt-0.5">✕</span>{c}</li>)}
                </ul>
              </Panel>
            )}
          </div>
        )}
      </DashBody>
    </DashPage>
  );
}
