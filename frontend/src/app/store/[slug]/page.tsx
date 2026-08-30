'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { storesAPI, disputesAPI } from '../../../lib/api';

/**
 * A shop's dispute record, shown to buyers before they buy. A low or zero
 * dispute rate is a quiet mark of trust; a high one is a warning worth seeing.
 * We only surface it once a shop has had at least a few paid orders, so a single
 * early dispute doesn't brand a new seller unfairly.
 */
function TrustBadge({ sellerId }: { sellerId?: string }) {
  const [rec, setRec] = useState<any>(null);
  useEffect(() => {
    if (!sellerId) return;
    disputesAPI.record(sellerId).then((r) => setRec(r.record)).catch(() => {});
  }, [sellerId]);

  if (!rec || rec.paidOrders < 5) return null;
  const clean = rec.disputeRatePercent <= 2;
  return (
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
        clean
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : rec.disputeRatePercent <= 8
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-red-50 text-red-700 border-red-200'
      }`}
      title={`${rec.lost} of ${rec.paidOrders} paid orders ended in a refund`}
    >
      {clean ? '🛡️ Reliable' : `${rec.disputeRatePercent}% dispute rate`}
    </span>
  );
}

export default function StorefrontPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const [store, setStore] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) return;
    storesAPI.storefront(slug)
      .then(r => { setStore(r.store); setProducts(r.products || []); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="pt-32 text-center text-stone-400">Loading storefront…</div>;
  if (error || !store) return <div className="pt-32 text-center text-stone-500">Store not found.</div>;

  const theme = store.theme || {};
  const primary = theme.primaryColor || '#5a3e2b';
  const accent = theme.accentColor || '#e8b872';

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: theme.font || 'Georgia' }}>
      {/* Banner */}
      <div className="pt-16">
        <div className="relative h-56 flex items-center justify-center text-center px-4"
          style={{ background: theme.bannerUrl ? `url(${theme.bannerUrl}) center/cover` : `linear-gradient(135deg, ${primary}, ${accent})` }}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative text-white">
            {theme.logoUrl && <img src={theme.logoUrl} alt={store.name} className="w-20 h-20 rounded-2xl object-cover mx-auto mb-3 border-4 border-white/90 shadow-lg" />}
            <h1 className="text-4xl font-bold drop-shadow">{theme.bannerHeadline || store.name}</h1>
            <p className="mt-2 text-white/90">{theme.bannerSubtext || store.description}</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Store info bar */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-bold text-stone-900 text-lg">{store.name}</h2>
            <p className="text-sm text-stone-500 capitalize">
              {store.type?.replace(/_/g, ' ')} · {store.district || store.region}
              {store.isInternational && ' · 🌍 Ships internationally'}
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm flex-wrap">
            {store.storeNumber && (
              <span className="font-bold tracking-wide px-3 py-1 rounded-full" style={{ background: '#FdF6E3', color: '#9A7A2E', border: '1px solid #E7CB77' }}>
                Store No. {store.storeNumber}
              </span>
            )}
            {store.storeCode && (
              <span className="font-mono text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200" title="Searchable store code">
                {store.storeCode}
              </span>
            )}
            <span className="text-stone-600">⭐ {(store.owner?.ratingAverage || 0).toFixed(1)} ({store.owner?.ratingCount || 0})</span>
            {store.owner?.verificationBadge && <span className="text-green-600 font-semibold">✓ Verified Seller</span>}
            <TrustBadge sellerId={store.owner?._id} />
            <Link href={`/profile/${store.owner?._id}`} className="text-amber-700 font-semibold hover:underline">View profile</Link>
          </div>
        </div>

        {/* Contact & location — buyers can call, text, email, or get directions */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 mb-6">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-stone-800 mb-1">📍 Visit or contact this store</h3>
              <p className="text-sm text-stone-600">
                {store.address ? `${store.address}, ` : ''}{[store.district, store.region].filter(Boolean).join(', ')}{store.region ? ', Ghana' : ''}
              </p>
              {store.contactEmail && (
                <p className="text-sm text-stone-600 mt-0.5">✉️ <a href={`mailto:${store.contactEmail}`} className="text-amber-700 hover:underline">{store.contactEmail}</a></p>
              )}
              {store.contactPhone && (
                <p className="text-sm text-stone-600 mt-0.5">📞 <a href={`tel:${store.contactPhone}`} className="text-amber-700 hover:underline">{store.contactPhone}</a></p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {store.contactPhone && (
                <>
                  <a href={`tel:${store.contactPhone}`} className="text-sm font-semibold text-white px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700">📞 Call</a>
                  <a href={`sms:${store.contactPhone}`} className="text-sm font-semibold px-4 py-2 rounded-lg border border-stone-300 hover:bg-stone-50">💬 Text</a>
                </>
              )}
              {store.contactEmail && (
                <a href={`mailto:${store.contactEmail}?subject=${encodeURIComponent('Enquiry about ' + store.name + ' (Store No. ' + (store.storeNumber || '') + ')')}`} className="text-sm font-semibold px-4 py-2 rounded-lg border border-stone-300 hover:bg-stone-50">✉️ Email</a>
              )}
              {(store.lat && store.lng) || store.address || store.region ? (
                <a target="_blank" rel="noreferrer"
                  href={store.lat && store.lng ? `https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([store.name, store.address, store.district, store.region, 'Ghana'].filter(Boolean).join(', '))}`}
                  className="text-sm font-semibold px-4 py-2 rounded-lg border border-stone-300 hover:bg-stone-50">🗺️ Directions</a>
              ) : null}
            </div>
          </div>
          {!store.contactPhone && !store.contactEmail && (
            <p className="text-xs text-stone-400 mt-2">This store hasn't added contact details yet.</p>
          )}
        </div>

        {theme.about && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5 mb-6">
            <h3 className="font-semibold text-stone-800 mb-1">About</h3>
            <p className="text-sm text-stone-600">{theme.about}</p>
          </div>
        )}

        <h3 className="font-bold text-stone-900 mb-4" style={{ color: primary }}>Products ({products.length})</h3>
        {products.length === 0 ? (
          <p className="text-stone-400 text-center py-12 bg-white rounded-2xl border border-stone-200">No products listed yet.</p>
        ) : (
          <div className={theme.layout === 'list' ? 'space-y-3' : 'grid sm:grid-cols-2 lg:grid-cols-3 gap-5'}>
            {products.map(p => (
              <Link key={p._id} href={`/catalog/${p._id}`}
                className="bg-white rounded-2xl border border-stone-200 overflow-hidden hover:shadow-lg transition-all">
                <div className="h-40 bg-stone-100 flex items-center justify-center overflow-hidden">
                  {p.images?.[0] ? <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover" /> : <span className="text-4xl">📦</span>}
                </div>
                <div className="p-4">
                  <h4 className="font-semibold text-stone-900 text-sm line-clamp-1">{p.title}</h4>
                  <p className="text-xs text-stone-400 mt-0.5">{p.species}</p>
                  <p className="font-bold mt-2" style={{ color: primary }}>
                    {p.currency} {p.pricePerUnit?.toLocaleString()} <span className="text-xs font-normal text-stone-400">/ {p.unit}</span>
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
