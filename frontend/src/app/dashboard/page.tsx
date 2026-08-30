'use client';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  authAPI, ordersAPI, productsAPI, storesAPI, notificationsAPI,
  workflowAPI, officerCommsAPI, adminAPI, deliveryAPI, managementAPI, SUBSCRIPTION, isLoggedIn,
  reportingAPI, financeAPI, paymentsAPI, aiAPI,
} from '../../lib/api';
import { getRoleProfile, type RoleProfile, type AiAgent } from '../../lib/roleConfig';
import AssistantChatbot from '../../components/AssistantChatbot';
import OrderTracker from '../../components/ui/OrderTracker';
import PaymentsOffice from '../../components/PaymentsOffice';
import DisputesPanel from '../../components/DisputesPanel';
import PanelBoundary from '../../components/PanelBoundary';
import { addToCart } from '../../lib/cart';
import { getSaved, removeSaved, onSavedChange } from '../../lib/saved';

// ═════════════════════════════════════════════════════════════════════════════
// Gold design language
// A refined metallic gold accent layered over the existing slate/indigo system.
// ═════════════════════════════════════════════════════════════════════════════
const GOLD = '#C8A24B';
const GOLD_LT = '#E7CB77';
const GOLD_DK = '#9A7A2E';
const GOLD_GRAD = `linear-gradient(90deg, ${GOLD_DK}, ${GOLD_LT}, ${GOLD})`;

/** Thin gold bar that sits at the top edge of a card. */
function GoldTopBar() {
  return <div className="h-1 w-full" style={{ background: GOLD_GRAD }} />;
}

