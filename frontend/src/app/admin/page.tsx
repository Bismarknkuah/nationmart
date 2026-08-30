'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authAPI, adminAPI, districtAdminAPI } from '../../lib/api';

type Tab = 'overview' | 'licenses' | 'products' | 'users';

export default function AdminDashboard() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<any>(null);
  const [pendingLicenses, setPendingLicenses] = useState<any[]>([]);
  const [pendingProducts, setPendingProducts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    authAPI.me().then((u: any) => {
      const user = u.user || u;
      if (!['admin', 'super_admin', 'district_admin', 'region_admin', 'ceo', 'coo', 'cto', 'cio', 'cfo', 'chro'].includes(user.role)) { router.replace('/dashboard'); return; }
      setMe(user); loadAll();
    }).catch(() => router.replace('/auth/login?redirect=/admin'));
  }, []);

  const loadAll = async () => {
    const [s, l, p, u, pr] = await Promise.all([
      adminAPI.stats().catch(() => null),
      adminAPI.pendingLicenses().catch(() => ({ licenses: [] })),
      adminAPI.pendingProducts().catch(() => ({ products: [] })),
      adminAPI.getUsers({}).catch(() => ({ users: [] })),
      districtAdminAPI.pendingUsers().catch(() => ({ pending: [] })),
    ]);
    setStats(s);
    setPendingLicenses(l.licenses || l.data || []);
    setPendingProducts(p.products || p.data || []);
    setUsers(u.users || u.data || []);
    setPendingReviewCount((pr.pending || []).length);
  };

  const approveProduct = async (id: string) => {
    setBusy(id);
    try { await adminAPI.approveProduct(id); setMsg('Product approved.'); loadAll(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(''); }
  };
  const rejectProduct = async (id: string) => {
    const reason = prompt('Rejection reason?') || 'Does not meet listing standards.';
    setBusy(id);
    try { await adminAPI.rejectProduct(id, reason); setMsg('Product rejected.'); loadAll(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(''); }
  };
  const suspendUser = async (id: string) => {
    const reason = prompt('Suspension reason?') || 'Suspended by admin.';
    setBusy(id);
    try { await adminAPI.suspendUser(id, reason); setMsg('User suspended.'); loadAll(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(''); }
  };
  const reactivateUser = async (id: string) => {
    setBusy(id);
    try { await adminAPI.reactivateUser(id); setMsg('User reactivated.'); loadAll(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(''); }
  };

  if (!me) return <div className="pt-32 text-center text-stone-400">Loading admin console…</div>;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'overview', label: '📊 Overview' },
    { key: 'licenses', label: '📋 Licenses', badge: pendingLicenses.length },
    { key: 'products', label: '🪵 Products', badge: pendingProducts.length },
    { key: 'users', label: '👥 Users' },
  ];

  return (
    <div className="min-h-screen bg-stone-100">
      {/* Header */}
      <header className="bg-indigo-800 text-white shadow">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-bold text-xl" style={{ fontFamily: 'Georgia, serif' }}>NationMart</Link>
            <span className="text-stone-400">|</span>
            <span className="text-amber-400 font-semibold text-sm">{me.role === 'district_admin' ? 'District Admin' : me.role === 'region_admin' ? 'Region Admin' : 'Super Admin'} · {me.district || me.region || 'Platform'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/inbox" className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
              My Inbox
            </Link>
            <Link href="/admin/comms" className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
              Officer Comms
            </Link>
            <Link href="/admin/command-center" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
              Command Center
            </Link>
            <Link href="/admin/review" className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
              Review Queue {pendingReviewCount > 0 && <span className="ml-1 bg-white text-red-600 rounded-full px-1.5">{pendingReviewCount}</span>}
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {msg && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-2.5 mb-4">{msg}</div>}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${tab === t.key ? 'bg-indigo-600 text-white' : 'bg-white text-stone-600 border border-stone-200 hover:border-stone-300'}`}>
              {t.label}{t.badge ? ` (${t.badge})` : ''}
            </button>
          ))}
        </div>

        {tab === 'overview' && stats && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                ['Users', stats.users?.total ?? stats.totalUsers ?? '—'],
                ['Sellers', stats.users?.sellers ?? stats.totalSellers ?? '—'],
                ['Products', stats.products?.total ?? stats.totalProducts ?? '—'],
                ['Orders', stats.orders?.total ?? stats.totalOrders ?? '—'],
              ].map(([l, v]) => (
                <div key={l as string} className="bg-white rounded-2xl border border-stone-200 p-5">
                  <p className="text-xs text-stone-400 uppercase">{l as string}</p>
                  <p className="text-2xl font-bold text-stone-900 mt-1">{v as any}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-stone-200 p-5">
              <h3 className="font-bold text-stone-900 mb-3">Quick actions</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <button onClick={() => setTab('licenses')} className="bg-stone-50 hover:bg-stone-100 rounded-xl p-4 text-left">
                  <p className="text-xl">📋</p><p className="font-semibold mt-1">Review licenses</p><p className="text-xs text-stone-400">{pendingLicenses.length} pending</p>
                </button>
                <button onClick={() => setTab('products')} className="bg-stone-50 hover:bg-stone-100 rounded-xl p-4 text-left">
                  <p className="text-xl">🪵</p><p className="font-semibold mt-1">Review products</p><p className="text-xs text-stone-400">{pendingProducts.length} pending</p>
                </button>
                <Link href="/admin/review" className="bg-red-50 hover:bg-red-100 rounded-xl p-4 text-left">
                  <p className="text-xl">🚩</p><p className="font-semibold mt-1">Flagged accounts</p><p className="text-xs text-stone-400">{pendingReviewCount} for review</p>
                </Link>
                <button onClick={() => setTab('users')} className="bg-stone-50 hover:bg-stone-100 rounded-xl p-4 text-left">
                  <p className="text-xl">👥</p><p className="font-semibold mt-1">Manage users</p><p className="text-xs text-stone-400">{users.length} loaded</p>
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'licenses' && (
          <Section title="Pending licenses" empty="No licenses awaiting review.">
            {pendingLicenses.map((u: any) => (u.licenses || []).map((lic: any) => (
              <Row key={`${u._id}-${lic._id}`}
                title={`${u.fullName || u.company || 'Seller'} — ${lic.type || lic.title || 'License'}`}
                meta={`${u.region || ''} · uploaded ${new Date(lic.uploadedAt || lic.createdAt).toLocaleDateString()}`}>
                <button onClick={async () => { await adminAPI.reviewLicense(u._id, lic._id, { action: 'approve' }); loadAll(); }}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">Approve</button>
                <button onClick={async () => { const r = prompt('Reason?') || 'Does not meet requirements.'; await adminAPI.reviewLicense(u._id, lic._id, { action: 'reject', rejectionReason: r }); loadAll(); }}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">Reject</button>
              </Row>
            )))}
          </Section>
        )}

        {tab === 'products' && (
          <Section title="Pending products" empty="No products awaiting review.">
            {pendingProducts.map((p: any) => (
              <Row key={p._id} title={p.title} meta={`${p.species} · by ${p.seller?.company || p.seller?.fullName || 'seller'}`}>
                <button onClick={() => approveProduct(p._id)} disabled={busy === p._id} className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">Approve</button>
                <button onClick={() => rejectProduct(p._id)} disabled={busy === p._id} className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">Reject</button>
              </Row>
            ))}
          </Section>
        )}

        {tab === 'users' && (
          <Section title="Users" empty="No users.">
            {users.map((u: any) => (
              <Row key={u._id} title={u.fullName || u.company || u.email} meta={`${u.role} · ${u.district || u.region || ''} · ${u.email}`}>
                <Link href={`/profile/${u._id}`} className="text-amber-700 text-xs font-semibold hover:underline">Profile</Link>
                {u.accountStatus === 'suspended'
                  ? <button onClick={() => reactivateUser(u._id)} disabled={busy === u._id} className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">Reactivate</button>
                  : <button onClick={() => suspendUser(u._id)} disabled={busy === u._id} className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">Suspend</button>}
              </Row>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const list = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : [];
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5">
      <h3 className="font-bold text-stone-900 mb-3">{title} <span className="text-stone-400 text-sm">({list.length})</span></h3>
      {list.length === 0 ? <p className="text-stone-400 text-sm py-6 text-center">{empty}</p> : <div className="divide-y divide-stone-100">{children}</div>}
    </div>
  );
}
function Row({ title, meta, children }: { title: string; meta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-stone-800 truncate">{title}</p>
        <p className="text-xs text-stone-400 truncate">{meta}</p>
      </div>
      <div className="flex gap-2 shrink-0">{children}</div>
    </div>
  );
}
