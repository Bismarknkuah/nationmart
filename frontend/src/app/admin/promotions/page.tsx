'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI, promosAdminAPI, isLoggedIn } from '../../../lib/api';
import { getRoleProfile } from '../../../lib/roleConfig';
import { DashPage, DashHeader, DashBody, HeaderAction, StatGrid, Stat, Panel, Empty } from '../../../components/ui/Dash';

/**
 * Promotions & discounts — the platform campaign console.
 *
 * Execs/admins run platform-wide promo codes here (store_id null), see how much
 * of each is used, and pause or resume them. The redemption maths and the
 * "can't exceed max_uses" guarantee live in the database, so this is a safe,
 * thin management layer over logic that's already proven.
 */

export default function PromotionsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [promos, setPromos] = useState<any[]>([]);
  const [summary, setSummary] = useState({ total: 0, live: 0, redemptions: 0 });
  const [scope, setScope] = useState<'platform' | 'all'>('platform');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/admin/promotions'); return; }
    authAPI.me().then((u) => {
      const prof = getRoleProfile((u.user || u).role);
      if (prof.level > 4) { router.replace('/dashboard'); return; }
      setReady(true);
    }).catch(() => router.push('/auth/login?redirect=/admin/promotions'));
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await promosAdminAPI.overview(scope);
      setPromos(r.promos || []);
      setSummary(r.summary || { total: 0, live: 0, redemptions: 0 });
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [scope]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  async function toggle(code: string, active: boolean) {
    setErr('');
    try { await promosAdminAPI.setActive(code, active); flash(active ? 'Resumed.' : 'Paused.'); load(); }
    catch (e: any) { setErr(e.message); }
  }

  if (!ready) return <DashPage><div className="min-h-[50vh] flex items-center justify-center text-slate-400">Checking access…</div></DashPage>;

  return (
    <DashPage>
      <DashHeader
        eyebrow="Growth"
        title="Promotions & Discounts"
        subtitle="Run platform-wide promo codes, track redemptions, and pause campaigns."
        icon="🏷️"
        accent="violet"
        actions={
          <>
            <HeaderAction href="/office">← Office</HeaderAction>
            <HeaderAction onClick={() => setShowCreate(true)} primary>+ New campaign</HeaderAction>
          </>
        }
      />

      <DashBody>
        <StatGrid cols={3}>
          <Stat label="Campaigns" value={summary.total} icon="🏷️" tone="violet" />
          <Stat label="Live now" value={summary.live} icon="🟢" tone={summary.live > 0 ? 'emerald' : 'slate'} />
          <Stat label="Total redemptions" value={summary.redemptions} icon="🎟️" tone="indigo" />
        </StatGrid>

        {err && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{err}</div>}
        {msg && <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">{msg}</div>}

        <div className="mt-5 flex items-center gap-2 text-sm">
          <button onClick={() => setScope('platform')}
            className={`px-3 py-1.5 rounded-lg border ${scope === 'platform' ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200'}`}>Platform campaigns</button>
          <button onClick={() => setScope('all')}
            className={`px-3 py-1.5 rounded-lg border ${scope === 'all' ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200'}`}>All (incl. seller codes)</button>
        </div>

        <div className="mt-4">
          <Panel title="Promo codes">
            {loading ? (
              <div className="py-8 text-center text-slate-400 text-sm">Loading…</div>
            ) : promos.length === 0 ? (
              <Empty>No promo codes yet. Create your first campaign.</Empty>
            ) : (
              <div className="space-y-2">
                {promos.map((p) => (
                  <div key={p.code} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-slate-900 text-sm">
                          {p.code}
                          <span className={`ml-2 text-[10px] font-sans font-bold uppercase px-1.5 py-0.5 rounded ${p.isLive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                            {p.isLive ? 'Live' : p.active ? 'Scheduled/ended' : 'Paused'}
                          </span>
                          <span className="ml-2 text-[10px] font-sans px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">{p.scope}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {p.discount} off{p.minOrder > 0 ? ` · min ₵${p.minOrder}` : ''}
                          {p.storeName ? ` · ${p.storeName}` : ''}
                          {p.expiresAt ? ` · ends ${new Date(p.expiresAt).toLocaleDateString()}` : ''}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {p.usedCount} used{p.maxUses ? ` of ${p.maxUses}` : ''}
                          {p.usagePercent != null ? ` (${p.usagePercent}%)` : ''}
                        </p>
                      </div>
                      <button onClick={() => toggle(p.code, !p.active)}
                        className={`text-xs px-2.5 py-1 rounded-lg border shrink-0 ${p.active ? 'border-amber-200 text-amber-700 hover:bg-amber-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}>
                        {p.active ? 'Pause' : 'Resume'}
                      </button>
                    </div>
                    {p.maxUses != null && (
                      <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-violet-500" style={{ width: `${Math.min(100, p.usagePercent || 0)}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </DashBody>

      {showCreate && (
        <CreateCampaignModal onClose={() => setShowCreate(false)}
          onCreated={(m) => { setShowCreate(false); flash(m); setScope('platform'); load(); }} />
      )}
    </DashPage>
  );
}

function CreateCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: (m: string) => void }) {
  const [f, setF] = useState({ code: '', kind: 'percent' as 'percent' | 'amount', value: '', minOrder: '', maxUses: '', expiresAt: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit() {
    setBusy(true); setErr('');
    try {
      const r = await promosAdminAPI.createCampaign({
        code: f.code,
        discountPercent: f.kind === 'percent' ? Number(f.value) : undefined,
        discountAmount: f.kind === 'amount' ? Number(f.value) : undefined,
        minOrder: f.minOrder ? Number(f.minOrder) : undefined,
        maxUses: f.maxUses ? Number(f.maxUses) : undefined,
        expiresAt: f.expiresAt || undefined,
      });
      onCreated(r.message);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">New campaign</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-sm text-red-700">{err}</div>}
          <div>
            <label className="text-xs font-medium text-slate-600">Code</label>
            <input value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="NATIONDAY25"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Type</label>
              <select value={f.kind} onChange={(e) => set('kind', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                <option value="percent">Percent off</option>
                <option value="amount">Fixed ₵ off</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">{f.kind === 'percent' ? 'Percent (1–100)' : 'Amount (₵)'}</label>
              <input value={f.value} onChange={(e) => set('value', e.target.value)} inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Min order (₵, optional)</label>
              <input value={f.minOrder} onChange={(e) => set('minOrder', e.target.value)} inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Max uses (optional)</label>
              <input value={f.maxUses} onChange={(e) => set('maxUses', e.target.value)} inputMode="numeric"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Expires (optional)</label>
            <input type="date" value={f.expiresAt} onChange={(e) => set('expiresAt', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <button onClick={submit} disabled={busy || !f.code || !f.value}
            className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'Creating…' : 'Launch campaign'}
          </button>
        </div>
      </div>
    </div>
  );
}
