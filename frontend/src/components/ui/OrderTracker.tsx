'use client';
import { useEffect, useRef, useState } from 'react';
import { deliveryAPI, messagesAPI } from '../../lib/api';

const STAGE_LABELS: Record<string, string> = {
  pending_assignment: 'Finding a rider',
  assigned: 'Rider assigned',
  accepted: 'Rider accepted',
  picked_up: 'Item collected',
  in_transit: 'On the way',
  delivered: 'Delivered',
  failed: 'Problem',
  cancelled: 'Cancelled',
};
const STAGE_ORDER = ['assigned', 'accepted', 'picked_up', 'in_transit', 'delivered'];

// What status a rider can move to next (mirrors backend transitions).
const RIDER_NEXT: Record<string, { status: string; label: string }[]> = {
  assigned: [{ status: 'accepted', label: 'Accept job' }],
  accepted: [{ status: 'picked_up', label: 'I have collected the item' }],
  picked_up: [{ status: 'in_transit', label: "I'm on the way" }],
  in_transit: [{ status: 'delivered', label: 'Delivered to buyer' }],
};

export default function OrderTracker({ orderId, viewerRole }: { orderId: string; viewerRole: 'buyer' | 'seller' | 'rider' }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'track' | 'chat'>('track');
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    deliveryAPI.byOrder(orderId).then((r) => setD(r.delivery)).catch(() => {});
  };
  useEffect(() => { load(); /* initial */ }, [orderId]);
  // Poll while the panel is open so updates appear without refresh.
  useEffect(() => {
    if (!open) return;
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [open, orderId]);

  if (!d) return null;
  const rider = d.rider;
  const stage = d.status;

  return (
    <div className="mt-2 w-full">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs">
          <span className="font-semibold text-slate-700">🛵 {STAGE_LABELS[stage] || stage}</span>
          {rider?.fullName
            ? <span className="text-slate-500"> · {rider.fullName}{rider.phone ? ` · ${rider.phone}` : ''}</span>
            : <span className="text-slate-400"> · no rider yet</span>}
          {d.riderLocationText && <span className="text-emerald-700"> · 📍 {d.riderLocationText}</span>}
        </div>
        <div className="flex gap-2">
          {rider?.phone && <a href={`tel:${rider.phone}`} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white">📞</a>}
          <button onClick={() => { setOpen((o) => !o); setTab('track'); }} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-white">
            {open ? 'Hide' : 'Track / Chat'}
          </button>
        </div>
      </div>

      {open && (
        <div className="border border-slate-200 border-t-0 rounded-b-xl bg-white -mt-1 pt-3 px-3 pb-3">
          <div className="flex gap-2 mb-3">
            <button onClick={() => setTab('track')} className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${tab === 'track' ? 'bg-indigo-600 text-white' : 'border border-slate-200'}`}>Tracking</button>
            <button onClick={() => setTab('chat')} className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${tab === 'chat' ? 'bg-indigo-600 text-white' : 'border border-slate-200'}`}>Chat</button>
          </div>

          {tab === 'track' ? (
            <TrackPanel d={d} viewerRole={viewerRole} stage={stage} onChanged={load} />
          ) : (
            <ChatPanel orderId={orderId} />
          )}
        </div>
      )}
    </div>
  );
}

function TrackPanel({ d, viewerRole, stage, onChanged }: { d: any; viewerRole: string; stage: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [locText, setLocText] = useState('');
  const isRider = viewerRole === 'rider';
  const currentIdx = STAGE_ORDER.indexOf(stage);

  const setStatus = async (status: string) => {
    setBusy(true);
    try { await deliveryAPI.setStatus(d._id, { status }); onChanged(); } catch { /* */ } finally { setBusy(false); }
  };
  const shareTyped = async () => {
    if (!locText.trim()) return;
    setBusy(true);
    try { await deliveryAPI.shareLocation(d._id, { locationText: locText.trim() }); setLocText(''); onChanged(); } catch { /* */ } finally { setBusy(false); }
  };
  const shareGPS = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      setBusy(true);
      try { await deliveryAPI.shareLocation(d._id, { lat: pos.coords.latitude, lng: pos.coords.longitude, locationText: 'Shared live GPS location' }); onChanged(); } catch { /* */ } finally { setBusy(false); }
    });
  };

  return (
    <div>
      {/* Timeline */}
      <div className="flex items-center justify-between mb-3">
        {STAGE_ORDER.map((s, i) => {
          const done = currentIdx >= i && currentIdx >= 0;
          return (
            <div key={s} className="flex-1 flex flex-col items-center text-center">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>{done ? '✓' : i + 1}</div>
              <span className={`text-[9px] mt-1 ${done ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>{STAGE_LABELS[s]}</span>
            </div>
          );
        })}
      </div>

      {d.riderLocationText && (
        <p className="text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-2 text-emerald-800">📍 Rider location: <span className="font-semibold">{d.riderLocationText}</span></p>
      )}

      {(d.fee != null) && (
        <p className="text-xs text-slate-500 mb-2">Delivery: <span className="font-semibold text-slate-700">₵{d.fee}</span>{d.distanceKm ? ` · ~${d.distanceKm} km` : ''}{d.etaMinutes ? ` · ~${d.etaMinutes} min` : ''}</p>
      )}

      {/* Recent events */}
      <div className="space-y-1 max-h-28 overflow-y-auto mb-2">
        {(d.events || []).slice(-6).reverse().map((e: any, i: number) => (
          <p key={i} className="text-[11px] text-slate-500">• {STAGE_LABELS[e.status] || e.status}{e.note ? ` — ${e.note}` : ''} <span className="text-slate-300">{new Date(e.at).toLocaleString()}</span></p>
        ))}
      </div>

      {/* Rider controls */}
      {isRider && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {(RIDER_NEXT[stage] || []).map((n) => (
              <button key={n.status} onClick={() => setStatus(n.status)} disabled={busy}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-50">{n.label}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={locText} onChange={(e) => setLocText(e.target.value)} placeholder="Type where you are now (e.g. Tetteh Quarshie roundabout)"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-xs" />
            <button onClick={shareTyped} disabled={busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 disabled:opacity-50">Share</button>
            <button onClick={shareGPS} disabled={busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-50">📍 GPS</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatPanel({ orderId }: { orderId: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = () => messagesAPI.orderThread(orderId).then((r) => setMessages(r.messages || [])).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [orderId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { await messagesAPI.sendOrderMessage(orderId, text.trim()); setText(''); await load(); } catch { /* */ } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="max-h-44 overflow-y-auto space-y-2 mb-2 bg-slate-50 rounded-lg p-2">
        {messages.length === 0 && <p className="text-xs text-slate-400 text-center py-3">No messages yet. Say hello — the buyer, seller and rider can all see this thread.</p>}
        {messages.map((m) => (
          <div key={m._id} className="text-xs">
            <span className="font-semibold text-slate-700">{m.sender?.fullName || 'User'}</span>
            <span className="text-slate-300 ml-1">{m.sender?.role}</span>
            <p className="text-slate-600">{m.body}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Message buyer / seller / rider…" className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-xs" />
        <button onClick={send} disabled={busy} className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-50">Send</button>
      </div>
    </div>
  );
}
