'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authAPI, districtAdminAPI, adminAPI } from '../../../lib/api';

export default function AdminReviewPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => {
    districtAdminAPI.pendingUsers()
      .then(r => setPending(r.pending || []))
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    authAPI.me().then((u: any) => {
      const role = u?.role;
      if (!['admin', 'super_admin', 'district_admin', 'region_admin', 'ceo', 'coo', 'cto', 'cio', 'cfo', 'chro'].includes(role)) {
        router.replace('/dashboard');
        return;
      }
      setMe(u);
      load();
    }).catch(() => router.replace('/auth/login'));
  }, []);

  const reinstate = async (userId: string) => {
    setBusy(userId);
    try { await adminAPI.reactivateUser(userId); setMsg('Account reinstated.'); load(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(''); }
  };
  const suspend = async (userId: string) => {
    const reason = prompt('Reason for suspension?') || 'Suspended after report review.';
    setBusy(userId);
    try { await adminAPI.suspendUser(userId, reason); setMsg('Account suspended.'); load(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(''); }
  };

  if (loading) return <div className="pt-32 text-center text-stone-400">Loading review queue…</div>;

  return (
    <div className="min-h-screen bg-stone-50 pt-24 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Review Queue</h1>
          <Link href="/admin" className="text-sm text-amber-700 font-semibold hover:underline">← Admin dashboard</Link>
        </div>
        <p className="text-stone-500 text-sm mb-6">
          {me?.role === 'district_admin'
            ? `Accounts in ${me?.district || 'your district'} flagged by reports for your review.`
            : 'Accounts flagged by reports across the platform.'}
        </p>

        {msg && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-2.5 mb-4">{msg}</div>}

        {pending.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-stone-200">
            <div className="text-5xl mb-3">✅</div>
            <p className="text-stone-500">Nothing to review. All accounts are in good standing.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map(({ user, reports }) => (
              <div key={user._id} className="bg-white rounded-2xl border border-red-200 p-5">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <Link href={`/profile/${user._id}`} className="font-bold text-stone-900 hover:text-amber-700">
                      {user.company || user.fullName}
                    </Link>
                    <p className="text-xs text-stone-400 mt-0.5 capitalize">
                      {user.role?.replace(/_/g, ' ')} · {user.district || user.region} · {user.email}
                    </p>
                    <span className="inline-block mt-2 text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">
                      ⚠️ {reports?.length || 0} open report{reports?.length === 1 ? '' : 's'} — {user.pendingReason || 'under review'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => reinstate(user._id)} disabled={busy === user._id}
                      className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-60">
                      Reinstate
                    </button>
                    <button onClick={() => suspend(user._id)} disabled={busy === user._id}
                      className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-60">
                      Suspend
                    </button>
                  </div>
                </div>

                {/* The reports themselves */}
                <div className="mt-4 border-t border-stone-100 pt-3 space-y-2">
                  {(reports || []).map((r: any) => (
                    <div key={r._id} className="bg-stone-50 rounded-xl p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-stone-700 capitalize">{r.category?.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-stone-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-stone-600 mt-1">{r.reason}</p>
                      {r.description && <p className="text-stone-400 text-xs mt-1">{r.description}</p>}
                      <p className="text-xs text-stone-400 mt-1">Reported by: {r.reporter?.fullName || r.reporterRole || 'a user'}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
