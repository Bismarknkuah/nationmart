'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authAPI, managementAPI, isLoggedIn } from '../../lib/api';
import { DashPage, DashHeader, HeaderAction, DashBody, StatGrid, Stat, Panel, Empty } from '../../components/ui/Dash';

const ALLOWED = /admin|ceo|coo|director|officer|manager|logistic|fleet|dispatch|national|regional|district/i;
const scopeLabel: Record<string, string> = { national: 'National', regional: 'Regional', district: 'District' };
const statusTone: Record<string, string> = {
  delivered: 'text-emerald-700', failed: 'text-rose-600', pending_assignment: 'text-amber-600',
  in_transit: 'text-indigo-600', picked_up: 'text-purple-600', accepted: 'text-blue-600', assigned: 'text-slate-600',
};

export default function LogisticsDashboard() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/logistics'); return; }
    authAPI.me().then((r) => {
      const u = (r as any).user || r;
      const ok = ALLOWED.test(u.role || '');
      setAllowed(ok);
      if (ok) managementAPI.jurisdictionLogistics().then(setData).catch(() => {});
    }).catch(() => router.push('/auth/login'));
  }, [router]);

  if (allowed === null) return <div className="pt-32 text-center text-slate-400">Loading…</div>;
  if (!allowed) return <div className="pt-32 text-center"><p className="text-slate-600">Logistics access only.</p><Link href="/dashboard" className="text-indigo-700 font-semibold">← Dashboard</Link></div>;

  const area = data?.scope?.scope === 'district' ? data.scope.district
    : data?.scope?.scope === 'regional' ? data.scope.region : 'Nationwide';

  return (
    <DashPage>
      <DashHeader
        eyebrow={`${data?.scope?.scope ? (scopeLabel[data.scope.scope] || '') : ''} Logistics`} icon="🛵" accent="emerald"
        title="Logistics Control"
        subtitle={`Fleet, deliveries and rider performance · ${area}`}
        actions={<>
          <HeaderAction href="/logistics/riders">Rider roster →</HeaderAction>
          <HeaderAction href="/dashboard">← Dashboard</HeaderAction>
        </>}
      />
      <DashBody>
        {!data ? <p className="text-slate-400 text-sm">Loading logistics data…</p> : (
          <>
            <StatGrid>
              <Stat label="Available riders" value={data.fleet.available} tone="emerald" sub={`${data.fleet.total} total in area`} icon="🟢" />
              <Stat label="Busy" value={data.fleet.busy} tone="amber" icon="🛵" />
              <Stat label="Active deliveries" value={data.activeDeliveries} tone="indigo" icon="📦" />
              <Stat label="Unassigned" value={data.unassigned} tone={data.unassigned > 0 ? 'rose' : 'slate'} sub="Need a rider" icon="⚠️" />
            </StatGrid>
            <StatGrid>
              <Stat label="Delivered (all-time)" value={data.deliveredTotal} tone="slate" />
              <Stat label="Failed" value={data.failed} tone={data.failed > 0 ? 'rose' : 'slate'} />
              <Stat label="Offline riders" value={data.fleet.offline} tone="slate" />
              <Stat label="Fleet size" value={data.fleet.total} tone="slate" />
            </StatGrid>
            <div className="grid md:grid-cols-2 gap-5">
              <Panel title="Top riders in area">
                {(!Array.isArray(data.topRiders) || data.topRiders.length === 0) ? <Empty>No completed deliveries yet.</Empty> : (
                  <div className="space-y-2">
                    {data.topRiders.map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700">{i + 1}. {r.name}</span>
                        <span className="text-slate-400">{r.jobs} jobs · ₵{(r.earnings || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
              <Panel title="Recent deliveries">
                {(!Array.isArray(data.recentDeliveries) || data.recentDeliveries.length === 0) ? <Empty>No deliveries in this area yet.</Empty> : (
                  <div className="space-y-2">
                    {data.recentDeliveries.map((d: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-mono text-slate-700">{d.tracking}</span>
                          <p className="text-[11px] text-slate-400">{d.route}{d.rider ? ` · ${d.rider}` : ''}</p>
                        </div>
                        <span className={`text-xs font-semibold capitalize ${statusTone[d.status] || 'text-slate-500'}`}>{d.status?.replace(/_/g, ' ')}</span>
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


