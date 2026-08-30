'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ordersAPI, isLoggedIn } from '../../lib/api';
import { getCart, setQty, removeFromCart, clearCart, onCartChange, cartTotal, CartItem } from '../../lib/cart';

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [showAddr, setShowAddr] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  const [placed, setPlaced] = useState<{ orderNumber: string; orderId: string; amount: number }[]>([]);
  const [addr, setAddr] = useState({ recipientName: '', phone: '', street: '', city: '', state: '', country: 'Ghana', lat: undefined as number | undefined, lng: undefined as number | undefined });
  const [geoMsg, setGeoMsg] = useState('');

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoMsg('Location not supported on this device.'); return; }
    setGeoMsg('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setAddr((a) => ({ ...a, lat: pos.coords.latitude, lng: pos.coords.longitude })); setGeoMsg('✓ Location captured — delivery distance will be exact.'); },
      () => setGeoMsg('Could not get location. You can still order; fee will be estimated.'),
    );
  };

  const refresh = () => setItems(getCart());
  useEffect(() => { refresh(); setHydrated(true); return onCartChange(refresh); }, []);

  const total = cartTotal();
  const currency = items[0]?.currency || 'GHS';
  const setField = (k: string, v: string) => setAddr((a) => ({ ...a, [k]: v }));

  const placeOrders = async () => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/cart'); return; }
    if (!addr.recipientName || !addr.phone || !addr.street || !addr.city) {
      setError('Please fill recipient, phone, street and city.'); return;
    }
    setPlacing(true); setError('');
    const created: { orderNumber: string; orderId: string; amount: number }[] = [];
    try {
      for (const it of items) {
        const r = await ordersAPI.create({
          items: [{ product: it.id, quantity: it.qty }],
          shippingAddress: addr,
          currency: it.currency === 'USD' ? 'USD' : 'GHS',
        } as any);
        const o = (r as any).order || r;
        created.push({ orderNumber: o.orderNumber, orderId: o._id, amount: o.totalAmount });
      }
      clearCart();
      setPlaced(created);
    } catch (e: any) {
      setError(e.message || 'Could not place some orders.');
    } finally { setPlacing(false); }
  };

  const input = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200';

  if (!hydrated) return <div className="pt-32 text-center text-slate-400">Loading your cart…</div>;

  // Success view
  if (placed.length > 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-28 pb-16">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 text-2xl flex items-center justify-center mx-auto mb-4">✓</div>
          <h1 className="text-2xl font-bold text-slate-900">Orders placed</h1>
          <p className="text-slate-500 mt-1">Pay for each order to notify the seller and start delivery.</p>
          <div className="mt-6 space-y-2 text-left">
            {placed.map((p) => (
              <div key={p.orderId} className="flex items-center justify-between border border-slate-200 rounded-xl p-3">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{p.orderNumber}</p>
                  <p className="text-xs text-slate-500">{currency} {p.amount?.toLocaleString()}</p>
                </div>
                <Link href={`/payment?purpose=order&orderId=${p.orderId}&amount=${p.amount}&return=/track/${p.orderNumber}`}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">Pay now</Link>
              </div>
            ))}
          </div>
          <div className="mt-6 flex gap-2 justify-center">
            <Link href="/catalog" className="btn-secondary text-sm py-2 px-4">Continue shopping</Link>
            <Link href="/dashboard" className="btn-primary text-sm py-2 px-4">My orders</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-24 pb-16">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>My cart</h1>
        <Link href="/catalog" className="text-sm font-semibold text-indigo-600 hover:underline">← Continue shopping</Link>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <p className="text-slate-500 mb-4">Your cart is empty. Add items from the catalog and pay for them whenever you’re ready.</p>
          <Link href="/catalog" className="btn-primary text-sm py-2.5 px-5">Browse the catalog</Link>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((it) => (
              <div key={it.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center text-slate-300">
                  {it.image ? <img src={it.image} alt={it.title} className="w-full h-full object-cover" /> : <span className="text-xs">No image</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{it.title}</p>
                  {it.sellerName && <p className="text-xs text-slate-400">{it.sellerName}</p>}
                  <p className="text-sm text-slate-600 mt-0.5">{it.currency || 'GHS'} {it.price.toLocaleString()} {it.unit ? `/ ${it.unit}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} value={it.qty}
                    onChange={(e) => setQty(it.id, Number(e.target.value))}
                    className="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-center" />
                  <div className="text-right w-24">
                    <p className="font-bold text-slate-900 text-sm">{(it.price * it.qty).toLocaleString()}</p>
                  </div>
                  <button onClick={() => removeFromCart(it.id)} className="text-slate-400 hover:text-rose-600 text-lg px-1" title="Remove">×</button>
                </div>
              </div>
            ))}
          </div>

          {/* Auto-calculated summary */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 mt-4">
            <div className="flex items-center justify-between text-sm text-slate-600 mb-1">
              <span>Items</span><span>{items.reduce((n, i) => n + i.qty, 0)}</span>
            </div>
            <div className="flex items-center justify-between text-lg font-bold text-slate-900 border-t border-slate-100 pt-3 mt-2">
              <span>Total</span><span>{currency} {total.toLocaleString()}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Delivery fee is arranged with a rider after you pay (pay on delivery).</p>

            <div className="flex gap-2 mt-4">
              <button onClick={() => clearCart()} className="btn-secondary text-sm py-2.5 px-4">Clear cart</button>
              <button onClick={() => setShowAddr((s) => !s)} className="btn-primary flex-1 text-sm py-2.5">
                {showAddr ? 'Hide delivery details' : 'Checkout'}
              </button>
            </div>
          </div>

          {/* Delivery details + place orders */}
          {showAddr && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 mt-4">
              <h3 className="font-bold text-slate-900 mb-3">Delivery details</h3>
              {error && <div className="bg-rose-50 border border-rose-200 text-rose-600 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>}
              <div className="space-y-2.5">
                <input placeholder="Recipient name" value={addr.recipientName} onChange={(e) => setField('recipientName', e.target.value)} className={input} />
                <input placeholder="Phone (e.g. 0240000000)" value={addr.phone} onChange={(e) => setField('phone', e.target.value)} className={input} />
                <input placeholder="Street address" value={addr.street} onChange={(e) => setField('street', e.target.value)} className={input} />
                <div className="grid grid-cols-2 gap-2.5">
                  <input placeholder="City / town" value={addr.city} onChange={(e) => setField('city', e.target.value)} className={input} />
                  <input placeholder="Region" value={addr.state} onChange={(e) => setField('state', e.target.value)} className={input} />
                </div>
                <button type="button" onClick={useMyLocation}
                  className={`w-full text-sm font-semibold py-2.5 rounded-lg border ${addr.lat ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                  {addr.lat ? '📍 Location captured' : '📍 Use my location (for exact delivery fee)'}
                </button>
                {geoMsg && <p className="text-xs text-slate-500">{geoMsg}</p>}
              </div>
              <button onClick={placeOrders} disabled={placing}
                className="btn-primary w-full text-sm py-3 mt-4 disabled:opacity-50">
                {placing ? 'Placing orders…' : `Place ${items.length} order${items.length > 1 ? 's' : ''} · ${currency} ${total.toLocaleString()}`}
              </button>
              <p className="text-xs text-slate-400 mt-2 text-center">Each item becomes an order you can pay individually on the next screen.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
