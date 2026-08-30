'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authAPI, managementAPI, isLoggedIn } from '../../../lib/api';
import { DashPage, DashHeader, HeaderAction, DashBody, StatGrid, Stat, Panel, Empty } from '../../../components/ui/Dash';

const ALLOWED = /admin|ceo|coo|director|officer|manager|national|regional|district|region_admin/i;
const scopeLabel: Record<string, string> = { national: 'National', regional: 'Regional', district: 'District' };

export default function RegionalDashboard() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/admin/region'); return; }
    authAPI.me().then((r) => {
      const u = (r as any).user || r;
      const ok = ALLOWED.test(u.role || '');
      setAllowed(ok);
      if (ok) managementAPI.regionalOverview().then(setData).catch(() => {});
    }).catch(() => router.push('/auth/login'));
  }, [router]);

  if (allowed === null) return <div className="pt-32 text-center text-slate-400">Loading…</div>;
  if (!allowed) return <div className="pt-32 text-center"><p className="text-slate-600">Management access only.</p><Link href="/dashboard" className="text-indigo-700 font-semibold">← Dashboard</Link></div>;

  const money = (n: number) => `GHS ${Math.round(n || 0).toLocaleString()}`;
  const s = data?.stats;
  const area = data?.scope?.scope === 'district' ? data.scope.district
    : data?.scope?.scope === 'regional' ? data.scope.region : 'Nationwide';
  const breakdownTitle = data?.scope?.scope === 'national' ? 'By region' : data?.scope?.scope === 'regional' ? 'By district' : 'Your district';

  return (
    <DashPage>
      <DashHeader
        eyebrow={`${data?.scope?.scope ? (scopeLabel[data.scope.scope] || '') : ''} Administration`} icon="🗺️" accent="indigo"
        title="Jurisdiction Overview"
        subtitle={`Commerce health for ${area}`}
        actions={<>
          <HeaderAction href="/admin/create-store" primary>🏪 Create store</HeaderAction>
          <HeaderAction href="/logistics">🛵 Logistics</HeaderAction>
          <HeaderAction href="/dashboard">← Dashboard</HeaderAction>
        </>}
      />
      <DashBody>
        {!data ? <p className="text-slate-400 text-sm">Loading overview…</p> : (
          <>
            <StatGrid>
              <Stat label="Paid GMV" value={money(s.gmv)} tone="emerald" sub={`${s.orders} paid orders`} icon="💰" />
              <Stat label="Stores" value={(s.stores || 0).toLocaleString()} tone="indigo" icon="🏪" />
              <Stat label="Deliveries" value={(s.deliveries || 0).toLocaleString()} tone="slate" sub={`${s.delivered} delivered · ${s.failed} failed`} icon="📦" />
              <Stat label="Total users" value={(s.users || 0).toLocaleString()} tone="sky" icon="👥" />
            </StatGrid>
            <StatGrid>
              <Stat label="Buyers" value={(s.buyers || 0).toLocaleString()} tone="slate" />
              <Stat label="Sellers" value={(s.sellers || 0).toLocaleString()} tone="slate" />
              <Stat label="Riders & drivers" value={(s.riders || 0).toLocaleString()} tone="slate" />
              <Stat label="Failed deliveries" value={(s.failed || 0).toLocaleString()} tone={s.failed > 0 ? 'rose' : 'slate'} />
            </StatGrid>
            {Array.isArray(data.breakdown) && data.breakdown.length > 0 && (
              <Panel title={breakdownTitle}>
                <div className="space-y-2">
                  {data.breakdown.map((b: any) => (
                    <div key={b.area} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{b.area}</span>
                      <span className="text-slate-400">{b.users} users · {b.stores} stores</span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </>
        )}
      </DashBody>
    </DashPage>
  );
}


function Kpi({ label, value, tone, sub }: { label: string; value: any; tone: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}
