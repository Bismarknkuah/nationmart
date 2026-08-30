'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authAPI, isLoggedIn } from '../../lib/api';

const GOLD = '#C8A24B', GOLD_DK = '#9A7A2E', GOLD_LT = '#E7CB77';

export default function ProfilePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [me, setMe] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(true);
  const [savedMsg, setSavedMsg] = useState('');
  const [err, setErr] = useState('');
  // password
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const [pwMsg, setPwMsg] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/profile'); return; }
    (async () => {
      try {
        const r = await authAPI.me(); const u = r.user || r;
        setMe(u);
        setForm({ fullName: u.fullName || '', phone: u.phone || '', company: u.company || '', region: u.region || '', district: u.district || '', address: u.address || '', momoNumber: u.momoNumber || '', dutyStatus: u.dutyStatus || 'offline' });
        setAvatar(u.profileImageUrl || '');
      } catch { router.push('/auth/login?redirect=/profile'); }
      finally { setLoading(false); }
    })();
  }, [router]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) { setErr('Image too large — please pick one under 1.5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result as string);
    reader.readAsDataURL(f);
  };

  const save = async () => {
    setErr(''); setSavedMsg('');
    try {
      await authAPI.updateProfile({ ...form, profileImageUrl: avatar });
      setSavedMsg('Profile saved.');
    } catch (e: any) { setErr(e.message || 'Save failed.'); }
  };

  const changePw = async () => {
    setPwMsg('');
    if (nw.length < 8) { setPwMsg('New password must be at least 8 characters.'); return; }
    try { await authAPI.changePassword(cur, nw); setPwMsg('Password changed.'); setCur(''); setNw(''); }
    catch (e: any) { setPwMsg(e.message || 'Failed.'); }
  };

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-slate-400">Loading…</div>;
  if (!me) return null;

  const isPartner = ['rider', 'driver'].includes(me.role);
  const field = (k: string, label: string, type = 'text') => (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      <input type={type} value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200" />
    </label>
  );

  return (
    <div className="min-h-screen bg-slate-50 pt-8 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>My profile</h1>
          <Link href="/dashboard" className="text-sm font-semibold hover:underline" style={{ color: GOLD_DK }}>← Dashboard</Link>
        </div>

        {/* Avatar + identity */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-5">
          <div className="h-1 w-full" style={{ background: `linear-gradient(90deg,${GOLD_DK},${GOLD_LT},${GOLD})` }} />
          <div className="p-6 flex items-center gap-5 flex-wrap">
            <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 flex items-center justify-center text-2xl font-bold text-white shrink-0"
              style={{ borderColor: GOLD, background: avatar ? undefined : `linear-gradient(135deg,${GOLD_DK},${GOLD_LT})` }}>
              {avatar ? <img src={avatar} alt="avatar" className="w-full h-full object-cover" /> : (me.fullName?.[0]?.toUpperCase() || '?')}
            </div>
            <div>
              <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
              <button onClick={() => fileRef.current?.click()} className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: GOLD_DK }}>Upload photo</button>
              {avatar && <button onClick={() => setAvatar('')} className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-200 ml-2 hover:bg-slate-50">Remove</button>}
              <p className="text-xs text-slate-400 mt-2">{me.email} · <span className="capitalize">{me.role?.replace(/_/g, ' ')}</span></p>
            </div>
          </div>
        </div>

        {/* Editable details */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
          <h2 className="font-bold text-slate-900 mb-4">Details</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {field('fullName', 'Full name')}
            {field('phone', 'Phone')}
            {field('company', 'Company / business')}
            {field('momoNumber', 'Mobile Money number')}
            {field('region', 'Region')}
            {field('district', 'District')}
            <div className="sm:col-span-2">{field('address', 'Address')}</div>
            {isPartner && (
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Duty status</span>
                <select value={form.dutyStatus} onChange={(e) => setForm({ ...form, dutyStatus: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                  <option value="available">🟢 Available for deliveries</option>
                  <option value="busy">🟠 Busy</option>
                  <option value="offline">⚪ Offline</option>
                </select>
              </label>
            )}
          </div>
          {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
          {savedMsg && <p className="text-sm text-emerald-700 mt-3">{savedMsg}</p>}
          <button onClick={save} className="mt-4 text-white font-semibold px-5 py-2 rounded-lg" style={{ background: GOLD_DK }}>Save changes</button>
        </div>

        {/* Password */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-bold text-slate-900 mb-4">Reset password</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Current password</span>
              <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">New password</span>
              <input type="password" value={nw} onChange={(e) => setNw(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>
          {pwMsg && <p className="text-sm mt-3" style={{ color: pwMsg.includes('changed') ? '#047857' : '#dc2626' }}>{pwMsg}</p>}
          <button onClick={changePw} className="mt-4 font-semibold px-5 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">Change password</button>
        </div>
      </div>
    </div>
  );
}
