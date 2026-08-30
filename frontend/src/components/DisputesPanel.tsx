'use client';
import { useEffect, useState } from 'react';
import { disputesAPI } from '../lib/api';

/**
 * Disputes & refunds, from every angle.
 *
 *   • buyer   — see disputes they raised, add evidence, withdraw
 *   • seller  — see disputes against them, add their side
 *   • officer — the queue (overdue first), claim, and decide
 *
 * Raising a dispute is done from an order, not here; this is the tracking and
 * resolution surface.
 */

const STATUS_STYLE: Record<string, { chip: string; label: string }> = {
  open: { chip: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Open' },
  investigating: { chip: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Investigating' },
  resolved_buyer: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Refunded' },
  resolved_seller: { chip: 'bg-slate-100 text-slate-600 border-slate-200', label: 'Closed — seller' },
  withdrawn: { chip: 'bg-slate-100 text-slate-500 border-slate-200', label: 'Withdrawn' },
};

const REASON_LABEL: Record<string, string> = {
  not_delivered: 'Never arrived', wrong_item: 'Wrong item', damaged: 'Damaged',
  not_as_described: 'Not as described', quantity_short: 'Quantity short',
  late: 'Too late', other: 'Other',
};

export default function DisputesPanel({
  role, accent = '#C8A24B',
}: { role: string; accent?: string }) {
  const isOfficer = !['buyer', 'seller', 'reseller', 'wholesaler', 'manufacturer', 'rider', 'driver'].includes(role);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    setErr('');
    try {
      const r = isOfficer ? await disputesAPI.queue() : await disputesAPI.mine();
      setDisputes(r.disputes || []);
    } catch (e: any) {
      setErr(e.message || 'Could not load disputes.');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (loading) return null;
  if (!isOfficer && disputes.length === 0) return null;   // nothing to show a buyer/seller

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="h-1 w-full" style={{ background: accent }} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg">
            {isOfficer ? 'Dispute desk' : 'My disputes'}
          </h3>
          {isOfficer && (
            <span className="text-xs text-slate-500">{disputes.length} in queue</span>
          )}
        </div>

        {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{err}</div>}

        <div className="space-y-2">
          {disputes.map((d) => (
            <div key={d.id} className="rounded-xl border border-slate-200">
              <button onClick={() => setOpen(open === d.id ? null : d.id)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 text-sm">
                    {d.orderNumber || d.reference}
                    {d.overdue && <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">Overdue</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {REASON_LABEL[d.reason] || d.reason} · claim ₵{Number(d.claimAmount).toLocaleString()}
                  </div>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_STYLE[d.status]?.chip}`}>
                  {STATUS_STYLE[d.status]?.label || d.status}
                </span>
              </button>

              {open === d.id && (
                <DisputeDetail
                  id={d.id} role={role} isOfficer={isOfficer} accent={accent}
                  onChange={load}
                />
              )}
            </div>
          ))}
          {isOfficer && disputes.length === 0 && (
            <div className="text-sm text-slate-400 py-4 text-center">The queue is clear. 🎉</div>
          )}
        </div>
      </div>
    </div>
  );
}

function DisputeDetail({
  id, role, isOfficer, accent, onChange,
}: { id: string; role: string; isOfficer: boolean; accent: string; onChange: () => void }) {
  const [data, setData] = useState<{ dispute: any; evidence: any[] } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    try { setData(await disputesAPI.get(id)); } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!data) return <div className="px-3 pb-3 text-sm text-slate-400">Loading…</div>;
  const d = data.dispute;
  const closed = ['resolved_buyer', 'resolved_seller', 'withdrawn'].includes(d.status);

  async function addEvidence() {
    if (!note.trim()) return;
    setBusy(true); setErr('');
    try { await disputesAPI.addEvidence(id, note.trim()); setNote(''); await load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function withdraw() {
    setBusy(true); setErr('');
    try { await disputesAPI.withdraw(id); onChange(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="px-3 pb-3 border-t border-slate-100">
      {d.details && <p className="text-sm text-slate-600 mt-3">{d.details}</p>}

      <div className="mt-3 space-y-1.5">
        {data.evidence.map((e) => (
          <div key={e.id} className="text-xs bg-slate-50 rounded-lg p-2">
            <span className="font-medium text-slate-700">{e.author_name}</span>
            <span className="text-slate-400"> · {e.author_role}</span>
            <div className="text-slate-600 mt-0.5">{e.body}</div>
          </div>
        ))}
      </div>

      {err && <div className="mt-2 text-xs text-red-600">{err}</div>}

      {!closed && (
        <div className="mt-3">
          <textarea value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Add evidence or a note…" rows={2}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={addEvidence} disabled={busy || !note.trim()}
              className="text-sm px-3 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: accent }}>
              Add
            </button>
            {!isOfficer && role === 'buyer' && (
              <button onClick={withdraw} disabled={busy}
                className="text-sm px-3 py-1.5 rounded-lg border border-slate-200">
                Withdraw dispute
              </button>
            )}
          </div>

          {isOfficer && <OfficerResolve id={id} claim={Number(d.claimAmount)} accent={accent} onChange={onChange} />}
        </div>
      )}

      {closed && d.resolution && (
        <div className="mt-3 text-xs bg-slate-50 rounded-lg p-2 text-slate-600">
          <span className="font-medium">Resolution:</span> {d.resolution}
        </div>
      )}
    </div>
  );
}

function OfficerResolve({
  id, claim, accent, onChange,
}: { id: string; claim: number; accent: string; onChange: () => void }) {
  const [outcome, setOutcome] = useState<'refund_buyer' | 'favour_seller'>('refund_buyer');
  const [refundAmount, setRefundAmount] = useState(String(claim));
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function decide() {
    if (!resolution.trim()) { setErr('A written reason is required.'); return; }
    setBusy(true); setErr('');
    try {
      await disputesAPI.resolve(id, {
        outcome,
        refundAmount: outcome === 'refund_buyer' ? Number(refundAmount) : undefined,
        resolution: resolution.trim(),
      });
      onChange();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-semibold text-slate-600 mb-2">Decide this dispute</div>
      <div className="flex gap-2 mb-2">
        <button onClick={() => setOutcome('refund_buyer')}
          className={`text-xs px-3 py-1.5 rounded-lg border ${outcome === 'refund_buyer' ? 'bg-white border-emerald-300 text-emerald-700' : 'border-slate-200'}`}>
          Refund buyer
        </button>
        <button onClick={() => setOutcome('favour_seller')}
          className={`text-xs px-3 py-1.5 rounded-lg border ${outcome === 'favour_seller' ? 'bg-white border-slate-400' : 'border-slate-200'}`}>
          Favour seller
        </button>
      </div>
      {outcome === 'refund_buyer' && (
        <div className="mb-2">
          <label className="text-xs text-slate-500">Refund amount (₵), up to ₵{claim.toLocaleString()}</label>
          <input value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} inputMode="decimal"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
        </div>
      )}
      <textarea value={resolution} onChange={(e) => setResolution(e.target.value)}
        placeholder="Reason for the decision (required)…" rows={2}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
      <button onClick={decide} disabled={busy}
        className="mt-2 text-sm px-3 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: accent }}>
        {busy ? 'Recording…' : 'Record decision'}
      </button>
    </div>
  );
}
