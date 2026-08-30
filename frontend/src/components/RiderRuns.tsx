'use client';
import { useEffect, useState } from 'react';
import { deliveryAPI } from '../lib/api';

/**
 * Delivery runs, grouped for the rider.
 *
 * A buyer who ordered from three shops shows up as ONE run with three pickup
 * stops and a single drop-off — so the rider collects everything in one trip
 * instead of criss-crossing town on three separate jobs. Multi-store runs are
 * highlighted and sorted first, because those are the ones where grouping saves
 * the most time.
 */

type Pickup = {
  deliveryId: string; trackingNumber: string; orderNumber: string;
  storeName: string; status: string; pickupDistrict: string;
  pickupLat: number; pickupLng: number; weightKg: number; fee: number;
};
type Batch = {
  buyerId: string; buyerName: string; buyerPhone: string;
  dropoff: { address: string; district: string; lat: number; lng: number };
  pickups: Pickup[]; totalFee: number; parcels: number; multiStore: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  assigned: 'To collect', accepted: 'Accepted', picked_up: 'Picked up', in_transit: 'On the way',
};

export default function RiderRuns({ accent = '#0f766e' }: { accent?: string }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [multiCount, setMultiCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try {
      const r = await deliveryAPI.batches();
      setBatches(r.batches || []);
      setMultiCount(r.multiStoreBatches || 0);
    } catch (e: any) {
      setErr(e.message || 'Could not load your runs.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (loading) return null;
  if (batches.length === 0) return null;

  // Build a Google Maps route: all pickups in order, then the drop-off.
  function routeUrl(b: Batch): string {
    const stops = b.pickups
      .filter((p) => p.pickupLat && p.pickupLng)
      .map((p) => `${p.pickupLat},${p.pickupLng}`);
    const dest = b.dropoff?.lat && b.dropoff?.lng ? `${b.dropoff.lat},${b.dropoff.lng}` : '';
    if (!dest) return '';
    const waypoints = stops.length ? `&waypoints=${stops.join('|')}` : '';
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}${waypoints}&travelmode=driving`;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="h-1 w-full" style={{ background: accent }} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h3 className="font-bold text-slate-800 text-lg">Your delivery runs</h3>
          {multiCount > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: `${accent}15`, color: accent }}>
              {multiCount} multi-store {multiCount === 1 ? 'run' : 'runs'}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Parcels going to the same buyer are grouped so you collect them all in one trip.
        </p>

        {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{err}</div>}

        <div className="space-y-3">
          {batches.map((b) => {
            const route = routeUrl(b);
            return (
              <div key={b.buyerId}
                className="rounded-xl border p-4"
                style={b.multiStore ? { borderColor: accent, background: `${accent}08` } : { borderColor: '#e2e8f0' }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{b.buyerName || 'Buyer'}</span>
                      {b.multiStore && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-white" style={{ background: accent }}>
                          {b.pickups.length} stops
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Deliver to {b.dropoff?.address || b.dropoff?.district || 'buyer'}
                      {b.buyerPhone ? ` · ${b.buyerPhone}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold" style={{ color: accent }}>₵{b.totalFee.toLocaleString()}</p>
                    <p className="text-[11px] text-slate-400">{b.parcels} {b.parcels === 1 ? 'parcel' : 'parcels'}</p>
                  </div>
                </div>

                {/* Pickup stops */}
                <div className="mt-3 space-y-1.5">
                  {b.pickups.map((p, i) => (
                    <div key={p.deliveryId} className="flex items-center gap-2.5 text-sm">
                      <span className="w-5 h-5 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0" style={{ background: accent }}>{i + 1}</span>
                      <span className="font-medium text-slate-700 truncate">{p.storeName}</span>
                      <span className="text-xs text-slate-400">· {p.pickupDistrict || ''}</span>
                      <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                        {STATUS_LABEL[p.status] || p.status}
                      </span>
                    </div>
                  ))}
                  {/* Final drop */}
                  <div className="flex items-center gap-2.5 text-sm pt-1">
                    <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0">★</span>
                    <span className="font-medium text-slate-700">Drop at {b.buyerName?.split(' ')[0] || 'buyer'}</span>
                  </div>
                </div>

                {route && (
                  <a href={route} target="_blank" rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg text-white"
                    style={{ background: accent }}>
                    🧭 Navigate this run
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
