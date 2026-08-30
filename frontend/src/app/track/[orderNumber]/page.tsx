'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { trackingAPI, ratingsAPI, receiptsAPI, isLoggedIn } from '../../../lib/api';

const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'quality_check', 'ready_for_shipping', 'shipped', 'customs_clearance', 'delivered'];
const statusLabels: Record<string, string> = {
  pending: 'Pending', confirmed: 'Confirmed', processing: 'Processing', quality_check: 'Quality Check',
  ready_for_shipping: 'Ready to Ship', shipped: 'Shipped', customs_clearance: 'Customs', delivered: 'Delivered', cancelled: 'Cancelled',
};
const statusIcons: Record<string, string> = {
  pending: '⏳', confirmed: '✅', processing: '⚙️', quality_check: '🔍',
  ready_for_shipping: '📦', shipped: '🚢', customs_clearance: '🛃', delivered: '🎉', cancelled: '❌',
};

export default function TrackOrderPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = use(params);
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) { setError('Please sign in to track your order.'); setLoading(false); return; }
    trackingAPI.track(orderNumber)
      .then(setOrder)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [orderNumber]);

  if (loading) return <div className="pt-32 text-center text-stone-400">Loading order…</div>;
  if (error || !order) {
    return (
      <div className="pt-32 text-center px-4">
        <p className="text-stone-600 mb-3">{error || 'Order not found.'}</p>
        {!isLoggedIn() && <Link href="/auth/login" className="text-amber-700 font-semibold hover:underline">Sign in →</Link>}
      </div>
    );
  }

  const currentIndex = ORDER_STATUSES.indexOf(order.status);
  const progressPct = currentIndex >= 0 ? Math.round((currentIndex / (ORDER_STATUSES.length - 1)) * 100) : 0;
  const seller = order.seller || {};
  const history = order.statusHistory || order.events || [];

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-indigo-600 text-white py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <Link href="/" className="text-amber-400 text-sm hover:underline mb-3 inline-block">← NationMart</Link>
          <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'Georgia, serif' }}>Order Tracking</h1>
          <div className="font-mono text-amber-200">{order.orderNumber}</div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Status */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-200 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="text-5xl">{statusIcons[order.status] || '📦'}</div>
            <div>
              <div className="text-sm text-stone-500 mb-1">Current Status</div>
              <div className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
                {statusLabels[order.status] || order.status}
              </div>
              <div className="text-sm text-stone-500 mt-1">
                Payment: <span className={order.paymentStatus === 'paid' ? 'text-green-600 font-semibold' : 'text-amber-600 font-semibold'}>{order.paymentStatus}</span>
              </div>
            </div>
          </div>
          <a href={receiptsAPI.orderReceiptUrl(order._id)} target="_blank" rel="noreferrer"
            className="border border-stone-300 text-stone-700 hover:bg-stone-50 text-sm font-semibold px-4 py-2 rounded-xl">
            📄 Download receipt
          </a>
        </div>

        {/* Progress */}
        {order.status !== 'cancelled' && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-200">
            <h3 className="font-bold text-stone-800 mb-5">Progress</h3>
            <div className="relative">
              <div className="absolute top-4 left-4 right-4 h-1 bg-stone-200 rounded-full" />
              <div className="absolute top-4 left-4 h-1 bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
              <div className="flex justify-between relative">
                {ORDER_STATUSES.map((s, i) => {
                  const done = i <= currentIndex;
                  const current = i === currentIndex;
                  return (
                    <div key={s} className="flex flex-col items-center gap-2" style={{ width: '12.5%' }}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 z-10 transition-all ${done ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-stone-300 text-stone-400'} ${current ? 'ring-4 ring-amber-200 scale-110' : ''}`}>
                        {done ? '✓' : i + 1}
                      </div>
                      <span className={`text-xs text-center leading-tight ${done ? 'text-amber-700 font-semibold' : 'text-stone-400'}`}>{statusLabels[s]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Seller */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200 flex items-center justify-between">
          <div>
            <div className="text-xs text-stone-400">Seller</div>
            <div className="font-semibold text-stone-900">{seller.company || seller.fullName || 'Seller'}</div>
            <div className="text-xs text-amber-600">⭐ {(seller.ratingAverage || 0).toFixed(1)}</div>
          </div>
          {seller._id && <Link href={`/profile/${seller._id}`} className="text-amber-700 text-sm font-semibold hover:underline">View profile →</Link>}
        </div>

        {/* Timeline */}
        {history.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-200">
            <h3 className="font-bold text-stone-800 mb-5">Event Timeline</h3>
            <div className="space-y-4">
              {[...history].reverse().map((e: any, i: number) => (
                <div key={i} className="flex gap-4">
                  <div className="w-9 h-9 rounded-full bg-amber-100 border-2 border-amber-400 flex items-center justify-center text-lg shrink-0">
                    {statusIcons[e.status] || '•'}
                  </div>
                  <div className="flex-1 pb-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-stone-900 text-sm">{statusLabels[e.status] || e.status}</span>
                      <span className="text-stone-400 text-xs">{e.date || (e.at && new Date(e.at).toLocaleDateString())}</span>
                    </div>
                    {e.note && <p className="text-stone-600 text-sm">{e.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-200">
          <h3 className="font-bold text-stone-800 mb-4">Order Summary</h3>
          <table className="w-full text-sm">
            <tbody>
              {(order.items || []).map((item: any, i: number) => (
                <tr key={i} className="border-b border-stone-100">
                  <td className="py-2.5 text-stone-700">{item.product?.title || item.species || 'Item'}</td>
                  <td className="py-2.5 text-stone-500 text-right">{item.quantity} × {item.currency} {item.unitPrice?.toLocaleString()}</td>
                </tr>
              ))}
              <tr>
                <td className="py-3 font-bold text-stone-900">Total</td>
                <td className="py-3 font-bold text-stone-900 text-right">{order.currency} {order.totalAmount?.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Rating widget when delivered */}
        {order.status === 'delivered' && <RateWidget order={order} />}
      </div>
    </div>
  );
}

function RateWidget({ order }: { order: any }) {
  const [score, setScore] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(order.buyerRated && order.sellerRated);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!score) { setError('Pick a star rating first.'); return; }
    setSubmitting(true); setError('');
    try {
      await ratingsAPI.create({ orderId: order._id, score, comment });
      setDone(true);
    } catch (e: any) { setError(e.message); } finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center text-green-700">
        ✅ Thanks for rating this order — your feedback builds trust on NationMart.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-amber-200">
      <h3 className="font-bold text-stone-800 mb-1">Rate this order</h3>
      <p className="text-xs text-stone-400 mb-3">Your public rating helps others decide who to trade with.</p>
      {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>}
      <div className="flex gap-1 mb-3 text-3xl">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setScore(n)}
            className={(hover || score) >= n ? 'text-amber-400' : 'text-stone-200'}>★</button>
        ))}
      </div>
      <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} placeholder="Add a comment (optional)"
        className="w-full border border-stone-300 rounded-xl px-3 py-2.5 text-sm mb-3" />
      <button onClick={submit} disabled={submitting}
        className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl disabled:opacity-60">
        {submitting ? 'Submitting…' : 'Submit rating'}
      </button>
    </div>
  );
}
