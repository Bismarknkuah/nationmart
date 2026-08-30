'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI, adsAPI, isLoggedIn } from '../../../lib/api';
import { getRoleProfile } from '../../../lib/roleConfig';
import { DashPage, DashHeader, DashBody, HeaderAction, StatGrid, Stat, Panel, Empty } from '../../../components/ui/Dash';

/**
 * Ad management — the platform-wide view of every campaign.
 *
 * Ad spend is platform revenue, so this doubles as an ad-revenue console:
 * total budgets committed, revenue earned (spent), reach (impressions), and
 * engagement (clicks) across all advertisers.
 */

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700', paused: 'bg-amber-50 text-amber-700',
  exhausted: 'bg-slate-100 text-slate-500', cancelled: 'bg-red-50 text-red-700',
};

export default function AdManagementPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/admin/ads'); return; }
    authAPI.me().then((u) => {
      const prof = getRoleProfile((u.user || u).role);
      if (prof.level > 4) { router.replace('/dashboard'); return; }
      setReady(true);
    }).catch(() => router.push('/auth/login?redirect=/admin/ads'));
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    adsAPI.adminOverview().then(setData).catch((e) => setErr(e.message));
  }, [ready]);

  const money = (n: number) => `₵${Number(n || 0).toLocaleString()}`;

  if (!ready) return <DashPage><div className="min-h-[50vh] flex items-center justify-center text-slate-400">Checking access…</div></DashPage>;

  const s = data?.summary;

  return (
    <DashPage>
      <DashHeader
        eyebrow="Growth"
        title="Ad Management"
        subtitle="Every campaign on the platform, and the ad revenue they generate."
        icon="📣"
        accent="violet"
        actions={<HeaderAction href="/office">← Office</HeaderAction>}
      />
      <DashBody>
        {err && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{err}</div>}
        {!data ? <div className="py-8 text-center text-slate-400 text-sm">Loading…</div> : (
          <>
            <StatGrid cols={4}>
              <Stat label="Campaigns" value={s.total} icon="📣" tone="violet" />
              <Stat label="Active now" value={s.active} icon="🟢" tone={s.active > 0 ? 'emerald' : 'slate'} />
              <Stat label="Ad revenue" value={money(s.revenue)} icon="💰" tone="indigo" />
              <Stat label="Impressions" value={Number(s.impressions).toLocaleString()} icon="👁️" tone="amber" />
            </StatGrid>

            <div className="mt-4">
              <Panel title="All campaigns">
                {data.campaigns.length === 0 ? <Empty>No campaigns yet.</Empty> : (
                  <div className="space-y-2">
                    {data.campaigns.map((a: any) => (
                      <div key={a.id} className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 text-sm">
                            {a.title}
                            <span className={`ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${STATUS_STYLE[a.status] || 'bg-slate-100'}`}>{a.status.replace('_', ' ')}</span>
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {a.advertiserName || 'Advertiser'} · {a.placement} · {a.impressions} views · {a.clicks} clicks{a.ctr > 0 ? ` · ${a.ctr}% CTR` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-slate-800 text-sm">{money(a.spent)}</p>
                          <p className="text-[11px] text-slate-400">of {money(a.budget)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </>
        )}
      </DashBody>
    </DashPage>
  );
}
