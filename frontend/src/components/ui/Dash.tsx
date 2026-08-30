'use client';
import Link from 'next/link';
import { ReactNode } from 'react';

/**
 * Shared dashboard layout primitives so every officer/admin dashboard
 * shares one clean, friendly visual language.
 */

const TONES: Record<string, { text: string; chip: string; bar: string }> = {
  emerald: { text: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
  indigo: { text: 'text-indigo-700', chip: 'bg-indigo-50 text-indigo-700', bar: 'bg-indigo-500' },
  amber: { text: 'text-amber-700', chip: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  rose: { text: 'text-rose-600', chip: 'bg-rose-50 text-rose-700', bar: 'bg-rose-500' },
  slate: { text: 'text-slate-800', chip: 'bg-slate-100 text-slate-600', bar: 'bg-slate-400' },
  sky: { text: 'text-sky-700', chip: 'bg-sky-50 text-sky-700', bar: 'bg-sky-500' },
  violet: { text: 'text-violet-700', chip: 'bg-violet-50 text-violet-700', bar: 'bg-violet-500' },
};
export type Tone = keyof typeof TONES;

/** Full-page wrapper with a soft background. */
export function DashPage({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/60 pb-20">{children}</div>;
}

/** Consistent gradient page header with eyebrow, title, subtitle and actions. */
export function DashHeader({
  eyebrow, title, subtitle, icon, actions, accent = 'indigo',
}: {
  eyebrow?: string; title: string; subtitle?: string; icon?: string;
  actions?: ReactNode; accent?: Tone;
}) {
  const grad: Record<string, string> = {
    indigo: 'from-slate-900 via-slate-900 to-indigo-900',
    emerald: 'from-slate-900 via-slate-900 to-emerald-900',
    rose: 'from-slate-900 via-slate-900 to-rose-900',
    violet: 'from-slate-900 via-slate-900 to-violet-900',
    amber: 'from-slate-900 via-slate-900 to-amber-800',
    sky: 'from-slate-900 via-slate-900 to-sky-900',
    slate: 'from-slate-900 to-slate-800',
  };
  return (
    <div className={`bg-gradient-to-br ${grad[accent] || grad.indigo}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          {icon && (
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-2xl shrink-0">{icon}</div>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-white/55">{eyebrow}</p>}
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">{title}</h1>
            {subtitle && <p className="text-sm text-white/70 mt-1">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}

/** A header action button/link styled for the dark header. */
export function HeaderAction({ href, onClick, children, primary }: { href?: string; onClick?: () => void; children: ReactNode; primary?: boolean }) {
  const cls = `text-sm font-semibold px-4 py-2 rounded-xl border transition-colors ${primary ? 'bg-white text-slate-900 border-white hover:bg-white/90' : 'bg-white/10 text-white border-white/25 hover:bg-white/20'}`;
  return href ? <Link href={href} className={cls}>{children}</Link> : <button onClick={onClick} className={cls}>{children}</button>;
}

/** Centered content container that lines up with the header. */
export function DashBody({ children }: { children: ReactNode }) {
  return <div className="max-w-6xl mx-auto px-4 sm:px-6 -mt-5 relative z-10 space-y-5">{children}</div>;
}

/** Pill tab bar. */
export function TabBar({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap bg-white/70 backdrop-blur rounded-2xl p-1.5 border border-slate-200 w-fit shadow-sm">
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={`text-sm font-semibold px-4 py-2 rounded-xl transition-all ${active === t.key ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Responsive grid for stat cards. */
export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = cols === 2 ? 'sm:grid-cols-2' : cols === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4';
  return <div className={`grid grid-cols-2 ${c} gap-3`}>{children}</div>;
}

/** A single KPI/stat card. */
export function Stat({ label, value, tone = 'slate', sub, icon }: { label: string; value: ReactNode; tone?: Tone; sub?: string; icon?: string }) {
  const t = TONES[tone] || TONES.slate;
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <p className={`text-2xl font-bold ${t.text} leading-none`}>{value}</p>
        {icon && <span className={`text-xs w-7 h-7 rounded-lg flex items-center justify-center ${t.chip}`}>{icon}</span>}
      </div>
      <p className="text-xs text-slate-500 mt-2 font-medium">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/** A titled content panel. */
export function Panel({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200/80 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 pt-5 pb-1">
          {title && <h3 className="font-bold text-slate-900 text-sm">{title}</h3>}
          {action}
        </div>
      )}
      <div className="p-5 pt-3">{children}</div>
    </div>
  );
}

/** Simple empty-state line. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-400 py-2">{children}</p>;
}

/** A tiny horizontal bar chart row (label + value). */
export function MiniBars({ data, tone = 'indigo', fmt }: { data: { label: string; value: number }[]; tone?: Tone; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const t = TONES[tone] || TONES.indigo;
  return (
    <div className="flex items-end justify-between gap-2 h-28">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[10px] text-slate-400">{fmt ? fmt(d.value) : d.value}</span>
          <div className={`w-full rounded-t ${t.bar}`} style={{ height: `${Math.max(4, (d.value / max) * 88)}px`, opacity: 0.85 }} title={`${d.label}: ${fmt ? fmt(d.value) : d.value}`} />
          <span className="text-[10px] text-slate-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
