'use client';
import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { productsAPI, ordersAPI, messagesAPI, authAPI, isLoggedIn } from '../../../lib/api';
import { addToCart } from '../../../lib/cart';
import { toggleSaved, isSaved } from '../../../lib/saved';

const BUYING_ROLES = [
  'buyer', 'business_buyer', 'corporate_buyer', 'government_buyer',
  'seller', 'reseller', 'manufacturer', 'wholesaler', 'service_provider', 'corporate_seller',
  'rider', 'driver',
];

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qty, setQty] = useState(1);
  const [checkout, setCheckout] = useState(false);
  const [added, setAdded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    productsAPI.getById(id)
      .then((r: any) => { const p = r.product || r; setProduct(p); setQty(p?.minimumOrder || 1); setSaved(isSaved(p?._id)); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    if (isLoggedIn()) authAPI.me().then((r: any) => setMe(r.user || r)).catch(() => {});
  }, [id]);

  if (loading) return <div className="pt-32 text-center text-stone-400">Loading…</div>;
  if (error || !product) return <div className="pt-32 text-center text-stone-500">{error || 'Product not found.'}</div>;

  const seller = product.seller || {};
  const total = (product.pricePerUnit || 0) * qty;

  const messageSeller = async () => {
    if (!isLoggedIn()) { router.push(`/auth/login?redirect=/catalog/${id}`); return; }
    try {
      await messagesAPI.start({ recipientId: seller._id, body: `Hi, I'm interested in "${product.title}".` });
      router.push('/messages');
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="min-h-screen bg-stone-50 pt-24 pb-16 px-4">
      <div className="max-w-5xl mx-auto">
        <Link href="/catalog" className="text-sm text-amber-700 hover:underline">← Back to marketplace</Link>
        <div className="grid md:grid-cols-2 gap-8 mt-4">
          {/* Photo gallery */}
          <ProductGallery images={product.images || []} title={product.title} />

          {/* Info */}
          <div>
            <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>{product.title}</h1>
            {product.store?.name && (
              <Link href={`/store/${product.store.slug}`} className="inline-flex items-center gap-2 mt-2 text-sm text-stone-600 hover:text-stone-900">
                {product.store.theme?.logoUrl
                  ? <img src={product.store.theme.logoUrl} alt={product.store.name} className="w-6 h-6 rounded-full object-cover border border-stone-200" />
                  : <span className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-xs">🏪</span>}
                <span>Sold by <span className="font-semibold">{product.store.name}</span></span>
              </Link>
            )}
            <p className="text-stone-400 italic text-sm mt-1">{product.species}</p>

            <div className="flex flex-wrap gap-2 mt-3">
              {product.flegtVerified && <Badge c="green">FLEGT</Badge>}
              {product.fscCertified && <Badge c="emerald">FSC</Badge>}
              {product.laceyActCompliant && <Badge c="blue">Lacey Act</Badge>}
              {product.isInternational && <Badge c="amber">🌍 International</Badge>}
            </div>

            <p className="text-3xl font-bold text-stone-900 mt-4">
              {product.currency} {product.pricePerUnit?.toLocaleString()}
              <span className="text-sm font-normal text-stone-400"> / {product.unit}</span>
            </p>
            <p className="text-sm text-stone-500 mt-1">
              {product.availableQuantity} {product.unit} available · min order {product.minimumOrder || 1}
            </p>

            {product.description && <p className="text-stone-600 text-sm mt-4 leading-relaxed">{product.description}</p>}

            {/* Seller */}
            <div className="bg-white rounded-xl border border-stone-200 p-4 mt-5 flex items-center justify-between">
              <div>
                <div className="text-xs text-stone-400">Sold by</div>
                <div className="font-semibold text-stone-900">{seller.company || seller.fullName}</div>
                <div className="text-xs text-amber-600">⭐ {(seller.ratingAverage || 0).toFixed(1)} · {seller.region}</div>
              </div>
              {seller._id && <Link href={`/profile/${seller._id}`} className="text-amber-700 text-sm font-semibold hover:underline">Profile →</Link>}
            </div>

            {/* Buy box */}
            <div className="bg-white rounded-xl border border-stone-200 p-4 mt-4">
              <div className="flex items-center gap-3 mb-3">
                <label className="text-sm text-stone-600">Quantity</label>
                <input type="number" min={product.minimumOrder || 1} max={product.availableQuantity} value={qty}
                  onChange={e => setQty(Math.max(product.minimumOrder || 1, Number(e.target.value)))}
                  className="w-24 border border-stone-300 rounded-lg px-3 py-1.5 text-sm" />
                <span className="text-sm text-stone-400">{product.unit}</span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-stone-500">Subtotal</span>
                <span className="font-bold text-stone-900">{product.currency} {total.toLocaleString()}</span>
              </div>
              {(!me || BUYING_ROLES.includes(me.role)) ? (
                <>
                  <div className="flex gap-2">
                    <button onClick={() => (isLoggedIn() ? setCheckout(true) : router.push(`/auth/login?redirect=/catalog/${id}`))}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm">
                      Buy now
                    </button>
                    <button onClick={messageSeller} className="px-4 border border-stone-300 text-stone-700 rounded-xl text-sm font-semibold hover:bg-stone-50">
                      💬
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      const pct = Number(product.discountPercent) || 0;
                      const unitPrice = product.pricePerUnit * (1 - pct / 100);
                      addToCart({
                        id: product._id, title: product.title, price: unitPrice, unit: product.unit,
                        currency: product.currency === 'USD' ? 'USD' : 'GHS',
                        image: product.images?.[0], sellerName: product.store?.name || product.seller?.fullName,
                      }, qty);
                      setAdded(true); setTimeout(() => setAdded(false), 2000);
                    }}
                    className="w-full mt-2 border-2 font-bold py-2.5 rounded-xl text-sm transition-colors"
                    style={{ borderColor: '#C8A24B', color: added ? '#fff' : '#9A7A2E', background: added ? '#9A7A2E' : 'transparent' }}>
                    {added ? '✓ Added — pay later from your cart' : '🛒 Add to cart (pay later)'}
                  </button>
                  <Link href="/cart" className="block text-center text-xs text-indigo-600 font-semibold mt-2 hover:underline">View my cart →</Link>
                  <button
                    onClick={() => {
                      const pct = Number(product.discountPercent) || 0;
                      const unitPrice = product.pricePerUnit * (1 - pct / 100);
                      const now = toggleSaved({
                        id: product._id, title: product.title, price: unitPrice, unit: product.unit,
                        currency: product.currency === 'USD' ? 'USD' : 'GHS',
                        image: product.images?.[0], sellerName: product.store?.name || product.seller?.fullName,
                      });
                      setSaved(now);
                    }}
                    className={`w-full mt-2 font-semibold py-2.5 rounded-xl text-sm border transition-colors ${saved ? 'bg-rose-50 border-rose-300 text-rose-600' : 'border-stone-300 text-stone-700 hover:bg-stone-50'}`}>
                    {saved ? '♥ Saved to your list' : '♡ Save for later'}
                  </button>
                </>
              ) : (
                <div className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-600">
                  👁️ Your role has <span className="font-semibold">marketplace view access only</span> — ordering is disabled for officers and administrators.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {checkout && <CheckoutModal product={product} qty={qty} onClose={() => setCheckout(false)} />}
    </div>
  );
}

function Badge({ children, c }: { children: React.ReactNode; c: string }) {
  const m: Record<string, string> = {
    green: 'bg-green-50 text-green-700 border-green-200', emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200', amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return <span className={`text-xs px-2.5 py-1 rounded-full border ${m[c]}`}>{children}</span>;
}

function CheckoutModal({ product, qty, onClose }: { product: any; qty: number; onClose: () => void }) {
  const router = useRouter();
  const [addr, setAddr] = useState({ recipientName: '', phone: '', street: '', city: '', state: '', country: 'Ghana', lat: undefined as number | undefined, lng: undefined as number | undefined });
  const [error, setError] = useState('');
  const [placing, setPlacing] = useState(false);
  const [geoMsg, setGeoMsg] = useState('');
  const set = (k: string, v: string) => setAddr(a => ({ ...a, [k]: v }));
  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoMsg('Location not supported on this device.'); return; }
    setGeoMsg('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setAddr(a => ({ ...a, lat: pos.coords.latitude, lng: pos.coords.longitude })); setGeoMsg('✓ Location captured — delivery distance will be exact.'); },
      () => setGeoMsg('Could not get location. You can still order; fee will be estimated.'),
    );
  };

  const place = async () => {
    if (!addr.recipientName || !addr.phone || !addr.street || !addr.city) { setError('Please fill recipient, phone, street and city.'); return; }
    setPlacing(true); setError('');
    try {
      const order = await ordersAPI.create({
        items: [{ product: product._id, quantity: qty }],
        shippingAddress: addr,
        currency: product.currency === 'USD' ? 'USD' : 'GHS',
      } as any);
      const o = order.order || order;
      router.push(`/payment?purpose=order&orderId=${o._id}&amount=${o.totalAmount}&return=/track/${o.orderNumber}`);
    } catch (e: any) { setError(e.message); setPlacing(false); }
  };

  const input = 'w-full border border-stone-300 rounded-xl px-3 py-2.5 text-sm';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-stone-900 mb-1">Delivery details</h3>
        <p className="text-xs text-stone-400 mb-4">{qty} × {product.title}</p>
        {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>}
        <div className="space-y-2.5">
          <input placeholder="Recipient name" value={addr.recipientName} onChange={e => set('recipientName', e.target.value)} className={input} />
          <input placeholder="Phone (e.g. 0240000000)" value={addr.phone} onChange={e => set('phone', e.target.value)} className={input} />
          <input placeholder="Street address" value={addr.street} onChange={e => set('street', e.target.value)} className={input} />
          <div className="grid grid-cols-2 gap-2.5">
            <input placeholder="City" value={addr.city} onChange={e => set('city', e.target.value)} className={input} />
            <input placeholder="Region" value={addr.state} onChange={e => set('state', e.target.value)} className={input} />
          </div>
          <button type="button" onClick={useMyLocation}
            className={`w-full text-sm font-semibold py-2.5 rounded-xl border ${addr.lat ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-stone-300 text-stone-700 hover:bg-stone-50'}`}>
            {addr.lat ? '📍 Location captured' : '📍 Use my location (for exact delivery fee)'}
          </button>
          {geoMsg && <p className="text-xs text-stone-500">{geoMsg}</p>}
        </div>
        <button onClick={place} disabled={placing} className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-60">
          {placing ? 'Placing order…' : 'Continue to Mobile Money payment →'}
        </button>
      </div>
    </div>
  );
}

