'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { payoutsAPI } from '../lib/api';

/**
 * A warm first-run guide.
 *
 * New sellers and buyers land on a dashboard full of widgets that are mostly
 * empty, which is discouraging and confusing. This shows a short, friendly
 * checklist of the next steps that actually matter for THEM — and quietly
 * disappears once they're set up, so it never nags an established user.
 *
 * Sellers: add a payout method → list a product → make a first sale.
 * Buyers:  browse → place a first order.
 */

type Step = { done: boolean; label: string; desc: string; href: string; cta: string };

export default function GettingStarted({
  isSeller, productCount, orderCount, storeCount,
}: { isSeller: boolean; productCount: number; orderCount: number; storeCount: number }) {
  const [hasPayout, setHasPayout] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isSeller) { setHasPayout(true); return; }
    payoutsAPI.methods()
      .then((r) => setHasPayout((r.methods || []).some((m: any) => m.canPayOut)))
      .catch(() => setHasPayout(true));   // don't block on a failed check
  }, [isSeller]);

  if (hasPayout === null) return null;   // still checking

  const steps: Step[] = isSeller
    ? [
        { done: hasPayout, label: 'Set up how you get paid', desc: 'Add mobile money or a bank account so we can send your earnings.', href: '/dashboard?setup=payout', cta: 'Add payout method' },
        { done: storeCount > 0, label: 'Open your store', desc: 'Create your storefront — it takes two minutes.', href: '/stores/manage', cta: 'Create store' },
        { done: productCount > 0, label: 'List your first product', desc: 'Add something to sell and reach buyers nationwide.', href: '/sell', cta: 'List a product' },
        { done: orderCount > 0, label: 'Make your first sale', desc: 'Share your store link and start earning.', href: '/stores/manage', cta: 'View store' },
      ]
    : [
        { done: true, label: 'Welcome to NationMart', desc: 'Ghana’s marketplace — from farm produce to building materials.', href: '/discover', cta: 'Explore' },
        { done: orderCount > 0, label: 'Place your first order', desc: 'Find something you need and check out securely.', href: '/catalog', cta: 'Browse catalog' },
      ];

  const doneCount = steps.filter((s) => s.done).length;
  // Everything done → don't show anything. Established users never see this.
  if (doneCount === steps.length) return null;

  const nextStep = steps.find((s) => !s.done);
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white overflow-hidden mb-6">
      <div className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h3 className="font-bold text-slate-900">
            {isSeller ? 'Get your shop up and running' : 'Getting started'}
          </h3>
          <span className="text-xs font-semibold text-indigo-600">{doneCount} of {steps.length} done</span>
        </div>

        {/* progress */}
        <div className="h-1.5 rounded-full bg-indigo-100 overflow-hidden mb-4">
          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
        </div>

        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={i}
              className={`flex items-center gap-3 rounded-xl border p-3 ${s.done ? 'border-emerald-200 bg-emerald-50/40' : s === nextStep ? 'border-indigo-300 bg-white shadow-sm' : 'border-slate-200 bg-white'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${s.done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {s.done ? '✓' : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${s.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{s.label}</p>
                {!s.done && <p className="text-xs text-slate-500 mt-0.5">{s.desc}</p>}
              </div>
              {!s.done && s === nextStep && (
                <Link href={s.href} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white shrink-0">
                  {s.cta}
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