function reveal(delayMs: number) {
  return { animationDelay: `${delayMs}ms` } as React.CSSProperties;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────────────
const TIER_STYLES: Record<string, { dot: string; chip: string; label: string; bar: string }> = {
  critical: { dot: 'bg-red-500',    chip: 'bg-red-50 text-red-700 border-red-200',         label: 'Critical', bar: 'bg-red-500' },
  high:     { dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-700 border-orange-200', label: 'High',     bar: 'bg-orange-500' },
  medium:   { dot: 'bg-amber-500',  chip: 'bg-amber-50 text-amber-700 border-amber-200',    label: 'Medium',   bar: 'bg-amber-400' },
  low:      { dot: 'bg-slate-400',  chip: 'bg-slate-50 text-slate-600 border-slate-200',    label: 'Low',      bar: 'bg-slate-400' },
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

function StatusPill({ status, paid }: { status: string; paid: boolean }) {
  const map: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-700', confirmed: 'bg-blue-50 text-blue-700',
    processing: 'bg-amber-50 text-amber-700', shipped: 'bg-purple-50 text-purple-700',
    delivered: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-red-50 text-red-700',
  };
  return (
    <div className="flex items-center gap-1.5 mt-1 justify-end">
      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${map[status] || 'bg-slate-100 text-slate-700'}`}>{status}</span>
      {paid && (
        <span className="text-xs text-emerald-700 font-semibold inline-flex items-center gap-0.5">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
          paid
        </span>
      )}
    </div>
  );
}

function StatCard({ label, value, hint, gold, delay = 0 }: { label: string; value: any; hint?: string; gold?: boolean; delay?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-up" style={reveal(delay)}>
      {gold && <GoldTopBar />}
      <div className="p-5">
        <p className="text-xs text-slate-500 uppercase font-semibold tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
        {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
      </div>
    </div>
  );
}

function subscriptionBanner(sub: any, storeCount: number) {
  if (!sub?.status) return null;
  const base = SUBSCRIPTION.priceForStores(storeCount || 1);
  const disc = sub.discountPercent || 0;
  const price = Math.round(base * (1 - disc / 100));
  const priceText = disc > 0
    ? `₵${price}/month (${storeCount >= 2 ? '2 stores' : '1 store'}, ${disc}% discount applied) to MoMo ${SUBSCRIPTION.momoNumber}.`
    : `₵${base}/month (${storeCount >= 2 ? '2 stores' : '1 store'}) to MoMo ${SUBSCRIPTION.momoNumber}.`;
  if (sub.status === 'trial') {
    const days = sub.trialEndsAt ? Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86400000)) : 120;
    return { tone: 'bg-indigo-50 border-indigo-200 text-indigo-800', title: `Free trial — ${days} day${days === 1 ? '' : 's'} left`, message: `Your first 4 months are free. After that: ${priceText}`, action: null, pct: Math.min(100, ((120 - days) / 120) * 100) };
  }
  if (sub.status === 'past_due') {
    return { tone: 'bg-red-50 border-red-200 text-red-700', title: 'Subscription past due', message: `Pay ${priceText}`, action: 'Pay now', pct: 100 };
  }
  if (sub.status === 'active') {
    const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : null;
    return { tone: 'bg-emerald-50 border-emerald-200 text-emerald-700', title: 'Subscription active', message: end ? `Renews ${end}. ${priceText}` : priceText, action: null, pct: 0 };
  }
  return null;
}

function NotificationsCard({ notifs, delay = 0 }: { notifs: any[]; delay?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-fade-in-up" style={reveal(delay)}>
      <h2 className="font-bold text-slate-900 mb-3">Recent notifications</h2>
      {notifs.length === 0 ? (
        <p className="text-sm text-slate-400">All quiet here.</p>
      ) : (
        <div className="space-y-3">
          {notifs.slice(0, 5).map((n: any) => (
            <div key={n._id} className="text-sm border-l-2 pl-3" style={{ borderColor: GOLD }}>
              <p className="font-semibold text-slate-800">{n.title}</p>
              <p className="text-slate-500 text-xs leading-relaxed">{n.message}</p>
              <p className="text-slate-400 text-xs mt-0.5">{new Date(n.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The named dashboard panels (modules) this role is responsible for. */
function ModulesGrid({ modules, delay = 0 }: { modules: string[]; delay?: number }) {
  if (!modules || modules.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-up" style={reveal(delay)}>
      <GoldTopBar />
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-slate-900 text-base">Your workspace</h2>
            <p className="text-xs text-slate-400">The areas your role works across.</p>
          </div>
          <span className="text-[11px] text-slate-400 font-semibold">{modules.length} modules</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {modules.map((m) => (
            <span key={m} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-amber-200 hover:bg-amber-50/50 transition-colors">
              <span className="text-[10px]" style={{ color: GOLD_DK }}>◆</span>{m}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Capability rules — what this role can and cannot do. */
function CapabilitiesCard({ can, cannot, delay = 0 }: { can: string[]; cannot: string[]; delay?: number }) {
  if ((!can || can.length === 0) && (!cannot || cannot.length === 0)) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-fade-in-up" style={reveal(delay)}>
      <h2 className="font-bold text-slate-900 mb-3">Permissions</h2>
      {can.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 mb-1.5">Can</p>
          <ul className="space-y-1">
            {can.map((c) => (
              <li key={c} className="text-sm text-slate-700 flex items-start gap-2">
                <span className="text-emerald-600 mt-0.5">✓</span> {c}
              </li>
            ))}
          </ul>
        </div>
      )}
      {cannot.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-red-600 mb-1.5">Cannot</p>
          <ul className="space-y-1">
            {cannot.map((c) => (
              <li key={c} className="text-sm text-slate-500 flex items-start gap-2">
                <span className="text-red-500 mt-0.5">✕</span> {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** AI intelligence agents available to this role. */
function AiAgentsCard({ agents, delay = 0 }: { agents: AiAgent[]; delay?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!agents || agents.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-up" style={reveal(delay)}>
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#7c3aed,#c026d3)' }} />
      <div className="p-6">
        <h2 className="font-bold text-slate-900 mb-1">AI assistants</h2>
        <p className="text-sm text-slate-500 mb-4">Autonomous agents that support your work.</p>
        <div className="space-y-2.5">
          {agents.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-200 overflow-hidden">
              <button onClick={() => setOpen(open === a.id ? null : a.id)} className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 text-left">
                <span className="text-xl">{a.glyph}</span>
                <span className="flex-1 text-sm font-semibold text-slate-800">{a.name}</span>
                <span className="text-slate-400 text-xs">{open === a.id ? '▲' : '▼'}</span>
              </button>
              {open === a.id && (
                <div className="px-3 pb-3 pt-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-violet-700 mb-1">Does</p>
                  <ul className="text-xs text-slate-600 space-y-0.5 mb-2">
                    {a.functions.map((f) => <li key={f}>• {f}</li>)}
                  </ul>
                  <p className="text-xs font-bold uppercase tracking-wide text-red-600 mb-1">Cannot</p>
                  <ul className="text-xs text-slate-500 space-y-0.5">
                    {a.cannot.map((f) => <li key={f}>✕ {f}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * AI Commerce Assistant — real, transparent heuristics computed from the
 * caller's own orders/products (no fabricated ML). Surfaced to buyers/sellers.
 */
function AiInsights({ orders, products, isSeller, delay = 0 }: { orders: any[]; products: any[]; isSeller: boolean; delay?: number }) {
  const insights: { tone: string; text: string }[] = [];
  const paid = orders.filter((o: any) => o.paymentStatus === 'paid');

  if (isSeller) {
    // Demand trend from recent paid orders.
    const sorted = [...paid].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (sorted.length >= 4) {
      const half = Math.floor(sorted.length / 2);
      const first = sorted.slice(0, half).reduce((s, o) => s + (o.totalAmount || 0), 0);
      const second = sorted.slice(half).reduce((s, o) => s + (o.totalAmount || 0), 0);
      if (second > first * 1.1) insights.push({ tone: 'up', text: `Demand is trending up — recent revenue is ${Math.round(((second - first) / (first || 1)) * 100)}% higher than earlier orders. Consider increasing stock.` });
      else if (second < first * 0.9) insights.push({ tone: 'down', text: 'Demand is softening versus earlier orders. A short promotion could re-activate buyers.' });
    }
    // Pricing/zero-sales products.
    const inactive = products.filter((p: any) => p.status !== 'active');
    if (inactive.length > 0) insights.push({ tone: 'info', text: `${inactive.length} of your products are not active. Activating them could lift visibility.` });
    if (products.length > 0 && paid.length === 0) insights.push({ tone: 'info', text: 'You have listings but no paid orders yet — review pricing and add clear photos to convert browsers.' });
    if (insights.length === 0) insights.push({ tone: 'info', text: 'Not enough data yet for forecasts. Insights sharpen as orders come in.' });
  } else {
    if (orders.length === 0) insights.push({ tone: 'info', text: 'Tell the assistant what you need and it will recommend products and compare prices for you.' });
    else {
      const active = orders.filter((o: any) => ['confirmed', 'processing', 'shipped'].includes(o.status)).length;
      if (active > 0) insights.push({ tone: 'up', text: `You have ${active} active ${active === 1 ? 'order' : 'orders'} in transit — track them from the orders list.` });
      insights.push({ tone: 'info', text: 'Based on your orders, the assistant can suggest reorders and cheaper alternatives.' });
    }
  }

  const dot: Record<string, string> = { up: 'bg-emerald-500', down: 'bg-red-500', info: 'bg-violet-500' };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-up" style={reveal(delay)}>
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#7c3aed,#c026d3)' }} />
      <div className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🧠</span>
          <h2 className="font-bold text-slate-900">AI Commerce Assistant</h2>
        </div>
        <div className="space-y-2.5">
          {insights.map((it, i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
              <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot[it.tone]}`} />
              <p className="leading-snug">{it.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Horizontal stacked bar showing the tier mix of a task list. */
function PriorityBar({ items }: { items: any[] }) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>;
  items.forEach((i) => { counts[i.priority?.tier || 'low'] = (counts[i.priority?.tier || 'low'] || 0) + 1; });
  const total = items.length || 1;
  const order = ['critical', 'high', 'medium', 'low'];
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
        {order.map((t) => counts[t] > 0 && (
          <div key={t} className={TIER_STYLES[t].bar} style={{ width: `${(counts[t] / total) * 100}%` }} title={`${counts[t]} ${t}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {order.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`w-2 h-2 rounded-full ${TIER_STYLES[t].dot}`} />
            {TIER_STYLES[t].label} <span className="font-semibold text-slate-700">{counts[t]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Compact sparkline of order values over time. */
function Sparkline({ orders }: { orders: any[] }) {
  const pts = [...orders]
    .filter((o) => o.totalAmount)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((o) => o.totalAmount as number);
  if (pts.length < 2) return null;
  const max = Math.max(...pts), min = Math.min(...pts);
  const span = max - min || 1;
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * 100;
    const y = 28 - ((v - min) / span) * 26;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-10 mt-2">
      <polyline points={coords.join(' ')} fill="none" stroke={GOLD} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Order status breakdown chips. */
function StatusBreakdown({ orders }: { orders: any[] }) {
  const counts: Record<string, number> = {};
  orders.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  const color: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-700', confirmed: 'bg-blue-50 text-blue-700',
    processing: 'bg-amber-50 text-amber-700', shipped: 'bg-purple-50 text-purple-700',
    delivered: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-red-50 text-red-700',
  };
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {entries.map(([s, n]) => (
        <span key={s} className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize ${color[s] || 'bg-slate-100 text-slate-700'}`}>{s} · {n}</span>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// OFFICER / EXECUTIVE CONSOLE
// ═════════════════════════════════════════════════════════════════════════════
type TaskFilter = 'all' | 'critical' | 'overdue' | 'escalated';

function TaskCard({
  it, acting, onDecide,
}: { it: any; acting: string | null; onDecide: (id: string, d: 'approved' | 'rejected' | 'escalated', note: string) => void }) {
  const tier = TIER_STYLES[it.priority?.tier || 'low'];
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const isOverdue = it.currentDueAt && new Date(it.currentDueAt) < new Date();
  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center pt-1 shrink-0">
            <span className={`w-2.5 h-2.5 rounded-full ${tier.dot}`} />
            <span className="text-[11px] font-bold text-slate-400 mt-1">{it.priority?.score ?? 0}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] uppercase font-bold tracking-wide px-2 py-0.5 rounded border ${tier.chip}`}>{tier.label}</span>
              <span className="text-xs text-slate-400 font-semibold">{it.definitionKey}</span>
              {it.status === 'escalated' && (
                <span className="text-[10px] uppercase font-bold tracking-wide px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">Escalated</span>
              )}
            </div>
            <h3 className="font-bold text-slate-900 mt-1.5 text-sm">{it.entityType} review — step {it.currentStepOrder}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Initiated by {it.initiatedBy?.fullName || 'system'}
              {it.district ? ` · ${it.district}` : it.region ? ` · ${it.region}` : ''}
              {' · '}
              <span className={isOverdue ? 'text-red-600 font-semibold' : ''}>{it.currentDueAt ? relativeTime(it.currentDueAt) : 'no SLA'}</span>
            </p>
            {it.priority?.reasons?.length > 0 && (
              <button onClick={() => setOpen(!open)} className="text-xs font-semibold mt-2 hover:underline" style={{ color: GOLD_DK }}>
                {open ? 'Hide breakdown' : 'Why this priority?'}
              </button>
            )}
            {open && (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs font-bold text-slate-600 uppercase mb-2">Priority breakdown</p>
                <ul className="text-xs text-slate-700 space-y-1">
                  {(it.priority?.reasons || []).map((r: string, i: number) => <li key={i}>• {r}</li>)}
                </ul>
                {it.priority?.breakdown && (
                  <div className="grid grid-cols-5 gap-2 mt-3 text-center text-[10px] uppercase tracking-wide">
                    {(['sla', 'reports', 'escalation', 'value', 'age'] as const).map((k) => (
                      <div key={k} className="bg-white border border-slate-200 rounded px-2 py-1.5">
                        <p className="font-bold text-slate-700">{it.priority.breakdown[k]}</p>
                        <p className="text-slate-400">{k}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional comment for the audit log…"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 mb-2"
            rows={1}
          />
          <div className="flex gap-2 flex-wrap items-center">
            <button onClick={() => onDecide(it._id, 'approved', note)} disabled={acting === it._id} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3.5 py-1.5 rounded-lg text-sm disabled:opacity-50">
              {acting === it._id ? 'Working…' : 'Approve'}
            </button>
            <button onClick={() => onDecide(it._id, 'rejected', note)} disabled={acting === it._id} className="bg-red-600 hover:bg-red-700 text-white font-semibold px-3.5 py-1.5 rounded-lg text-sm disabled:opacity-50">Reject</button>
            <button onClick={() => onDecide(it._id, 'escalated', note)} disabled={acting === it._id} className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-3.5 py-1.5 rounded-lg text-sm disabled:opacity-50">Escalate</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChannelsPreview({ channels, delay = 0 }: { channels: any[]; delay?: number }) {
  const kindGlyph: Record<string, string> = { department: '🏷️', regional: '🗺️', incident: '🚨', broadcast: '📢' };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-fade-in-up" style={reveal(delay)}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-slate-900">Department channels</h2>
        <Link href="/admin/comms" className="text-xs font-semibold hover:underline" style={{ color: GOLD_DK }}>Open &rarr;</Link>
      </div>
      {channels.length === 0 ? (
        <p className="text-sm text-slate-400">No channels available to your role yet.</p>
      ) : (
        <div className="space-y-2.5">
          {channels.slice(0, 4).map((c: any) => (
            <Link key={c._id || c.key} href="/admin/comms" className="block p-2.5 rounded-xl border border-slate-200 hover:border-amber-200 hover:bg-amber-50/40 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">{kindGlyph[c.kind] || '💬'} {c.name}</span>
                {c.kind === 'broadcast' && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">Broadcast</span>}
              </div>
              {c.lastMessagePreview && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{c.lastMessagePreview}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PlatformPulse({ stats, delay = 0 }: { stats: any; delay?: number }) {
  const tiles = [
    { k: 'Users', v: stats.totalUsers, href: '/admin' },
    { k: 'Pending reviews', v: stats.pendingUsers, href: '/admin/review', warn: stats.pendingUsers > 0 },
    { k: 'Open reports', v: stats.openReports, href: '/admin/review', warn: stats.openReports > 0 },
    { k: 'Pending products', v: stats.pendingProducts, href: '/admin', warn: stats.pendingProducts > 0 },
    { k: 'Total orders', v: stats.totalOrders, href: '/admin' },
    { k: 'Sellers past due', v: stats.sellersPastDue, href: '/admin', warn: stats.sellersPastDue > 0 },
  ];
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-up" style={reveal(delay)}>
      <GoldTopBar />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-900 text-lg">Platform pulse</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/admin/control" className="text-xs font-semibold hover:underline" style={{ color: GOLD_DK }}>Control center &rarr;</Link>
            <Link href="/admin/operations" className="text-xs font-semibold hover:underline" style={{ color: GOLD_DK }}>Operations &rarr;</Link>
            <Link href="/admin/store-types" className="text-xs font-semibold hover:underline" style={{ color: GOLD_DK }}>Store types &rarr;</Link>
            <Link href="/admin/security" className="text-xs font-semibold hover:underline" style={{ color: GOLD_DK }}>Security log &rarr;</Link>
            <Link href="/admin" className="text-xs font-semibold hover:underline" style={{ color: GOLD_DK }}>Admin console &rarr;</Link>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {tiles.map((t) => (
            <Link key={t.k} href={t.href} className={`rounded-xl border p-3 transition-colors ${t.warn ? 'border-amber-300 bg-amber-50/60 hover:bg-amber-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{t.k}</p>
              <p className={`text-xl font-bold mt-1 ${t.warn ? 'text-amber-700' : 'text-slate-900'}`}>{t.v ?? 0}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LOGISTICS / DELIVERY
// ═════════════════════════════════════════════════════════════════════════════
const LOGISTICS_MANAGER_ROLES = [
  'admin', 'ceo', 'coo', 'national_logistics_director', 'national_operations_director',
  'logistics_officer', 'logistics_inspector', 'region_admin', 'regional_operations_manager',
  'regional_logistics_officer', 'district_admin', 'district_logistics_officer',
  'fleet_manager', 'logistics_company',
];

const DLV_STATUS_STYLE: Record<string, string> = {
  pending_assignment: 'bg-slate-100 text-slate-600', assigned: 'bg-blue-50 text-blue-700',
  accepted: 'bg-indigo-50 text-indigo-700', picked_up: 'bg-amber-50 text-amber-700',
  in_transit: 'bg-purple-50 text-purple-700', delivered: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700', cancelled: 'bg-slate-100 text-slate-500',
};
const dlvLabel = (s: string) => s.replace(/_/g, ' ');

/** Seller: a friendly quick-actions launcher for everyday tasks. */
function SellerQuickActions() {
  const actions = [
    { href: '/stores/manage', icon: '🏪', label: 'My stores', desc: 'Logo, banner, payouts' },
    { href: '/sell', icon: '➕', label: 'New listing', desc: 'Add a product' },
    { href: '/seller/promotions', icon: '🎁', label: 'Promotions', desc: 'Discounts & deals' },
    { href: '/wallet', icon: '💰', label: 'Wallet', desc: 'Earnings & commission' },
    { href: '/messages', icon: '💬', label: 'Messages', desc: 'Buyers & riders' },
    { href: '/ai-console', icon: '🤖', label: 'AI Console', desc: 'Smart tools' },
  ];
  return (
    <div className="mb-6 animate-fade-in-up">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
        {actions.map((a) => (
          <Link key={a.href} href={a.href}
            className="group bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-amber-200 transition-all p-3 text-center">
            <div className="text-2xl mb-1.5 group-hover:scale-110 transition-transform">{a.icon}</div>
            <p className="text-xs font-bold text-slate-800 leading-tight">{a.label}</p>
            <p className="text-[10px] text-slate-400 mt-0.5 hidden sm:block">{a.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Seller: sales analytics, payouts and inventory alerts from loaded orders/products. */
function SellerAnalytics({ orders, products }: { orders: any[]; products: any[] }) {
  const cur = orders.find((o) => o.currency)?.currency || products.find((p) => p.currency)?.currency || 'GHS';
  const paid = orders.filter((o) => o.paymentStatus === 'paid');
  const revenue = paid.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const released = paid.filter((o) => o.status === 'delivered').reduce((s, o) => s + (o.totalAmount || 0), 0);
  const pendingPayout = paid.filter((o) => !['delivered', 'cancelled'].includes(o.status)).reduce((s, o) => s + (o.totalAmount || 0), 0);

  // Last 7 days revenue trend (paid orders bucketed by day).
  const days: { label: string; total: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const total = paid.filter((o) => { const t = new Date(o.createdAt).getTime(); return t >= d.getTime() && t < next.getTime(); })
      .reduce((s, o) => s + (o.totalAmount || 0), 0);
    days.push({ label: d.toLocaleDateString(undefined, { weekday: 'short' }), total });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.total));

  // Top products by quantity from order items.
  const tally: Record<string, { title: string; qty: number; revenue: number }> = {};
  orders.forEach((o) => (o.items || []).forEach((it: any) => {
    const id = it.product?._id || it.product || it.title || 'item';
    const title = it.product?.title || it.title || it.name || 'Item';
    if (!tally[id]) tally[id] = { title, qty: 0, revenue: 0 };
    tally[id].qty += it.quantity || 1;
    tally[id].revenue += (it.unitPrice ?? it.product?.pricePerUnit ?? it.price ?? 0) * (it.quantity || 1);
  }));
  const top = Object.values(tally).sort((a, b) => b.qty - a.qty).slice(0, 5);

  // Inventory alerts.
  const lowStock = products.filter((p) => typeof p.availableQuantity === 'number' && p.availableQuantity > 0 && p.availableQuantity <= 5);
  const outStock = products.filter((p) => p.availableQuantity === 0);

  const money = (n: number) => `${cur} ${Math.round(n).toLocaleString()}`;

  return (
    <div className="mb-6 space-y-4 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-900">Sales overview</h2>
        <Link href="/wallet" className="text-xs font-semibold text-indigo-700 hover:underline">💰 My wallet &amp; commission →</Link>
      </div>
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Revenue (paid)" value={money(revenue)} tone="emerald" />
        <Kpi label="Pending payout (in escrow)" value={money(pendingPayout)} tone="amber" sub="Released on delivery" />
        <Kpi label="Released to you" value={money(released)} tone="slate" />
        <Kpi label="Paid orders" value={String(paid.length)} tone="indigo" sub={`${orders.length} total`} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* 7-day trend */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-900 text-sm mb-3">Last 7 days</h3>
          <div className="flex items-end justify-between gap-2 h-28">
            {days.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t bg-emerald-500/80" style={{ height: `${Math.max(4, (d.total / maxDay) * 96)}px` }} title={money(d.total)} />
                <span className="text-[10px] text-slate-400">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top products */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-900 text-sm mb-3">Top products</h3>
          {top.length === 0 ? <p className="text-sm text-slate-400">No sales yet.</p> : (
            <div className="space-y-2">
              {top.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 truncate pr-2">{i + 1}. {t.title}</span>
                  <span className="text-slate-400 shrink-0">{t.qty} sold · {money(t.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Inventory alerts */}
      {(lowStock.length > 0 || outStock.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <h3 className="font-bold text-amber-800 text-sm mb-2">⚠️ Inventory alerts</h3>
          <div className="space-y-1 text-sm">
            {outStock.map((p) => (
              <div key={p._id} className="flex items-center justify-between">
                <span className="text-rose-700">{p.title} — out of stock</span>
                <Link href={`/sell/edit/${p._id}`} className="font-semibold text-rose-700 hover:underline">Restock →</Link>
              </div>
            ))}
            {lowStock.map((p) => (
              <div key={p._id} className="flex items-center justify-between">
                <span className="text-amber-800">{p.title} — only {p.availableQuantity} left</span>
                <Link href={`/sell/edit/${p._id}`} className="font-semibold text-amber-800 hover:underline">Update →</Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone, sub }: { label: string; value: string; tone: string; sub?: string }) {
  const tones: Record<string, string> = {
    emerald: 'text-emerald-700', amber: 'text-amber-700', slate: 'text-slate-800', indigo: 'text-indigo-700',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className={`text-xl font-bold ${tones[tone] || 'text-slate-800'}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/** Buyer: re-add a past order's items to the cart. */
function BuyAgain({ order }: { order: any }) {
  const [done, setDone] = useState(false);
  const add = () => {
    (order.items || []).forEach((it: any) => {
      const p = it.product || {};
      addToCart({
        id: p._id || it.product || it._id,
        title: p.title || it.title || it.name || 'Item',
        price: it.unitPrice ?? p.pricePerUnit ?? it.price ?? 0,
        unit: p.unit || it.unit,
        currency: order.currency || 'GHS',
        image: p.images?.[0],
        sellerName: order.seller?.company || order.seller?.fullName,
      }, it.quantity || 1);
    });
    setDone(true); setTimeout(() => setDone(false), 2000);
  };
  return (
    <button onClick={add} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50">
      {done ? '✓ Added to cart' : '🔁 Buy again'}
    </button>
  );
}

/** Buyer: saved items (wishlist) panel. */
function SavedItemsPanel() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { setItems(getSaved()); return onSavedChange(() => setItems(getSaved())); }, []);
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-fade-in-up">
        <h2 className="font-bold text-slate-900 mb-1">Saved items</h2>
        <p className="text-sm text-slate-400">Tap “♡ Save for later” on any product and it'll appear here for quick access.</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-fade-in-up">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-slate-900">Saved items <span className="text-slate-400 font-normal">({items.length})</span></h2>
      </div>
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3">
            <Link href={`/catalog/${it.id}`} className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 shrink-0">
              {it.image ? <img src={it.image} alt={it.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300">📦</div>}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/catalog/${it.id}`} className="text-sm font-semibold text-slate-800 truncate block hover:text-indigo-700">{it.title}</Link>
              <p className="text-xs text-slate-500">{it.currency || 'GHS'} {Number(it.price).toLocaleString()}{it.sellerName ? ` · ${it.sellerName}` : ''}</p>
            </div>
            <button onClick={() => { addToCart(it, 1); }} title="Add to cart" className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white">🛒</button>
            <button onClick={() => removeSaved(it.id)} title="Remove" className="text-xs font-semibold px-2 py-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Rider/driver delivery jobs with status actions + earnings. */
function RiderDeliveries({ delay = 0 }: { delay?: number }) {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ active: 0, completed: 0, earnings: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [duty, setDuty] = useState<string>('offline');
  const [dutyBusy, setDutyBusy] = useState(false);
  const [sub, setSub] = useState<any>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);

  const toggleShare = (id: string) => {
    if (sharingId === id) {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null; setSharingId(null); return;
    }
    if (!navigator.geolocation) return;
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => { deliveryAPI.ping(id, pos.coords.latitude, pos.coords.longitude).catch(() => {}); },
      () => {}, { enableHighAccuracy: true, maximumAge: 10000 },
    );
    setSharingId(id);
  };
  useEffect(() => () => { if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [r, meRes] = await Promise.all([deliveryAPI.mine(), authAPI.me().catch(() => null)]);
      setDeliveries(r.deliveries || []); setSummary(r.summary);
      const u = (meRes as any)?.user || meRes; if (u?.dutyStatus) setDuty(u.dutyStatus);
      if (u?.subscription) setSub(u.subscription);
    } catch { /* empty */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const setDutyStatus = async (s: string) => {
    setDutyBusy(true);
    try { await authAPI.updateProfile({ dutyStatus: s }); setDuty(s); } catch { /* */ } finally { setDutyBusy(false); }
  };

  const NEXT: Record<string, { to: string; label: string; cls: string }[]> = {
    assigned: [{ to: 'accepted', label: 'Accept', cls: 'bg-indigo-600 hover:bg-indigo-700' }],
    accepted: [{ to: 'picked_up', label: 'Mark picked up', cls: 'bg-amber-600 hover:bg-amber-700' }],
    picked_up: [{ to: 'in_transit', label: 'Start transit', cls: 'bg-purple-600 hover:bg-purple-700' }],
    in_transit: [
      { to: 'delivered', label: 'Delivered', cls: 'bg-emerald-600 hover:bg-emerald-700' },
      { to: 'failed', label: 'Failed', cls: 'bg-red-600 hover:bg-red-700' },
    ],
  };

  const [actErr, setActErr] = useState('');
  const act = async (id: string, status: string) => {
    setActing(id); setActErr('');
    let note: string | undefined;
    if (status === 'failed') {
      note = (typeof window !== 'undefined' ? window.prompt('Why did this delivery fail? (the buyer will see this)') : '') || '';
      if (!note.trim()) { setActing(null); return; }
    }
    try { await deliveryAPI.setStatus(id, { status, note }); await load(); }
    catch (e: any) { setActErr(e?.message || 'Could not update the job.'); }
    finally { setActing(null); }
  };

  const RIDER_COMMISSION_PCT = 10; // platform's cut of delivery earnings
  const gross = summary.earnings || 0;
  const commission = Math.round(gross * RIDER_COMMISSION_PCT) / 100;
  const net = gross - commission;
  const tiles = [
    { k: 'Active', v: summary.active }, { k: 'To accept', v: summary.pending },
    { k: 'Completed', v: summary.completed }, { k: 'Net earnings', v: `₵${net.toLocaleString()}` },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-up" style={reveal(delay)}>
      <GoldTopBar />
      <div className="p-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-bold text-slate-900 text-lg">My deliveries</h2>
          <div className="flex items-center gap-2">
            <Link href="/rider/office" className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: GOLD_DK }}>🛵 My office</Link>
            <Link href="/wallet" className="text-xs font-semibold text-indigo-700 hover:underline">💰 My wallet →</Link>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-semibold mr-1">Duty:</span>
            {[{ k: 'available', l: '🟢 Available' }, { k: 'busy', l: '🟠 Busy' }, { k: 'offline', l: '⚪ Offline' }].map((d) => (
              <button key={d.k} onClick={() => setDutyStatus(d.k)} disabled={dutyBusy}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${duty === d.k ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                style={duty === d.k ? { background: GOLD_DK } : undefined}>
                {d.l}
              </button>
            ))}
          </div>
        </div>
        {duty !== 'available' && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            Set yourself <b>Available</b> so the AI can assign you nearby parcels.
          </p>
        )}
        {sub && sub.status === 'trial' && sub.trialEndsAt && (
          <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3">
            🎁 Free for your first 4 months ({Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86400000))} days left).
            After that, ₵{sub.amount || SUBSCRIPTION.partnerFee}/month by MoMo to {SUBSCRIPTION.momoNumber}.
          </p>
        )}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {tiles.map((t) => (
            <div key={t.k} className="rounded-xl border border-slate-200 p-3 text-center">
              <p className="text-[11px] text-slate-500 uppercase font-semibold">{t.k}</p>
              <p className="text-lg font-bold text-slate-900 mt-0.5">{t.v}</p>
            </div>
          ))}
        </div>
        {actErr && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 flex items-center justify-between gap-2 flex-wrap">
            <span>{actErr}</span>
            <Link href="/wallet" className="font-semibold underline shrink-0">Top up wallet →</Link>
          </div>
        )}
        {gross > 0 && (
          <p className="text-xs text-slate-500 mb-4 -mt-2 text-center">
            Gross ₵{gross.toLocaleString()} · platform commission {RIDER_COMMISSION_PCT}% (₵{commission.toLocaleString()}) · <span className="font-semibold text-emerald-700">net ₵{net.toLocaleString()}</span>
          </p>
        )}
        {loading ? <p className="text-slate-400 text-center py-8">Loading…</p>
          : deliveries.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-2xl p-8 text-center">
              <p className="text-slate-600 font-medium">No deliveries assigned yet. 🛵</p>
              <p className="text-slate-400 text-sm mt-1">Jobs routed to you will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {deliveries.filter((d) => d.status !== 'delivered' && d.status !== 'cancelled').map((d) => (
                <div key={d._id} className="border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-mono text-sm font-semibold text-slate-700">{d.trackingNumber}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {d.seller?.company || d.seller?.fullName || 'Seller'} → {d.dropoffDistrict || d.dropoffRegion || 'destination'}
                        {' · '}~{d.distanceKm}km · {d.etaMinutes}min · ₵{d.fee}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${DLV_STATUS_STYLE[d.status]}`}>{dlvLabel(d.status)}</span>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {(NEXT[d.status] || []).map((n) => (
                      <button key={n.to} onClick={() => act(d._id, n.to)} disabled={acting === d._id}
                        className={`${n.cls} text-white font-semibold px-3.5 py-1.5 rounded-lg text-sm disabled:opacity-50`}>
                        {acting === d._id ? '…' : n.label}
                      </button>
                    ))}
                    {['accepted', 'picked_up', 'in_transit'].includes(d.status) && (
                      <button onClick={() => toggleShare(d._id)}
                        className={`font-semibold px-3.5 py-1.5 rounded-lg text-sm border ${sharingId === d._id ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                        {sharingId === d._id ? '📍 Sharing location…' : '📍 Share my location'}
                      </button>
                    )}
                    <a href={`/track-map/${d.trackingNumber}`} target="_blank" rel="noreferrer"
                      className="font-semibold px-3.5 py-1.5 rounded-lg text-sm border border-slate-300 text-slate-700 hover:bg-slate-50">🗺️ Live map</a>
                  </div>
                  {d.order && <OrderTracker orderId={typeof d.order === 'object' ? d.order._id : d.order} viewerRole="rider" />}
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

/** Logistics manager delivery board: live counts + assign (with AI auto-assign). */
function DeliveryBoard({ delay = 0 }: { delay?: number }) {
  const [stats, setStats] = useState<any>({ counts: {}, active: 0, total: 0, unassigned: 0 });
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([deliveryAPI.stats(), deliveryAPI.list({ limit: 12 })]);
      setStats(s); setDeliveries(l.deliveries || []);
    } catch { /* empty */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const autoAssign = async (id: string) => {
    setActing(id); setMsg('');
    try {
      const rec = await deliveryAPI.recommend(id);
      if (!rec.recommendation) { setMsg(rec.message || 'No riders available.'); setActing(null); return; }
      await deliveryAPI.assign(id, { auto: true });
      setMsg(`Assigned to ${rec.recommendation.riderName} (≈${rec.recommendation.etaMinutes}min).`);
      await load();
    } catch (e: any) { setMsg(e.message || 'Assign failed.'); } finally { setActing(null); }
  };

  const tiles = [
    { k: 'Total', v: stats.total }, { k: 'Active', v: stats.active },
    { k: 'Unassigned', v: stats.unassigned, hot: stats.unassigned > 0 },
    { k: 'Delivered', v: stats.counts?.delivered || 0 },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-up" style={reveal(delay)}>
      <GoldTopBar />
      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-900 text-lg">Delivery board</h2>
          <div className="flex items-center gap-3">
            <Link href="/logistics/riders" className="text-xs font-semibold hover:underline text-indigo-700">Riders &amp; drivers →</Link>
            <button onClick={load} className="text-xs font-semibold hover:underline" style={{ color: GOLD_DK }}>Refresh</button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {tiles.map((t) => (
            <div key={t.k} className={`rounded-xl border p-3 text-center ${t.hot ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200'}`}>
              <p className="text-[11px] text-slate-500 uppercase font-semibold">{t.k}</p>
              <p className={`text-lg font-bold mt-0.5 ${t.hot ? 'text-amber-700' : 'text-slate-900'}`}>{t.v}</p>
            </div>
          ))}
        </div>
        {msg && <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3 text-slate-600">{msg}</div>}
        {loading ? <p className="text-slate-400 text-center py-8">Loading…</p>
          : deliveries.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No deliveries in your jurisdiction yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {deliveries.map((d) => (
                <div key={d._id} className="flex items-center justify-between py-2.5 gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-slate-700">{d.trackingNumber}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {(d.pickupDistrict || d.pickupRegion || '?')} → {(d.dropoffDistrict || d.dropoffRegion || '?')}
                      {d.rider ? ` · ${d.rider.fullName}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${DLV_STATUS_STYLE[d.status]}`}>{dlvLabel(d.status)}</span>
                    {d.status === 'pending_assignment' && (
                      <button onClick={() => autoAssign(d._id)} disabled={acting === d._id}
                        className="text-xs font-semibold text-white px-2.5 py-1 rounded-lg disabled:opacity-50" style={{ background: GOLD_DK }}>
                        {acting === d._id ? '…' : '🛰️ Auto-assign'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

/** Seller/buyer action: create a delivery job for an order. */
function ArrangeDelivery({ orderId, label = '🚚 Arrange delivery' }: { orderId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [vehicle, setVehicle] = useState<'rider' | 'driver'>('rider');
  const [weight, setWeight] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [tracking, setTracking] = useState('');
  const go = async () => {
    setState('busy');
    try {
      const r = await deliveryAPI.createForOrder(orderId, { vehicleType: vehicle, parcelWeightKg: Number(weight) || 0 });
      setTracking(r.delivery?.trackingNumber || ''); setState('done');
    } catch (e: any) {
      setTracking(e.message || 'Failed'); setState(e.message?.includes('already') ? 'done' : 'error');
    }
  };
  if (state === 'done') return <p className="text-xs text-emerald-700 mt-1.5">✓ {vehicle === 'driver' ? 'Driver' : 'Rider'} requested{tracking ? ` · ${tracking}` : ''} · the AI is finding the nearest one · fee paid on delivery</p>;
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="text-xs font-semibold mt-1.5 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
        style={{ color: GOLD_DK }}>{label}</button>
    );
  }
  return (
    <div className="mt-2 p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
      <p className="text-xs font-semibold text-slate-600">Who should carry this parcel?</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setVehicle('rider')} className={`text-xs font-semibold px-2 py-2 rounded-lg border ${vehicle === 'rider' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          🛵 Rider (motorbike)<br /><span className="font-normal text-slate-400">Small / light — capped ₵100</span>
        </button>
        <button onClick={() => setVehicle('driver')} className={`text-xs font-semibold px-2 py-2 rounded-lg border ${vehicle === 'driver' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          🚗 Driver (car / van)<br /><span className="font-normal text-slate-400">Big / heavy — by weight</span>
        </button>
      </div>
      <input type="number" min="0" value={weight} onChange={(e) => setWeight(e.target.value)}
        placeholder={vehicle === 'driver' ? 'Parcel weight in kg (affects price)' : 'Approx. weight in kg (optional)'}
        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs" />
      <div className="flex gap-2">
        <button onClick={go} disabled={state === 'busy'} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: GOLD_DK }}>
          {state === 'busy' ? 'Requesting…' : `Request ${vehicle === 'driver' ? 'driver' : 'rider'}`}
        </button>
        <button onClick={() => setOpen(false)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200">Cancel</button>
      </div>
      {state === 'error' && <p className="text-xs text-red-600">· {tracking}</p>}
    </div>
  );
}

/** Shows the assigned rider's contact (Call/Text) to buyer & seller once a rider is on the job. */
function OrderRider({ orderId }: { orderId: string }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    let on = true;
    deliveryAPI.list({ limit: 60 }).then((r) => {
      if (!on) return;
      const match = (r.deliveries || []).find((x: any) => String(x.order?._id || x.order) === String(orderId));
      setD(match || null);
    }).catch(() => {});
    return () => { on = false; };
  }, [orderId]);
  if (!d) return null;
  const rider = d.rider;
  const STAGE: Record<string, string> = {
    pending_assignment: 'Finding a rider…', assigned: 'Rider assigned', accepted: 'Rider accepted',
    picked_up: 'Picked up', in_transit: 'On the way', delivered: 'Delivered', cancelled: 'Cancelled',
  };
  return (
    <div className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="text-xs">
        <span className="font-semibold text-slate-700">🛵 {STAGE[d.status] || d.status}</span>
        {rider?.fullName ? (
          <span className="text-slate-500"> · {rider.fullName}{rider.phone ? ` · ${rider.phone}` : ''}</span>
        ) : (
          <span className="text-slate-400"> · no rider yet</span>
        )}
        {d.trackingNumber && <span className="text-slate-400"> · {d.trackingNumber}</span>}
      </div>
      {rider?.phone && (
        <div className="flex gap-2">
          <a href={`tel:${rider.phone}`} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white">📞 Call</a>
          <a href={`sms:${rider.phone}`} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-white">💬 Text</a>
        </div>
      )}
    </div>
  );
}


/** Seller action: confirm payment received for an order. */
function ConfirmPayment({ orderId }: { orderId: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [err, setErr] = useState('');
  const go = async () => {
    setState('busy'); setErr('');
    try { await ordersAPI.confirmPayment(orderId); setState('done'); }
    catch (e: any) { setErr(e.message || 'Failed'); setState('error'); }
  };
  if (state === 'done') return <p className="text-xs text-emerald-700 mt-1.5">✓ Payment confirmed</p>;
  return (
    <button onClick={go} disabled={state === 'busy'}
      className="text-xs font-semibold mt-1.5 px-2.5 py-1 rounded-lg text-white disabled:opacity-50"
      style={{ background: '#047857' }}>
      {state === 'busy' ? 'Confirming…' : '✓ Confirm payment received'}
      {state === 'error' && <span className="text-amber-200 ml-1">· {err}</span>}
    </button>
  );
}

/** Logistics-officer queue to approve rider/driver applications. */
function RiderApprovals({ delay = 0 }: { delay?: number }) {
  const [riders, setRiders] = useState<any[]>([]);
  const [acting, setActing] = useState<string | null>(null);
  const load = async () => { try { const r = await managementAPI.pendingRiders(); setRiders(r.riders || []); } catch { /* */ } };
  useEffect(() => { load(); }, []);
  const decide = async (id: string, approve: boolean) => {
    setActing(id);
    try { await managementAPI.approveRider(id, approve); await load(); } catch { /* */ } finally { setActing(null); }
  };
  const [aiMsg, setAiMsg] = useState('');
  const aiApprove = async () => {
    setAiMsg('Reviewing…');
    try { const r = await managementAPI.aiApproveRiders(); setAiMsg(r.message); await load(); }
    catch (e: any) { setAiMsg(e.message || 'Failed'); }
  };
  if (riders.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-up" style={reveal(delay)}>
      <GoldTopBar />
      <div className="p-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-bold text-slate-900 text-lg">Rider &amp; driver approvals <span className="text-sm text-slate-400 font-normal">({riders.length})</span></h2>
          <button onClick={aiApprove} className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg" style={{ background: GOLD_DK }}>🤖 AI auto-approve low-risk</button>
        </div>
        {aiMsg && <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3">{aiMsg}</p>}
        <div className="space-y-2.5">
          {riders.map((r) => (
            <div key={r._id} className="flex items-center justify-between border border-slate-200 rounded-xl p-3 gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{r.fullName} <span className="text-xs text-slate-400 capitalize">· {r.role}</span></p>
                <p className="text-xs text-slate-500">{r.district || r.region} · {r.phone}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => decide(r._id, true)} disabled={acting === r._id} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">Approve</button>
                <button onClick={() => decide(r._id, false)} disabled={acting === r._id} className="border border-slate-200 hover:bg-slate-50 text-sm font-semibold px-3 py-1.5 rounded-lg">Decline</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** AI regional-intelligence report (national/regional). */
function RegionalIntelligence({ delay = 0 }: { delay?: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { managementAPI.regionalIntelligence().then(setData).catch(() => {}).finally(() => setLoading(false)); }, []);
  if (loading) return null;
  if (!data || !Array.isArray(data.weakest) || data.weakest.length === 0) return null;
  const healthColor = (h: number) => h >= 70 ? 'text-emerald-700 bg-emerald-50' : h >= 45 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-up" style={reveal(delay)}>
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#7c3aed,#c026d3)' }} />
      <div className="p-6">
        <div className="flex items-center gap-2 mb-1"><span className="text-lg">📊</span><h2 className="font-bold text-slate-900 text-lg">AI Regional Intelligence</h2></div>
        <p className="text-sm text-slate-600 mb-4">{data.headline}</p>
        <div className="space-y-2.5">
          {data.weakest.map((r: any) => (
            <div key={r.region} className="border border-slate-200 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-800 text-sm">{r.region}</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${healthColor(r.health)}`}>health {r.health}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{r.orders} orders · {r.deliveries} deliveries · {r.failRate}% failed · {r.overdueTasks} overdue tasks</p>
              {Array.isArray(r.recommendations) && r.recommendations.length > 0 && (
                <ul className="text-xs text-slate-600 mt-2 space-y-0.5">
                  {r.recommendations.map((rec: string, i: number) => <li key={i}>💡 {rec}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Executive staff management: add officers + assign tasks. */
function StaffPanel({ me, delay = 0 }: { me: any; delay?: number }) {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'district_logistics_officer', region: me.region || '', district: me.district || '' });
  const [msg, setMsg] = useState('');
  const create = async () => {
    setMsg('');
    try { const r = await managementAPI.createStaff(form); setMsg(`✓ Created ${r.staff.fullName} (${r.staff.role}).`); setForm({ ...form, fullName: '', email: '', password: '' }); }
    catch (e: any) { setMsg(e.message || 'Failed.'); }
  };
  const ROLES = ['national_operations_director', 'national_logistics_director', 'national_finance_director', 'national_compliance_director', 'regional_operations_manager', 'regional_logistics_officer', 'district_admin', 'district_logistics_officer', 'district_commerce_officer', 'district_compliance_officer', 'compliance_officer', 'logistics_officer', 'finance_officer', 'verification_officer', 'marketplace_inspector'];
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-up" style={reveal(delay)}>
      <GoldTopBar />
      <div className="p-6">
        <h2 className="font-bold text-slate-900 text-lg mb-1">Add staff</h2>
        <p className="text-sm text-slate-500 mb-4">Create officers for any of Ghana's 16 regions and their districts.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <input placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Temp password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
          <input placeholder="Region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <input placeholder="District" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        {msg && <p className="text-sm mt-3" style={{ color: msg.startsWith('✓') ? '#047857' : '#dc2626' }}>{msg}</p>}
        <button onClick={create} className="mt-4 text-white font-semibold px-5 py-2 rounded-lg" style={{ background: GOLD_DK }}>Create officer</button>
      </div>
    </div>
  );
}

const PROMO_ROLES = ['admin', 'ceo', 'coo', 'cto', 'cio', 'cfo', 'chro', 'national_finance_director', 'finance_officer', 'district_admin', 'region_admin', 'district_commerce_officer'];
const FINANCE_ROLES = ['admin', 'ceo', 'coo', 'cfo', 'national_finance_director', 'finance_officer', 'regional_finance_officer'];
const EXEC_ONLY = ['admin', 'ceo', 'coo', 'cto', 'cio', 'cfo', 'chro'];
const REPORTER_ROLES = ['admin', 'ceo', 'coo', 'district_admin', 'region_admin', 'national_compliance_director', 'regional_compliance_officer', 'district_compliance_officer', 'compliance_officer', 'marketplace_inspector', 'compliance_inspector', 'verification_officer', 'national_security_director', 'security_operations_officer', 'regional_security_officer', 'district_commerce_officer'];

/** Discounts, promotions, and AI reward/incentive recommendations. */
function GrowthTools({ delay = 0 }: { delay?: number }) {
  const [email, setEmail] = useState(''); const [pct, setPct] = useState('10');
  const [promoCode, setPromoCode] = useState(''); const [promoVal, setPromoVal] = useState('10');
  const [msg, setMsg] = useState(''); const [recs, setRecs] = useState<any[]>([]); const [loadingRecs, setLoadingRecs] = useState(false);

  const loadRecs = async () => { setLoadingRecs(true); try { const r = await managementAPI.discountRecommendations(); setRecs(r.recommendations || []); } catch { /* */ } finally { setLoadingRecs(false); } };
  useEffect(() => { loadRecs(); }, []);

  const giveDiscount = async (e: string, p: number) => {
    setMsg('');
    try { await managementAPI.applyDiscountByEmail(e, p); setMsg(`✓ ${p}% discount applied to ${e}`); loadRecs(); }
    catch (err: any) { setMsg(err.message || 'Failed'); }
  };
  const makePromo = async () => {
    setMsg('');
    if (!email) { setMsg('Enter the seller email first.'); return; }
    try { const r = await managementAPI.createPromotion({ ownerEmail: email, code: promoCode || undefined, value: Number(promoVal) }); setMsg(`✓ Promo ${r.promo.code} created on ${r.promo.store}`); }
    catch (err: any) { setMsg(err.message || 'Failed'); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-up" style={reveal(delay)}>
      <GoldTopBar />
      <div className="p-6">
        <h2 className="font-bold text-slate-900 text-lg mb-1">Discounts &amp; promotions</h2>
        <p className="text-sm text-slate-500 mb-4">Reward or incentivise customers. The AI suggests who, based on performance.</p>

        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Customer email" className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <input value={pct} onChange={(e) => setPct(e.target.value)} type="number" min="0" max="100" className="w-20 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <button onClick={() => giveDiscount(email, Number(pct))} className="flex-1 text-white font-semibold rounded-lg text-sm" style={{ background: GOLD_DK }}>Give discount %</button>
          </div>
          <input value={promoCode} onChange={(e) => setPromoCode(e.target.value)} placeholder="Promo code (optional)" className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <input value={promoVal} onChange={(e) => setPromoVal(e.target.value)} type="number" min="0" max="100" className="w-20 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <button onClick={makePromo} className="flex-1 border border-slate-300 font-semibold rounded-lg text-sm hover:bg-slate-50">Create promo %</button>
          </div>
        </div>
        {msg && <p className="text-xs mb-3" style={{ color: msg.startsWith('✓') ? '#047857' : '#dc2626' }}>{msg}</p>}

        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold text-slate-800">🤖 AI recommendations</span>
          <button onClick={loadRecs} className="text-xs font-semibold hover:underline" style={{ color: GOLD_DK }}>Refresh</button>
        </div>
        {loadingRecs ? <p className="text-slate-400 text-sm py-3">Analysing…</p>
          : recs.length === 0 ? <p className="text-slate-400 text-sm py-3">No recommendations right now.</p>
          : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {recs.map((r) => (
                <div key={r.userId} className="border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{r.company || r.name} <span className="text-xs text-slate-400">· {r.orders} orders</span></p>
                      <p className="text-xs text-slate-500">{r.reason}</p>
                    </div>
                    <button onClick={() => giveDiscount(r.email, r.suggestedPercent)} className="text-xs font-semibold text-white px-2.5 py-1 rounded-lg shrink-0" style={{ background: GOLD_DK }}>
                      Give {r.suggestedPercent}%
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

/** Officer files a report against a marketplace user, under their official account. */
function ReportUser({ delay = 0 }: { delay?: number }) {
  const [email, setEmail] = useState(''); const [category, setCategory] = useState('other');
  const [reason, setReason] = useState(''); const [desc, setDesc] = useState(''); const [msg, setMsg] = useState('');
  const CATS = ['scam', 'fraud', 'non_delivery', 'fake_product', 'abusive', 'payment_issue', 'counterfeit_documents', 'other'];
  const file = async () => {
    setMsg('');
    if (!email || !reason) { setMsg('Email and reason are required.'); return; }
    try { await managementAPI.reportUser({ email, category, reason, description: desc }); setMsg('✓ Report filed under your official account.'); setEmail(''); setReason(''); setDesc(''); }
    catch (e: any) { setMsg(e.message || 'Failed'); }
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-up" style={reveal(delay)}>
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#b91c1c,#f87171)' }} />
      <div className="p-6">
        <h2 className="font-bold text-slate-900 text-lg mb-1">Report a user</h2>
        <p className="text-sm text-slate-500 mb-4">Filed in your official capacity ({'{'}your role{'}'}), not a personal account — for marketplace inspections.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="User email" className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            {CATS.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </select>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Short reason" className="border border-slate-300 rounded-lg px-3 py-2 text-sm sm:col-span-2" />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Details (optional)" className="border border-slate-300 rounded-lg px-3 py-2 text-sm sm:col-span-2" />
        </div>
        {msg && <p className="text-xs mt-3" style={{ color: msg.startsWith('✓') ? '#047857' : '#dc2626' }}>{msg}</p>}
        <button onClick={file} className="mt-4 text-white font-semibold px-5 py-2 rounded-lg" style={{ background: '#b91c1c' }}>File report</button>
      </div>
    </div>
  );
}

// ── Simple CSV → array-of-objects parser (headers on first row) ──────────────
function parseCSV(text: string): any[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const obj: any = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] || '').trim(); });
    return obj;
  });
}

/** Officer up-chain reporting: AI-draft, submit, inbox, compile, forward, review. */
function ReportsPanel({ profile, delay = 0 }: { profile: RoleProfile; delay?: number }) {
  const [period, setPeriod] = useState('monthly');
  const [title, setTitle] = useState(''); const [body, setBody] = useState('');
  const [inbox, setInbox] = useState<any[]>([]); const [myLevel, setMyLevel] = useState('');
  const [childLevel, setChildLevel] = useState<string | null>(null);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const load = async () => { try { const r = await reportingAPI.inbox(); setInbox(r.reports || []); setMyLevel(r.myLevel); setChildLevel(r.childLevel); } catch { /* */ } };
  useEffect(() => { load(); }, []);

  const aiDraft = async () => {
    setBusy(true); setMsg('Drafting…');
    try { const r = await reportingAPI.aiAssist(period); setBody(r.draft); if (!title) setTitle(`${period[0].toUpperCase()}${period.slice(1)} report — ${profile.department || 'Operations'}`); setMsg(r.usedLLM ? 'AI draft ready.' : '🧠 In-built draft ready (from your live metrics).'); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  const submit = async () => {
    if (!title.trim()) { setMsg('Add a title.'); return; }
    try { await reportingAPI.create({ title, body, period, status: 'submitted' }); setMsg('✓ Submitted.'); setTitle(''); setBody(''); load(); }
    catch (e: any) { setMsg(e.message); }
  };
  const forward = async (id: string) => { try { const r = await reportingAPI.forward(id); setMsg(r.message); load(); } catch (e: any) { setMsg(e.message); } };
  const review = async (id: string) => { try { await reportingAPI.review(id); setMsg('Marked reviewed.'); load(); } catch (e: any) { setMsg(e.message); } };
  const compile = async () => {
    const ids = Object.keys(picked).filter((k) => picked[k]);
    if (ids.length === 0) { setMsg('Select reports to compile.'); return; }
    try { await reportingAPI.compile(ids, `Compiled ${myLevel} report`, period); setMsg('✓ Compiled & submitted upward.'); setPicked({}); load(); }
    catch (e: any) { setMsg(e.message); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-up" style={reveal(delay)}>
      <GoldTopBar />
      <div className="p-6">
        <h2 className="font-bold text-slate-900 text-lg mb-1">Reports to management</h2>
        <p className="text-sm text-slate-500 mb-4">Write a report, let the AI draft & analyse it, then submit up the chain ({myLevel || '—'}{childLevel ? ` · compiles ${childLevel}` : ''}).</p>

        <div className="flex flex-wrap gap-2 mb-2">
          {['daily', 'weekly', 'monthly', 'yearly'].map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${period === p ? 'text-white' : 'text-slate-600'}`} style={period === p ? { background: GOLD_DK, borderColor: GOLD_DK } : { borderColor: '#cbd5e1' }}>{p}</button>
          ))}
          <button onClick={aiDraft} disabled={busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: '#7c3aed' }}>🧠 AI draft & analyse</button>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Report title" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Report body (or use AI draft)" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2" />
        <button onClick={submit} className="text-white font-semibold px-5 py-2 rounded-lg text-sm" style={{ background: GOLD_DK }}>Submit report</button>
        {msg && <p className="text-xs mt-2 text-slate-600">{msg}</p>}

        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-800 text-sm">Inbox {childLevel && <span className="text-xs text-slate-400">· incoming {childLevel} reports</span>}</h3>
            {childLevel && <button onClick={compile} className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg" style={{ background: GOLD_DK }}>🧠 Compile selected → forward up</button>}
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {inbox.length === 0 ? <p className="text-sm text-slate-400 py-3">No reports yet.</p> : inbox.map((r) => (
              <div key={r._id} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{r.title} <span className="text-xs text-slate-400">· {r.level} · {r.period} · {r.status}</span></p>
                    <p className="text-xs text-slate-500 line-clamp-2">{r.body}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{r.authorName} · {r.region || r.district || '—'}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {childLevel && r.level === childLevel && <label className="text-[11px] text-slate-500 flex items-center gap-1"><input type="checkbox" checked={!!picked[r._id]} onChange={(e) => setPicked((p) => ({ ...p, [r._id]: e.target.checked }))} />pick</label>}
                    {String(r.author) && r.status !== 'forwarded' && r.status !== 'reviewed' && <button onClick={() => forward(r._id)} className="text-[11px] font-semibold text-indigo-600 hover:underline">Forward ↑</button>}
                    {myLevel === 'executive' && <button onClick={() => review(r._id)} className="text-[11px] font-semibold text-emerald-600 hover:underline">Review ✓</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** National finance office: salary structure, pay officers, summary, AI analysis. */
function FinanceOffice({ delay = 0 }: { delay?: number }) {
  const [summary, setSummary] = useState<any>(null);
  const [structure, setStructure] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [role, setRole] = useState(''); const [gross, setGross] = useState(''); const [allow, setAllow] = useState('');
  const [payEmail, setPayEmail] = useState(''); const [ded, setDed] = useState('');
  const [analysis, setAnalysis] = useState(''); const [msg, setMsg] = useState('');
  const [bulkRows, setBulkRows] = useState<any[]>([]);

  const onBulkFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const parsed = parseCSV(String(reader.result || '')); setBulkRows(parsed); setMsg(`${parsed.length} payment row(s) ready to upload.`); };
    reader.readAsText(file);
  };
  const runBulkPay = async () => {
    if (bulkRows.length === 0) { setMsg('Choose a CSV with payment rows first.'); return; }
    try { const r = await financeAPI.bulkPay(bulkRows); setMsg(`✓ Recorded ${r.createdCount} payment(s)${r.errorCount ? `, ${r.errorCount} row(s) had errors` : ''}.`); setBulkRows([]); load(); }
    catch (e: any) { setMsg(e.message); }
  };

  const load = async () => {
    try { const [s, st, p] = await Promise.all([financeAPI.summary(), financeAPI.structure(), financeAPI.payments()]); setSummary(s); setStructure(st.structure || []); setPayments(p.payments || []); } catch { /* */ }
  };
  useEffect(() => { load(); }, []);

  const saveBand = async () => { if (!role || !gross) { setMsg('Role and gross required.'); return; } try { await financeAPI.upsertStructure({ role, monthlyGross: Number(gross), allowances: Number(allow) || 0 }); setMsg('✓ Salary band saved.'); setRole(''); setGross(''); setAllow(''); load(); } catch (e: any) { setMsg(e.message); } };
  const pay = async () => { if (!payEmail) { setMsg('Officer email required.'); return; } try { const r = await financeAPI.pay(payEmail, undefined, Number(ded) || 0); setMsg(`✓ Paid ${r.payment.officerName} GHS ${r.payment.net}.`); setPayEmail(''); setDed(''); load(); } catch (e: any) { setMsg(e.message); } };
  const analyse = async () => { setAnalysis('Analysing…'); try { const r = await financeAPI.aiAnalysis(); setAnalysis(r.analysis); } catch (e: any) { setAnalysis(e.message); } };
  const c = (n: number) => `GHS ${(n || 0).toLocaleString()}`;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-up" style={reveal(delay)}>
      <GoldTopBar />
      <div className="p-6">
        <h2 className="font-bold text-slate-900 text-lg mb-1">National Finance Office</h2>
        <p className="text-sm text-slate-500 mb-4">Platform finances and payroll. Sellers' personal payment details are never shown here.</p>

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {[['Subscription revenue', summary.subscriptionRevenue], ['Order volume', summary.orderVolume], ['Escrow held', summary.escrowHeld], ['Escrow released', summary.escrowReleased], ['Salary outflow', summary.salaryOutflow]].map(([l, v]) => (
              <div key={l as string} className="border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">{l as string}</p>
                <p className="text-sm font-bold text-slate-800">{c(v as number)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold text-slate-800 text-sm mb-2">Salary structure</h3>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="role (e.g. finance_officer)" className="flex-1 min-w-[120px] border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
              <input value={gross} onChange={(e) => setGross(e.target.value)} placeholder="gross" type="number" className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
              <input value={allow} onChange={(e) => setAllow(e.target.value)} placeholder="allow." type="number" className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
              <button onClick={saveBand} className="text-xs font-semibold text-white px-3 rounded-lg" style={{ background: GOLD_DK }}>Save</button>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {structure.map((s) => <p key={s._id} className="text-xs text-slate-600">{s.role}: {c(s.monthlyGross)} + {c(s.allowances)}</p>)}
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm mb-2">Pay an officer</h3>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <input value={payEmail} onChange={(e) => setPayEmail(e.target.value)} placeholder="officer email" className="flex-1 min-w-[120px] border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
              <input value={ded} onChange={(e) => setDed(e.target.value)} placeholder="deduct" type="number" className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
              <button onClick={pay} className="text-xs font-semibold text-white px-3 rounded-lg" style={{ background: GOLD_DK }}>Pay</button>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {payments.map((p) => <p key={p._id} className="text-xs text-slate-600">{p.officerName} · {p.period} · {c(p.net)}</p>)}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <h3 className="font-semibold text-slate-800 text-sm mb-1">Bulk payroll upload</h3>
          <p className="text-xs text-slate-500 mb-2">Upload a CSV of salary payments instead of typing each one. Columns: <span className="font-mono">officerEmail,period,deductions,gross,allowances</span>. Leave <span className="font-mono">gross</span>/<span className="font-mono">allowances</span> blank to use each officer's salary band.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" accept=".csv,text/csv" onChange={onBulkFile} className="text-xs" />
            <button onClick={runBulkPay} disabled={bulkRows.length === 0} className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg disabled:opacity-50" style={{ background: GOLD_DK }}>Upload {bulkRows.length || ''} payment(s)</button>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <button onClick={analyse} className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg" style={{ background: '#7c3aed' }}>🧠 AI monthly analysis (documentation)</button>
          {analysis && <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mt-2 whitespace-pre-wrap">{analysis}</p>}
        </div>
        {msg && <p className="text-xs mt-2" style={{ color: msg.startsWith('✓') ? '#047857' : '#dc2626' }}>{msg}</p>}
      </div>
    </div>
  );
}

/** Bulk CSV upload — products for sellers, staff for executives/HR. */
function BulkUpload({ mode, delay = 0 }: { mode: 'products' | 'staff'; delay?: number }) {
  const [rows, setRows] = useState<any[]>([]); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const parsed = parseCSV(String(reader.result || '')); setRows(parsed); setMsg(`${parsed.length} rows ready.`); };
    reader.readAsText(file);
  };
  const upload = async () => {
    if (rows.length === 0) { setMsg('Choose a CSV first.'); return; }
    setBusy(true); setMsg('Uploading…');
    try {
      const r = mode === 'products' ? await productsAPI.bulk(rows) : await managementAPI.bulkStaff(rows);
      setMsg(`✓ Created ${r.createdCount}${r.errorCount ? `, ${r.errorCount} errors` : ''}.`); setRows([]);
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  const header = mode === 'products' ? 'name,price,quantity,category,description,origin' : 'fullName,email,role,phone,region,district';
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-up" style={reveal(delay)}>
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#0369a1,#38bdf8)' }} />
      <div className="p-6">
        <h2 className="font-bold text-slate-900 text-lg mb-1">Bulk upload — {mode === 'products' ? 'products' : 'staff'}</h2>
        <p className="text-sm text-slate-500 mb-1">Upload a CSV instead of typing each entry. First row must be headers:</p>
        <code className="text-[11px] bg-slate-50 border border-slate-200 rounded px-2 py-1 block mb-3 overflow-x-auto">{header}</code>
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm mb-3 block" />
        <button onClick={upload} disabled={busy || rows.length === 0} className="text-white font-semibold px-5 py-2 rounded-lg text-sm disabled:opacity-50" style={{ background: '#0369a1' }}>{busy ? 'Uploading…' : `Upload ${rows.length || ''} rows`}</button>
        {msg && <p className="text-xs mt-2" style={{ color: msg.startsWith('✓') ? '#047857' : '#475569' }}>{msg}</p>}
      </div>
    </div>
  );
}

function RoleHomeButton({ role }: { role: string }) {
  const r = (role || '').toLowerCase();
  let href = '/admin/operations'; let label = '🗂️ My office';
  if (/rider|driver|courier|dispatch_rider/.test(r)) { href = '/rider/office'; label = '🛵 My office'; }
  else if (/hr|chro|human/.test(r)) { href = '/hr'; label = '👥 My HR desk'; }
  else if (/finance|account|cfo/.test(r)) { href = '/admin/operations'; label = '💰 Finance desk'; }
  else if (/logistic|fleet|dispatch|warehouse/.test(r)) { href = '/logistics'; label = '🛵 Logistics desk'; }
  else if (/security|compliance/.test(r)) { href = '/admin/security'; label = '🛡️ Security desk'; }
  else if (/region_admin|regional|district/.test(r)) { href = '/admin/region'; label = '🗺️ My jurisdiction'; }
  else if (/ceo|coo|cto|cio|admin|executive/.test(r)) { href = '/admin/control'; label = '📊 Control center'; }
  else if (/commerce|business|customer|relations|operations/.test(r)) { href = '/admin/operations'; label = '🗂️ Operations desk'; }
  return (
    <Link href={href} className="text-sm font-semibold px-4 py-2 rounded-lg border" style={{ background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff' }}>{label}</Link>
  );
}

function OfficerConsole({ me, profile, notifs }: { me: any; profile: RoleProfile; notifs: any[] }) {
  const theme = profile.theme!;
  const DEPT_ACCENT: Record<string, string> = {
    exec: '#C8A24B', operations: '#3b82f6', compliance: '#14b8a6', logistics: '#f59e0b',
    finance: '#C8A24B', crm: '#06b6d4', ai: '#a855f7', sme: '#6366f1', bizdev: '#8b5cf6',
    intl: '#10b981', security: '#ef4444', legal: '#a1a1aa', warehouse: '#eab308',
    procurement: '#14b8a6', regional: '#6366f1', district: '#22c55e', field: '#f97316',
    fleet: '#f59e0b', commerce: '#6366f1', shopping: '#6366f1',
  };
  const deptAccent = DEPT_ACCENT[profile.department] || '#C8A24B';
  const isPartner = profile.persona === 'partner';
  const isLogisticsManager = LOGISTICS_MANAGER_ROLES.includes(profile.role);
  const premium = !isPartner && profile.level <= 2;  // execs + national directorate get the gold treatment
  const isAdminTier = ['admin', 'district_admin'].includes(profile.role);

  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ total: 0, overdue: 0, critical: 0, high: 0 });
  const [channels, setChannels] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskFilter>('all');

  const loadTasks = async () => {
    setLoadingTasks(true);
    try {
      const r = await workflowAPI.inbox();
      setItems(r.inbox || []);
      setSummary(r.summary || { total: 0, overdue: 0 });
    } catch (e: any) {
      setError(e.message || 'Could not load your task inbox.');
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    loadTasks();
    if (!isPartner) officerCommsAPI.channels().then((r) => setChannels(r.channels || [])).catch(() => {});
    if (isAdminTier) adminAPI.stats().then(setStats).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decide = async (id: string, decision: 'approved' | 'rejected' | 'escalated', note: string) => {
    setActing(id); setError('');
    try {
      await workflowAPI.decide(id, { decision, comment: note.trim() || undefined });
      await loadTasks();
    } catch (e: any) {
      setError(e.message || 'Decision failed.');
    } finally {
      setActing(null);
    }
  };

  const filtered = useMemo(() => {
    if (filter === 'critical') return items.filter((i) => i.priority?.tier === 'critical');
    if (filter === 'overdue')  return items.filter((i) => i.currentDueAt && new Date(i.currentDueAt) < new Date());
    if (filter === 'escalated') return items.filter((i) => i.status === 'escalated');
    return items;
  }, [items, filter]);

  const topTasks = filtered.slice(0, 6);
  const jurisdiction = me.district || me.region || 'Ghana (national)';

  const filters: { key: TaskFilter; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: items.length },
    { key: 'critical', label: 'Critical', n: items.filter((i) => i.priority?.tier === 'critical').length },
    { key: 'overdue', label: 'Overdue', n: summary.overdue || 0 },
    { key: 'escalated', label: 'Escalated', n: items.filter((i) => i.status === 'escalated').length },
  ];

  return (
    <div className="min-h-screen pt-8 pb-16 px-4">
      <div className="max-w-7xl mx-auto">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div
          className="relative text-white rounded-2xl p-6 mb-6 shadow-sm overflow-hidden bg-gradient-to-br from-[#0f1228] via-[#181a36] to-[#241b40] animate-fade-in-up"
        >
          {/* gold trim */}
          <div className="absolute top-0 left-0 right-0 h-1" style={{ background: GOLD_GRAD }} />
          {/* department-coloured glow so each dashboard differs while staying dark & legible */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(120% 140% at 88% -25%, ${deptAccent}66 0%, transparent 55%)` }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(90% 120% at 10% 120%, ${deptAccent}22 0%, transparent 50%)` }} />
          <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-start gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl border"
                style={premium ? { background: 'rgba(200,162,75,0.15)', borderColor: GOLD } : { background: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.25)' }}
              >
                {theme.glyph}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border"
                    style={premium ? { background: 'rgba(200,162,75,0.18)', borderColor: GOLD, color: GOLD_LT } : { background: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.25)' }}
                  >
                    {profile.levelLabel}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white/90">{theme.label}</span>
                </div>
                <h1 className="text-2xl font-bold mt-1.5" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>{profile.title}</h1>
                <p className="text-sm text-white/85 mt-1 max-w-2xl">{profile.mission}</p>
                <p className="text-xs text-white/90 mt-2">{me.fullName} · Jurisdiction: {jurisdiction}{me.partnerCode ? ` · Code: ${me.partnerCode}` : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {['admin', 'ceo', 'coo', 'chro', 'national_hr_director'].includes(profile.role) && (
                <Link href="/hr" className="text-sm font-semibold px-4 py-2 rounded-lg border" style={{ background: 'rgba(56,189,248,0.22)', borderColor: 'rgba(56,189,248,0.5)', color: '#fff' }}>👥 HR Office</Link>
              )}
              <RoleHomeButton role={profile.role} />
              {/[12345]/.test(String(profile.level ?? '')) && /admin|director|officer|manager|ceo|coo|cto|cio|cfo|chro/i.test(profile.role) && (
                <Link href="/admin/create-store" className="text-sm font-semibold px-4 py-2 rounded-lg border" style={{ background: 'rgba(16,185,129,0.22)', borderColor: 'rgba(16,185,129,0.5)', color: '#fff' }}>🏪 Create store</Link>
              )}
              <Link href="/ai-console" className="text-sm font-semibold px-4 py-2 rounded-lg border" style={{ background: 'rgba(168,85,247,0.25)', borderColor: 'rgba(168,85,247,0.5)', color: '#fff' }}>🤖 AI Console</Link>
              <Link href="/profile" className="text-sm font-semibold px-4 py-2 rounded-lg border" style={{ background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff' }}>Profile</Link>
              <Link
                href="/admin/inbox"
                className="text-sm font-semibold px-4 py-2 rounded-lg border"
                style={premium ? { background: GOLD, borderColor: GOLD, color: '#1a1505' } : { background: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff' }}
              >
                Open full inbox &rarr;
              </Link>
            </div>
          </div>

          {/* Summary tiles */}
          <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {[
              { k: 'Open tasks', v: summary.total ?? 0, hot: false },
              { k: 'Critical', v: summary.critical ?? 0, hot: (summary.critical ?? 0) > 0 },
              { k: 'High', v: summary.high ?? 0, hot: false },
              { k: 'Overdue', v: summary.overdue ?? 0, hot: (summary.overdue ?? 0) > 0 },
            ].map((s) => (
              <div
                key={s.k}
                className="backdrop-blur-sm border rounded-xl px-4 py-3"
                style={s.hot ? { background: 'rgba(200,162,75,0.18)', borderColor: GOLD } : { background: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.15)' }}
              >
                <p className="text-xs text-white/85 font-semibold uppercase tracking-wide">{s.k}</p>
                <p className="text-2xl font-bold mt-1" style={s.hot ? { color: GOLD_LT } : undefined}>{s.v}</p>
              </div>
            ))}
          </div>
        </div>

        {me.accountStatus === 'pending_review' && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <svg className="w-5 h-5 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
            <div>
              <p className="font-semibold">Account under review</p>
              <p className="text-sm">Some actions are restricted until the review concludes.</p>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-5">
          {/* Left: tasks (+ pulse for admins) */}
          <div className="lg:col-span-2 space-y-5">
            {isPartner && <RiderDeliveries delay={40} />}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-fade-in-up" style={reveal(80)}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-slate-900 text-lg">My tasks</h2>
                <Link href="/admin/inbox" className="text-xs font-semibold hover:underline" style={{ color: GOLD_DK }}>View all &rarr;</Link>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                Workflow items assigned to <span className="font-semibold">{profile.title}</span> in your jurisdiction, ranked by priority.
              </p>

              {/* Priority mix */}
              {items.length > 0 && <div className="mb-4"><PriorityBar items={items} /></div>}

              {/* Quick filters */}
              <div className="flex flex-wrap gap-2 mb-4">
                {filters.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${filter === f.key ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    style={filter === f.key ? { background: GOLD_DK } : undefined}
                  >
                    {f.label} <span className="opacity-80">{f.n}</span>
                  </button>
                ))}
              </div>

              {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>}

              {loadingTasks ? (
                <p className="text-slate-400 text-center py-12">Loading your tasks…</p>
              ) : topTasks.length === 0 ? (
                <div className="border border-dashed border-slate-200 rounded-2xl p-10 text-center">
                  <p className="text-slate-600 font-medium">{filter === 'all' ? 'Your task inbox is clear. 🎉' : `No ${filter} items right now.`}</p>
                  <p className="text-slate-400 text-sm mt-1">New items routed to your role and jurisdiction appear here automatically.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {topTasks.map((it: any) => <TaskCard key={it._id} it={it} acting={acting} onDecide={decide} />)}
                  {filtered.length > topTasks.length && (
                    <Link href="/admin/inbox" className="block text-center text-sm font-semibold py-2 hover:underline" style={{ color: GOLD_DK }}>
                      {filtered.length - topTasks.length} more &rarr;
                    </Link>
                  )}
                </div>
              )}
            </div>

            {isAdminTier && stats && <PanelBoundary name="pulse" fallback={null}><PlatformPulse stats={stats} delay={140} /></PanelBoundary>}
            {isLogisticsManager && <PanelBoundary name="delivery-board" fallback={null}><DeliveryBoard delay={150} /></PanelBoundary>}
            {isLogisticsManager && <PanelBoundary name="rider-approvals" fallback={null}><RiderApprovals delay={158} /></PanelBoundary>}
            {(profile.level <= 3 || ['district_admin', 'district_commerce_officer', 'district_logistics_officer'].includes(profile.role)) && <PanelBoundary name="regional-intel" fallback={null}><RegionalIntelligence delay={166} /></PanelBoundary>}
            {EXEC_ONLY.includes(profile.role) && <PanelBoundary name="staff" fallback={null}><StaffPanel me={me} delay={174} /></PanelBoundary>}
            {PROMO_ROLES.includes(profile.role) && <PanelBoundary name="growth" fallback={null}><GrowthTools delay={182} /></PanelBoundary>}
            {REPORTER_ROLES.includes(profile.role) && <PanelBoundary name="report-user" fallback={null}><ReportUser delay={190} /></PanelBoundary>}
            {profile.persona === 'officer' && <PanelBoundary name="reports" fallback={null}><ReportsPanel profile={profile} delay={198} /></PanelBoundary>}
            {profile.persona === 'officer' && <PanelBoundary name="disputes" fallback={null}><DisputesPanel role={profile.role} accent={deptAccent} /></PanelBoundary>}
            {FINANCE_ROLES.includes(profile.role) && <PanelBoundary name="finance" fallback={null}><FinanceOffice delay={206} /></PanelBoundary>}
            {EXEC_ONLY.includes(profile.role) && <PanelBoundary name="bulk" fallback={null}><BulkUpload mode="staff" delay={214} /></PanelBoundary>}

            <ModulesGrid modules={profile.modules} delay={160} />
            <CapabilitiesCard can={profile.can} cannot={profile.cannot} delay={200} />
          </div>

          {/* Right: tools, channels, notifications */}
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-fade-in-up" style={reveal(120)}>
              <h2 className="font-bold text-slate-900 mb-3">Your tools</h2>
              <div className="space-y-2.5">
                {profile.tools.map((t) => (
                  <Link key={t.id} href={t.href} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-amber-200 hover:bg-amber-50/40 transition-colors">
                    <span className="text-xl leading-none mt-0.5">{t.glyph}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800">{t.label}</span>
                      <span className="block text-xs text-slate-500 leading-snug">{t.desc}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {!isPartner && <ChannelsPreview channels={channels} delay={180} />}
            <AiAgentsCard agents={profile.agents} delay={200} />
            <NotificationsCard notifs={notifs} delay={220} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// BUYER / SELLER DASHBOARD (gold-accented + advanced widgets)
// ═════════════════════════════════════════════════════════════════════════════
function CommerceDashboard({
  me, profile, orders, products, stores, notifs,
}: {
  me: any; profile: RoleProfile;
  orders: any[]; products: any[]; stores: any[]; notifs: any[];
}) {
  const isSeller = profile.persona === 'seller';
  const sub = me.subscription || {};
  const subBanner = isSeller ? subscriptionBanner(sub, stores.length) : null;

  const paidOrders = orders.filter((o: any) => o.paymentStatus === 'paid');
  const revenue = paidOrders.reduce((s: number, o: any) => s + (o.totalAmount || 0), 0);
  const delivered = orders.filter((o: any) => o.status === 'delivered').length;
  const inTransit = orders.filter((o: any) => ['confirmed', 'processing', 'shipped'].includes(o.status)).length;
  const fulfillRate = orders.length ? Math.round((delivered / orders.length) * 100) : 0;

  const stats = isSeller
    ? [
        { label: 'Active listings', value: products.filter((p: any) => p.status === 'active').length, hint: `${products.length} total`, gold: true },
        { label: 'Orders', value: orders.length, hint: `${paidOrders.length} paid` },
        { label: 'Revenue', value: `₵${revenue.toLocaleString()}`, hint: 'lifetime', gold: true },
        { label: 'Fulfilment', value: `${fulfillRate}%`, hint: `${delivered} delivered` },
      ]
    : [
        { label: 'Orders placed', value: orders.length },
        { label: 'Spent', value: `₵${revenue.toLocaleString()}`, hint: 'lifetime', gold: true },
        { label: 'In transit', value: inTransit, hint: 'active deliveries' },
        { label: 'Ghana Card', value: me.ghanaCardStatus === 'verified' ? 'Verified' : 'Pending' },
      ];

  return (
    <div className="min-h-screen pt-8 pb-16 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Buyer discovery banner */}
        {!isSeller && (
          <Link href="/discover" className="block mb-6 rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-700 via-emerald-600 to-green-700 p-5 sm:p-6 hover:shadow-lg transition-shadow animate-fade-in-up">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-white text-lg sm:text-xl font-bold">What are you looking for?</p>
                <p className="text-white/80 text-sm mt-0.5">Search anything across Ghana — by region, district or town. Or snap a photo. 📷</p>
              </div>
              <span className="bg-white text-emerald-700 font-semibold text-sm px-5 py-2.5 rounded-xl shrink-0">Start searching →</span>
            </div>
          </Link>
        )}
        {/* Welcome header */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-6 shadow-sm animate-fade-in-up">
          <GoldTopBar />
          <div className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold" style={{ background: `linear-gradient(135deg, ${GOLD_DK}, ${GOLD_LT})` }}>
                  {me.fullName?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Welcome back</p>
                  <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>{me.fullName}</h1>
                  <p className="text-sm text-slate-500 mt-0.5 capitalize">
                    {me.role?.replace(/_/g, ' ')} · {me.district || me.region || 'Ghana'}
                    {me.verificationBadge && (
                      <span className="inline-flex items-center gap-1 ml-2 text-emerald-700 font-semibold">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                        Verified
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {isSeller && <Link href="/stores/manage" className="text-sm py-2 px-4 rounded-lg font-semibold text-white" style={{ background: 'linear-gradient(180deg,#1f2937,#0f172a)' }}>🏪 Store Office</Link>}
                {isSeller && <Link href="/sell" className="btn-primary text-sm py-2 px-4">+ List a product</Link>}
                {isSeller && <Link href="/seller/promotions" className="text-sm py-2 px-4 rounded-lg font-semibold" style={{ background: 'linear-gradient(180deg,#E7CB77,#C8A24B)', color: '#3a2c0a' }}>🎁 Promotions &amp; Discounts</Link>}
                {!isSeller && <Link href="/catalog" className="btn-primary text-sm py-2 px-4">Browse catalog</Link>}
                <Link href="/messages" className="btn-secondary text-sm py-2 px-4">Messages</Link>
                <Link href="/ai-console" className="btn-secondary text-sm py-2 px-4">🤖 AI Console</Link>
                <Link href="/profile" className="btn-secondary text-sm py-2 px-4">Profile</Link>
              </div>
            </div>
          </div>
        </div>

        {isSeller && <SellerQuickActions />}
        {isSeller && <SellerAnalytics orders={orders} products={products} />}

        {subBanner && (
          <div className={`rounded-2xl p-4 mb-6 border ${subBanner.tone}`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-semibold">{subBanner.title}</p>
                <p className="text-sm opacity-80">{subBanner.message}</p>
              </div>
              {subBanner.action && (
                <Link href="/seller/dues" className="bg-white border border-current font-semibold text-sm px-4 py-2 rounded-xl hover:bg-slate-50">{subBanner.action}</Link>
              )}
            </div>
            {sub.status === 'trial' && (
              <div className="h-1.5 rounded-full bg-white/60 mt-3 overflow-hidden">
                <div className="h-full" style={{ width: `${subBanner.pct}%`, background: GOLD_GRAD }} />
              </div>
            )}
          </div>
        )}

        {me.accountStatus === 'pending_review' && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <svg className="w-5 h-5 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
            <div>
              <p className="font-semibold">Account under review</p>
              <p className="text-sm">Your account is being reviewed by district admins following user reports. Some actions are restricted until the review concludes.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {stats.map((s, i) => <StatCard key={s.label} {...s} delay={i * 60} />)}
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 lg:col-span-2 animate-fade-in-up" style={reveal(80)}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-slate-900 text-lg">{isSeller ? 'Incoming orders' : 'My orders'}</h2>
              <span className="text-xs text-slate-400 font-semibold">{orders.length} total</span>
            </div>

            {orders.length > 0 && (
              <div className="mb-4">
                <StatusBreakdown orders={orders} />
                {isSeller && revenue > 0 && (
                  <>
                    <p className="text-xs text-slate-400 uppercase font-semibold tracking-wide mt-4">Revenue trend</p>
                    <Sparkline orders={paidOrders} />
                  </>
                )}
              </div>
            )}

            {orders.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-slate-400 mb-3">{isSeller ? 'No orders yet — orders from buyers will appear here.' : 'You haven\'t placed any orders yet.'}</p>
                {!isSeller && <Link href="/catalog" className="text-indigo-700 font-semibold text-sm hover:underline">Browse the marketplace &rarr;</Link>}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {orders.map((o: any) => (
                  <div key={o._id} className="py-3 -mx-2 px-2">
                    <Link href={`/track/${o.orderNumber}`} className="flex items-center justify-between hover:bg-slate-50 rounded-lg transition-colors">
                      <div>
                        <p className="font-mono text-sm text-slate-700 font-semibold">{o.orderNumber}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(o.createdAt).toLocaleDateString()} · {isSeller ? `from ${o.buyer?.company || o.buyer?.fullName || 'buyer'}` : `to ${o.seller?.company || o.seller?.fullName || 'seller'}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900 text-sm">{o.currency} {o.totalAmount?.toLocaleString()}</p>
                        <StatusPill status={o.status} paid={o.paymentStatus === 'paid'} />
                      </div>
                    </Link>
                    <div className="flex flex-wrap gap-2 items-center">
                      {isSeller && o.paymentStatus !== 'paid' && <ConfirmPayment orderId={o._id} />}
                      {isSeller && ['confirmed', 'processing', 'ready_for_shipping'].includes(o.status) && (
                        <ArrangeDelivery orderId={o._id} label="🚚 Arrange delivery" />
                      )}
                      {!isSeller && o.status !== 'delivered' && o.status !== 'cancelled' && (
                        <ArrangeDelivery orderId={o._id} label="🛵 Request a rider (pay on delivery)" />
                      )}
                      {!isSeller && Array.isArray(o.items) && o.items.length > 0 && (
                        <BuyAgain order={o} />
                      )}
                    </div>
                    <OrderTracker orderId={o._id} viewerRole={isSeller ? 'seller' : 'buyer'} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-5">
            {!isSeller && <SavedItemsPanel />}
            {isSeller && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-fade-in-up" style={reveal(120)}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-slate-900">My stores</h2>
                  <Link href="/stores/manage" className="text-xs text-indigo-700 font-semibold hover:underline">Manage</Link>
                </div>
                {stores.length === 0 ? (
                  <p className="text-sm text-slate-400 py-3">No stores yet. <Link href="/stores/manage" className="text-indigo-700 font-semibold">Open one &rarr;</Link></p>
                ) : (
                  <div className="space-y-2.5">
                    {stores.map((s: any) => (
                      <Link key={s._id} href={`/store/${s.slug}`} className="flex items-center justify-between py-1.5 hover:text-indigo-700">
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-700 truncate">{s.name}</span>
                          {s.storeCode && <span className="block text-[11px] font-mono" style={{ color: GOLD_DK }}>{s.storeCode}</span>}
                        </span>
                        <span className="text-xs text-slate-400 shrink-0">{s.productCount || 0} items</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            <AiInsights orders={orders} products={products} isSeller={isSeller} delay={140} />
            {isSeller && <BulkUpload mode="products" delay={150} />}
            <AiAgentsCard agents={profile.agents} delay={180} />
            <NotificationsCard notifs={notifs} delay={220} />
          </div>
        </div>

        {/* Role modules + permissions */}
        <div className="grid lg:grid-cols-3 gap-5 mt-5">
          <div className="lg:col-span-2"><ModulesGrid modules={profile.modules} delay={120} /></div>
          <CapabilitiesCard can={profile.can} cannot={profile.cannot} delay={160} />
        </div>

        {/* Payments — how this person pays and (for sellers) gets paid.
            Sellers/partners can withdraw; buyers just manage cards & MoMo. */}
        <div className="grid lg:grid-cols-2 gap-5 mt-5">
          <PanelBoundary name="payments-office" fallback={null}>
            <PaymentsOffice canWithdraw={isSeller} accent="#C8A24B" />
          </PanelBoundary>
          <PanelBoundary name="disputes-commerce" fallback={null}>
            <DisputesPanel role={profile.role} accent="#C8A24B" />
          </PanelBoundary>
        </div>

        {isSeller && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-5 animate-fade-in-up" style={reveal(140)}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-900 text-lg">My products</h2>
              <Link href="/sell" className="text-sm text-indigo-700 font-semibold hover:underline">+ Add new</Link>
            </div>
            {products.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-slate-400 mb-3">No products listed yet.</p>
                <Link href="/sell" className="text-indigo-700 font-semibold text-sm hover:underline">Create your first listing &rarr;</Link>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {products.map((p: any) => (
                  <div key={p._id} className="border border-slate-200 rounded-xl p-4 hover:border-amber-200 transition-colors">
                    {p.images?.[0] && (
                      <div className="w-full h-24 rounded-lg overflow-hidden bg-slate-100 mb-2 relative">
                        <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover" />
                        {p.images.length > 1 && <span className="absolute bottom-1 right-1 bg-black/55 text-white text-[10px] px-1.5 py-0.5 rounded-full">📷 {p.images.length}</span>}
                      </div>
                    )}
                    <p className="font-semibold text-slate-800 text-sm line-clamp-2">{p.title}</p>
                    <p className="text-xs text-slate-400 mt-1">{p.category}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-sm font-bold text-slate-900">{p.currency} {p.pricePerUnit?.toLocaleString()}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${p.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{p.status}</span>
                    </div>
                    <Link href={`/sell/edit/${p._id}`} className="mt-3 block text-center text-xs font-semibold py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">✏️ Edit listing &amp; photos</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [profile, setProfile] = useState<RoleProfile | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/dashboard'); return; }
    (async () => {
      try {
        const u = await authAPI.me();
        const user = u.user || u;
        setMe(user);
        const prof = getRoleProfile(user.role);
        setProfile(prof);

        if (prof.persona === 'officer' || prof.persona === 'partner') {
          const notes = await notificationsAPI.list().catch(() => ({ notifications: [] }));
          setNotifs((notes as any).notifications || []);
        } else {
          const isSeller = prof.persona === 'seller';
          const [ord, prod, st, notes] = await Promise.all([
            (isSeller ? ordersAPI.sellerOrders({ limit: 8 }) : ordersAPI.myOrders({ limit: 8 })).catch(() => ({ orders: [] })),
            isSeller ? productsAPI.mine({ limit: 8 }).catch(() => ({ products: [] })) : Promise.resolve({ products: [] }),
            isSeller ? storesAPI.mine().catch(() => ({ stores: [] })) : Promise.resolve({ stores: [] }),
            notificationsAPI.list().catch(() => ({ notifications: [] })),
          ]);
          setOrders((ord as any).orders || []);
          setProducts((prod as any).products || []);
          setStores((st as any).stores || []);
          setNotifs((notes as any).notifications || []);
        }
      } catch {
        router.push('/auth/login?redirect=/dashboard');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-400">
        <svg className="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
        Loading your dashboard…
      </div>
    );
  }
  if (!me || !profile) return null;

  const isMgr = ['admin', 'district_admin', 'region_admin', 'ceo', 'coo', 'national_logistics_director', 'national_operations_director', 'logistics_officer', 'regional_logistics_officer', 'district_logistics_officer'].includes(profile.role);
  const dash = (profile.persona === 'officer' || profile.persona === 'partner')
    ? <OfficerConsole me={me} profile={profile} notifs={notifs} />
    : <CommerceDashboard me={me} profile={profile} orders={orders} products={products} stores={stores} notifs={notifs} />;
  return (
    <>
      {dash}
      <AssistantChatbot
        name={me.fullName}
        roleTitle={profile.title}
        persona={profile.persona}
        context={{ orders: orders.length, isManager: isMgr }}
      />
    </>
  );
}
