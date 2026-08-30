'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { authAPI, ratingsAPI, reportsAPI, messagesAPI, isLoggedIn } from '../../../lib/api';

const REPORT_CATEGORIES = [
  ['scam', 'Scam'], ['fraud', 'Fraud'], ['non_delivery', 'Item not delivered'],
  ['fake_product', 'Fake / misrepresented product'], ['abusive', 'Abusive or threatening'],
  ['payment_issue', 'Payment issue'], ['counterfeit_documents', 'Counterfeit documents'], ['other', 'Other'],
];

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [profile, setProfile] = useState<any>(null);
  const [ratings, setRatings] = useState<any[]>([]);
  const [distribution, setDistribution] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      authAPI.publicProfile(id),
      ratingsAPI.forUser(id).catch(() => ({ ratings: [], distribution: {} })),
    ]).then(([p, r]: any[]) => {
      setProfile(p.user);
      setRatings(r.ratings || []);
      setDistribution(r.distribution || {});
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [id]);

  const message = async () => {
    if (!isLoggedIn()) { router.push('/auth/login'); return; }
    try {
      await messagesAPI.start({ recipientId: id, body: `Hi ${profile.company || profile.fullName}, I'm interested in your listings.` });
      router.push('/messages');
    } catch (e: any) { alert(e.message); }
  };

  if (loading) return <div className="pt-32 text-center text-stone-400">Loading profile…</div>;
  if (error || !profile) return <div className="pt-32 text-center text-stone-500">{error || 'Profile not found.'}</div>;

  const avg = profile.ratingAverage || 0;
  const stars = '★★★★★'.slice(0, Math.round(avg)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(avg));

  return (
    <div className="min-h-screen bg-stone-50 pt-24 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Trust banner */}
        {profile.trustFlag === 'under_review' && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
            ⚠️ This account is currently <strong>under review</strong> following reports. Trade with caution.
          </div>
        )}

        {/* Header card */}
        <div className="bg-white rounded-2xl border border-stone-200 p-6 mb-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
                {profile.company || profile.fullName}
              </h1>
              <p className="text-stone-500 text-sm mt-1 capitalize">
                {profile.role?.replace(/_/g, ' ')} · {profile.district || profile.region || 'Ghana'}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {profile.verificationBadge && <Badge color="green">✓ Verified seller</Badge>}
                {profile.ghanaCardVerified && <Badge color="blue">🪪 Ghana Card verified</Badge>}
                {profile.fscCertified && <Badge color="emerald">🌿 FSC certified</Badge>}
                {profile.sustainabilityScore > 0 && <Badge color="amber">♻️ Sustainability {profile.sustainabilityScore}</Badge>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-amber-500">{avg.toFixed(1)}</div>
              <div className="text-amber-400 text-lg leading-none">{stars}</div>
              <div className="text-xs text-stone-400 mt-1">{profile.ratingCount || 0} ratings</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-5 text-center">
            <Stat label="Active listings" value={profile.activeListings} />
            <Stat label="Reports" value={profile.reportsCount || 0} />
            <Stat label="Member since" value={new Date(profile.memberSince).getFullYear()} />
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={message} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2.5 rounded-xl">
              💬 Message
            </button>
            <button onClick={() => (isLoggedIn() ? setShowReport(true) : router.push('/auth/login'))}
              className="flex-1 border border-red-200 text-red-600 hover:bg-red-50 font-semibold text-sm py-2.5 rounded-xl">
              🚩 Report
            </button>
          </div>
        </div>

        {/* Rating distribution */}
        <div className="bg-white rounded-2xl border border-stone-200 p-6 mb-5">
          <h2 className="font-bold text-stone-900 mb-3">Rating breakdown</h2>
          {[5, 4, 3, 2, 1].map(n => {
            const count = distribution[String(n)] || 0;
            const pct = profile.ratingCount ? (count / profile.ratingCount) * 100 : 0;
            return (
              <div key={n} className="flex items-center gap-3 mb-1.5 text-sm">
                <span className="w-8 text-stone-500">{n}★</span>
                <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 text-right text-stone-400 text-xs">{count}</span>
              </div>
            );
          })}
        </div>

        {/* Reviews */}
        <div className="bg-white rounded-2xl border border-stone-200 p-6">
          <h2 className="font-bold text-stone-900 mb-3">Reviews</h2>
          {ratings.length === 0 ? (
            <p className="text-stone-400 text-sm">No reviews yet.</p>
          ) : ratings.map(r => (
            <div key={r._id} className="border-b border-stone-100 last:border-0 py-3">
              <div className="flex items-center justify-between">
                <span className="text-amber-400 text-sm">{'★'.repeat(r.score)}{'☆'.repeat(5 - r.score)}</span>
                <span className="text-xs text-stone-400">{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
              {r.comment && <p className="text-sm text-stone-600 mt-1">{r.comment}</p>}
              <p className="text-xs text-stone-400 mt-1">— {r.rater?.fullName || r.rater?.company || 'Verified buyer'}</p>
            </div>
          ))}
        </div>
      </div>

      {showReport && <ReportModal userId={id} name={profile.company || profile.fullName} onClose={() => setShowReport(false)} />}
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  const map: Record<string, string> = {
    green: 'bg-green-50 text-green-700 border-green-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return <span className={`text-xs px-2.5 py-1 rounded-full border ${map[color]}`}>{children}</span>;
}
function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-stone-50 rounded-xl py-3">
      <div className="text-lg font-bold text-stone-900">{value}</div>
      <div className="text-xs text-stone-400">{label}</div>
    </div>
  );
}

function ReportModal({ userId, name, onClose }: { userId: string; name: string; onClose: () => void }) {
  const [category, setCategory] = useState('scam');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!reason.trim() || !description.trim()) { setError('Please add a reason and details.'); return; }
    setSubmitting(true); setError('');
    try {
      await reportsAPI.create({ reportedUserId: userId, category, reason, description });
      setDone(true);
    } catch (e: any) { setError(e.message); } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-2">✅</div>
            <h3 className="font-bold text-stone-900">Report submitted</h3>
            <p className="text-sm text-stone-500 mt-1">Our district admins will review it. Thank you for keeping NationMart safe.</p>
            <button onClick={onClose} className="mt-4 bg-indigo-600 text-white font-semibold text-sm px-5 py-2.5 rounded-xl">Close</button>
          </div>
        ) : (
          <>
            <h3 className="font-bold text-stone-900 mb-1">Report {name}</h3>
            <p className="text-xs text-stone-400 mb-4">False reports may affect your own account standing.</p>
            {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>}
            <label className="text-sm text-stone-600">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full border border-stone-300 rounded-xl px-3 py-2.5 text-sm mb-3 mt-1">
              {REPORT_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input placeholder="Short reason" value={reason} onChange={e => setReason(e.target.value)}
              className="w-full border border-stone-300 rounded-xl px-3 py-2.5 text-sm mb-3" />
            <textarea placeholder="What happened?" value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full border border-stone-300 rounded-xl px-3 py-2.5 text-sm mb-4" />
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 border border-stone-300 text-stone-600 text-sm py-2.5 rounded-xl">Cancel</button>
              <button onClick={submit} disabled={submitting} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm py-2.5 rounded-xl disabled:opacity-60">
                {submitting ? 'Submitting…' : 'Submit report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