function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const has = images && images.length > 0;
  const current = has ? images[Math.min(active, images.length - 1)] : null;

  return (
    <div>
      {/* Main image */}
      <div
        className="bg-white rounded-2xl border border-stone-200 h-80 flex items-center justify-center overflow-hidden relative group cursor-zoom-in"
        onClick={() => has && setLightbox(true)}
      >
        {current ? <img src={current} alt={title} className="w-full h-full object-cover" /> : <span className="text-7xl">🪵</span>}
        {has && images.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setActive((a) => (a - 1 + images.length) % images.length); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">‹</button>
            <button
              onClick={(e) => { e.stopPropagation(); setActive((a) => (a + 1) % images.length); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">›</button>
            <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">{active + 1}/{images.length}</span>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {has && images.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button key={i} onClick={() => setActive(i)}
              className={`w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition ${i === active ? 'border-amber-600' : 'border-transparent opacity-70 hover:opacity-100'}`}>
              <img src={src} alt={`${title} ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && current && (
        <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4" onClick={() => setLightbox(false)}>
          <img src={current} alt={title} className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
          {images.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); setActive((a) => (a - 1 + images.length) % images.length); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 text-white text-xl flex items-center justify-center">‹</button>
              <button onClick={(e) => { e.stopPropagation(); setActive((a) => (a + 1) % images.length); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 text-white text-xl flex items-center justify-center">›</button>
            </>
          )}
          <button onClick={() => setLightbox(false)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white text-xl flex items-center justify-center">×</button>
        </div>
      )}
    </div>
  );
}
