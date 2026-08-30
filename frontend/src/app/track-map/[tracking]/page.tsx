'use client';
import { useEffect, useRef, useState } from 'react';
import { use } from 'react';
import { deliveryAPI } from '../../../lib/api';

const GHANA_CENTER = { lat: 6.6, lng: -1.6 };
const REGION_COORDS: Record<string, { lat: number; lng: number }> = {
  'greater accra': { lat: 5.6, lng: -0.19 }, ashanti: { lat: 6.69, lng: -1.62 },
  western: { lat: 4.9, lng: -1.76 }, central: { lat: 5.1, lng: -1.25 },
  eastern: { lat: 6.1, lng: -0.26 }, volta: { lat: 6.6, lng: 0.47 },
  northern: { lat: 9.4, lng: -0.84 }, bono: { lat: 7.34, lng: -2.33 },
  'upper east': { lat: 10.79, lng: -0.86 }, 'upper west': { lat: 10.06, lng: -2.5 },
};
const coordFor = (region?: string, fallback = GHANA_CENTER) =>
  (region && REGION_COORDS[region.toLowerCase()]) || fallback;

export default function TrackMapPage({ params }: { params: Promise<{ tracking: string }> }) {
  const { tracking } = use(params);
  const mapRef = useRef<any>(null);
  const riderMarkerRef = useRef<any>(null);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');

  // Load Leaflet from CDN once.
  useEffect(() => {
    const w = window as any;
    if (w.L) return;
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    js.async = true; document.body.appendChild(js);
  }, []);

  const fetchData = async () => {
    try { const r = await deliveryAPI.publicTrack(tracking); setD(r.delivery); }
    catch (e: any) { setErr(e.message || 'Not found'); }
  };
  useEffect(() => { fetchData(); const t = setInterval(fetchData, 15000); return () => clearInterval(t); }, [tracking]);

  // Render / update the map when data arrives.
  useEffect(() => {
    const w = window as any;
    if (!d || !w.L) { const id = setTimeout(() => setD((x: any) => (x ? { ...x } : x)), 400); return () => clearTimeout(id); }
    const L = w.L;
    const pickup = coordFor(d.pickupRegion);
    const dropoff = coordFor(d.dropoffRegion, pickup);
    if (!mapRef.current) {
      mapRef.current = L.map('track-map').setView([pickup.lat, pickup.lng], 8);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(mapRef.current);
      L.marker([pickup.lat, pickup.lng]).addTo(mapRef.current).bindPopup('Pickup');
      L.marker([dropoff.lat, dropoff.lng]).addTo(mapRef.current).bindPopup('Destination');
      L.polyline([[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]], { color: '#9A7A2E', dashArray: '6' }).addTo(mapRef.current);
    }
    if (d.riderLat && d.riderLng) {
      const pos = [d.riderLat, d.riderLng];
      if (riderMarkerRef.current) riderMarkerRef.current.setLatLng(pos);
      else riderMarkerRef.current = L.circleMarker(pos, { radius: 9, color: '#C8A24B', fillColor: '#C8A24B', fillOpacity: 1 }).addTo(mapRef.current).bindPopup('Rider');
      mapRef.current.panTo(pos);
    }
  }, [d]);

  if (err) return <div className="min-h-[60vh] flex items-center justify-center text-slate-500">{err}</div>;

  return (
    <div className="min-h-screen bg-slate-50 pt-6 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#9A7A2E,#E7CB77,#C8A24B)' }} />
          <div className="p-5">
            <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>Live tracking</h1>
            {d ? (
              <p className="text-sm text-slate-500 mt-1">
                {d.trackingNumber} · <span className="capitalize font-semibold">{d.status?.replace(/_/g, ' ')}</span>
                {' · '}~{d.distanceKm}km · ETA {d.etaMinutes}min{d.rider ? ` · Rider: ${d.rider.fullName}` : ''}
              </p>
            ) : <p className="text-sm text-slate-400 mt-1">Loading…</p>}
            <div id="track-map" className="mt-4 rounded-xl overflow-hidden border border-slate-200" style={{ height: 380 }} />
            <p className="text-xs text-slate-400 mt-3">
              {d?.riderLat ? 'Rider location updates live.' : 'Waiting for the rider to start sharing location. Pickup and destination are shown as regional markers.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
