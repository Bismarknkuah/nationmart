'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { storesAPI, promosAPI, paymentsAPI } from '../../../lib/api';
import { uploadImage } from '../../../lib/upload';
import { STORE_CATEGORIES, STORE_CATEGORY_MAP } from '../../../lib/storeCategories';
import { CategoryIcon } from '../../../components/ui/CategoryIcon';

const PERMISSION_LABELS: Record<string, { label: string; desc: string }> = {
  view_dashboard:     { label: 'View dashboard',      desc: 'See store analytics and KPIs.' },
  manage_products:    { label: 'Manage products',     desc: 'Add, edit, or remove product listings.' },
  manage_inventory:   { label: 'Manage inventory',    desc: 'Update stock quantities and availability.' },
  manage_orders:      { label: 'Manage orders',       desc: 'Confirm, ship, and fulfil incoming orders.' },
  view_finance:       { label: 'View finance',        desc: 'See revenue, payouts and financial reports.' },
  manage_finance:     { label: 'Manage finance',      desc: 'Issue refunds and adjust prices.' },
  manage_promotions:  { label: 'Manage promotions',   desc: 'Create and edit discount codes.' },
  reply_messages:     { label: 'Reply to messages',   desc: 'Chat with buyers on behalf of the store.' },
  edit_storefront:    { label: 'Edit storefront',     desc: 'Change branding, colours, banner and layout.' },
  manage_staff:       { label: 'Manage staff',        desc: 'Add, remove and configure other team members.' },
};

const inputClass = 'w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 bg-white';

export default function StoreManagerPage() {
  const [stores, setStores] = useState<any[]>([]);
  const [max, setMax] = useState(2);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newStore, setNewStore] = useState({
    name: '',
    type: 'general',
    description: '',
    marketScope: 'local' as 'local' | 'international' | 'both',
    contactPhone: '',
    contactEmail: '',
    address: '',
  });

  // Staff form
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRoleLabel, setStaffRoleLabel] = useState('');
  const [staffPerms, setStaffPerms] = useState<string[]>(['view_dashboard']);

  const load = () => {
    storesAPI.mine()
      .then(r => { setStores(r.stores || []); setMax(r.max || 2); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const create = async () => {
    setMsg(null);
    try {
      const r = await storesAPI.create(newStore);
      setMsg({ tone: 'ok', text: 'Store created successfully.' });
      setCreating(false);
      setNewStore({ name: '', type: 'general', description: '', marketScope: 'local', contactPhone: '', contactEmail: '', address: '' });
      load();
      setSelected(r.store);
    } catch (e: any) { setMsg({ tone: 'err', text: e.message }); }
  };

  const togglePerm = (perm: string) =>
    setStaffPerms(p => p.includes(perm) ? p.filter(x => x !== perm) : [...p, perm]);

  const addStaff = async () => {
    if (!selected) return;
    setMsg(null);
    try {
      await storesAPI.addStaff(selected._id, {
        email: staffEmail.toLowerCase().trim(),
        roleLabel: staffRoleLabel || 'Staff',
        permissions: staffPerms,
      });
      setStaffEmail(''); setStaffRoleLabel(''); setStaffPerms(['view_dashboard']);
      setMsg({ tone: 'ok', text: 'Team member added.' });
      // Refresh selected store
      const fresh = await storesAPI.mine();
      setStores(fresh.stores || []);
      setSelected(fresh.stores?.find((s: any) => s._id === selected._id) || null);
    } catch (e: any) { setMsg({ tone: 'err', text: e.message }); }
  };

  const removeStaff = async (userId: string) => {
    if (!selected) return;
    if (!confirm('Remove this team member from the store?')) return;
    try {
      await storesAPI.removeStaff(selected._id, userId);
      const fresh = await storesAPI.mine();
      setStores(fresh.stores || []);
      setSelected(fresh.stores?.find((s: any) => s._id === selected._id) || null);
      setMsg({ tone: 'ok', text: 'Team member removed.' });
    } catch (e: any) { setMsg({ tone: 'err', text: e.message }); }
  };

  const updateStaff = async (userId: string, data: { roleLabel?: string; permissions?: string[] }) => {
    if (!selected) return;
    try {
      await storesAPI.updateStaff(selected._id, userId, data);
      const fresh = await storesAPI.mine();
      setStores(fresh.stores || []);
      setSelected(fresh.stores?.find((s: any) => s._id === selected._id) || null);
    } catch (e: any) { setMsg({ tone: 'err', text: e.message }); }
  };

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-slate-400 text-sm">Loading your stores…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 pt-8 pb-16 px-4">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Manage</p>
            <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>My Stores</h1>
            <p className="text-sm text-slate-500 mt-1">You can open up to {max} stores per account.</p>
          </div>
          {stores.length < max && (
            <button onClick={() => setCreating(true)} className="btn-primary text-sm py-2 px-4">
              + Open a new store
            </button>
          )}
        </div>

        {msg && (
          <div className={`rounded-xl px-4 py-3 mb-4 text-sm ${msg.tone === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {msg.text}
          </div>
        )}

        {/* Create store modal */}
        {creating && (
          <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4" onClick={() => setCreating(false)}>
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
              <h2 className="text-xl font-bold text-slate-900 mb-4">Open a new store</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Store name</label>
                  <input className={inputClass} value={newStore.name} onChange={e => setNewStore({ ...newStore, name: e.target.value })} placeholder="e.g. Sunshine Pharmacy" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Store category</label>
                  <select className={inputClass} value={newStore.type} onChange={e => setNewStore({ ...newStore, type: e.target.value })}>
                    {STORE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">{STORE_CATEGORY_MAP[newStore.type]?.tagline}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Description</label>
                  <textarea className={inputClass} rows={3} value={newStore.description} onChange={e => setNewStore({ ...newStore, description: e.target.value })} placeholder="What does your store sell?" />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">Contact phone <span className="text-xs text-slate-400">(buyers can call/text)</span></label>
                    <input className={inputClass} value={newStore.contactPhone} onChange={e => setNewStore({ ...newStore, contactPhone: e.target.value })} placeholder="0244 000 000" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">Contact email</label>
                    <input className={inputClass} type="email" value={newStore.contactEmail} onChange={e => setNewStore({ ...newStore, contactEmail: e.target.value })} placeholder="store@example.com" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Exact location / address <span className="text-xs text-slate-400">(shown to buyers)</span></label>
                  <input className={inputClass} value={newStore.address} onChange={e => setNewStore({ ...newStore, address: e.target.value })} placeholder="e.g. Shop 14, Adum Market, Kumasi" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Where to list this store</label>
                  <select
                    className={inputClass}
                    value={newStore.marketScope}
                    onChange={e => setNewStore({ ...newStore, marketScope: e.target.value as any })}
                  >
                    <option value="local">Local market only — Ghana buyers</option>
                    <option value="international">International market only — buyers abroad</option>
                    <option value="both">Both markets — local and international</option>
                  </select>
                  <p className="text-xs text-slate-400 mt-1">
                    You can change this later from the store settings.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-6 justify-end">
                <button onClick={() => setCreating(false)} className="btn-secondary text-sm py-2 px-4">Cancel</button>
                <button onClick={create} className="btn-primary text-sm py-2 px-4">Create store</button>
              </div>
            </div>
          </div>
        )}

        {stores.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
            <h3 className="text-lg font-bold text-slate-900">No stores yet</h3>
            <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
              Open your first NationMart store to start listing products. Pick a category that fits your business — we&apos;ll apply a ready-made template you can customise later.
            </p>
            <button onClick={() => setCreating(true)} className="btn-primary mt-6">+ Open my first store</button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-5">

            {/* Store list */}
            <div className="space-y-3">
              {stores.map(s => {
                const cat = STORE_CATEGORY_MAP[s.type] || STORE_CATEGORY_MAP.general;
                const isSelected = selected?._id === s._id;
                return (
                  <button
                    key={s._id}
                    onClick={() => setSelected(s)}
                    className={`w-full text-left bg-white rounded-2xl border p-4 transition-all ${isSelected ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-indigo-200'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg ${cat.swatch.bg} ${cat.swatch.text} border ${cat.swatch.border} flex items-center justify-center shrink-0`}>
                        <CategoryIcon path={cat.iconPath} className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-900 text-sm truncate">{s.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5 capitalize">{cat.label}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs">
                          <span className="text-slate-400">{s.productCount || 0} products</span>
                          {s.isInternational && <span className="text-indigo-600 font-semibold">International</span>}
                          {s.verified && <span className="text-emerald-700 font-semibold">Verified</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Detail pane */}
            <div className="lg:col-span-2 space-y-5">
              {selected ? (
                <>
                  {/* Storefront link & quick actions */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <h2 className="font-bold text-slate-900 text-lg">{selected.name}</h2>
                        <p className="text-xs text-slate-500 capitalize mt-1">{(selected.type || '').replace('_', ' ')} · {selected.region || 'Ghana'}</p>
                      </div>
                      <Link href={`/store/${selected.slug}`} className="btn-secondary text-sm py-2 px-4">View storefront</Link>
                    </div>
                  </div>

                  {/* Business flyer / banner */}
                  <BannerUploader
                    store={selected}
                    onSaved={(updated) => {
                      setSelected(updated);
                      setStores((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
                    }}
                  />

                  {/* Exact store location (map pin) */}
                  <StoreLocation
                    store={selected}
                    onSaved={(updated) => {
                      setSelected(updated);
                      setStores((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
                    }}
                  />

                  {/* Payouts (Paystack split) */}
                  <PayoutSetup
                    store={selected}
                    onSaved={(updated) => {
                      setSelected(updated);
                      setStores((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
                    }}
                  />

                  {/* Team management */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6">
                    <h3 className="font-bold text-slate-900 text-lg mb-1">Team members</h3>
                    <p className="text-sm text-slate-500 mb-5">Add staff to your store and choose exactly what each person can do.</p>

                    {selected.staff && selected.staff.length > 0 ? (
                      <div className="space-y-3 mb-6">
                        {selected.staff.map((m: any) => (
                          <StaffRow
                            key={m.user?._id || m.user}
                            member={m}
                            onRemove={() => removeStaff(m.user?._id || m.user)}
                            onUpdate={(data) => updateStaff(m.user?._id || m.user, data)}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400 mb-6 italic">No team members yet — you&apos;re the only one with access.</p>
                    )}

                    <div className="border-t border-slate-100 pt-5">
                      <h4 className="font-semibold text-slate-800 mb-3 text-sm">Add a team member</h4>
                      <div className="grid sm:grid-cols-2 gap-3 mb-4">
                        <div>
                          <label className="text-xs font-medium text-slate-600 block mb-1">Email address</label>
                          <input className={inputClass} type="email" value={staffEmail} onChange={e => setStaffEmail(e.target.value)} placeholder="staff@example.com" />
                          <p className="text-xs text-slate-400 mt-1">They must already have a NationMart account.</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600 block mb-1">Role label</label>
                          <input className={inputClass} value={staffRoleLabel} onChange={e => setStaffRoleLabel(e.target.value)} placeholder="e.g. Cashier, Branch manager" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-2">Permissions for this person</label>
                        <div className="grid sm:grid-cols-2 gap-2">
                          {Object.entries(PERMISSION_LABELS).map(([perm, info]) => (
                            <label key={perm} className={`flex items-start gap-2.5 p-3 border rounded-lg cursor-pointer transition-colors ${staffPerms.includes(perm) ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                              <input
                                type="checkbox"
                                checked={staffPerms.includes(perm)}
                                onChange={() => togglePerm(perm)}
                                className="mt-0.5"
                              />
                              <div>
                                <p className="text-sm font-semibold text-slate-800">{info.label}</p>
                                <p className="text-xs text-slate-500">{info.desc}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                      <button onClick={addStaff} disabled={!staffEmail} className="btn-primary text-sm py-2 px-4 mt-4 disabled:opacity-50">
                        Add team member
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-400">
                  Select a store from the list to manage it.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PayoutSetup({ store, onSaved }: { store: any; onSaved: (s: any) => void }) {
  const [bank, setBank] = useState('MTN');
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const connected = !!store.paystackSubaccount;

  const save = async () => {
    if (!account.trim()) { setMsg('Enter your MoMo number or bank account.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await paymentsAPI.setupPayout({ storeId: store._id, settlementBank: bank, accountNumber: account.trim() });
      onSaved({ ...store, paystackSubaccount: r.subaccountCode });
      setMsg(r.simulated
        ? `✓ Payout set up (test mode). You'll receive ${r.sellerShare}% of each sale; platform keeps ${r.platformPercent}%.`
        : `✓ Payouts connected. You receive ${r.sellerShare}% of each sale automatically.`);
    } catch (e: any) { setMsg(e.message || 'Could not set up payouts.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="font-bold text-slate-900 text-lg mb-1">Payouts</h3>
      <p className="text-sm text-slate-500 mb-4">
        Connect where your money lands. When a buyer pays, your share is routed to you automatically and the platform keeps its commission.
        {connected && <span className="text-emerald-700 font-semibold"> · ✓ Connected</span>}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <select className={inputClass} value={bank} onChange={(e) => setBank(e.target.value)}>
          <option value="MTN">MTN MoMo</option>
          <option value="VOD">Telecel Cash</option>
          <option value="ATL">AirtelTigo Money</option>
          <option value="GCB">GCB Bank</option>
          <option value="ECO">Ecobank</option>
          <option value="ABSA">Absa</option>
          <option value="STANBIC">Stanbic</option>
          <option value="FIDELITY">Fidelity</option>
        </select>
        <input className={inputClass} value={account} onChange={(e) => setAccount(e.target.value)} placeholder="MoMo number / account no." />
      </div>
      <button onClick={save} disabled={busy} className="btn-primary text-sm py-2 px-4 mt-4 disabled:opacity-50">
        {busy ? 'Connecting…' : connected ? 'Update payout details' : 'Connect payouts'}
      </button>
      {msg && <p className="text-sm text-slate-600 mt-3">{msg}</p>}
    </div>
  );
}

function StoreLocation({ store, onSaved }: { store: any; onSaved: (s: any) => void }) {
  const [lat, setLat] = useState(store.lat ?? '');
  const [lng, setLng] = useState(store.lng ?? '');
  const [address, setAddress] = useState(store.address || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await storesAPI.update(store._id, {
        lat: lat === '' ? undefined : Number(lat),
        lng: lng === '' ? undefined : Number(lng),
        address,
      } as any);
      onSaved(r.store || { ...store, lat: Number(lat), lng: Number(lng), address });
      setMsg('✓ Location saved');
    } catch (e: any) { setMsg(e.message || 'Could not save'); }
    finally { setBusy(false); }
  };

  const useGPS = () => {
    if (!navigator.geolocation) { setMsg('Geolocation not supported on this device.'); return; }
    setMsg('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude.toFixed(6)); setLng(pos.coords.longitude.toFixed(6)); setMsg('Location captured — remember to Save.'); },
      () => setMsg('Could not get your location. Enter it manually.'),
    );
  };

  const hasPin = lat !== '' && lng !== '';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="font-bold text-slate-900 text-lg mb-1">Exact store location</h3>
      <p className="text-sm text-slate-500 mb-4">Pin where your store or warehouse is, so buyers and riders get accurate directions and the right delivery distance.</p>

      <input className={inputClass + ' mb-3'} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street / landmark (e.g. Suame Market, Stall 22)" />
      <div className="grid grid-cols-2 gap-3">
        <input className={inputClass} value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" />
        <input className={inputClass} value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Longitude" />
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button onClick={useGPS} className="text-sm font-semibold px-4 py-2 rounded-lg bg-emerald-600 text-white">📍 Use my current location</button>
        <button onClick={save} disabled={busy} className="btn-primary text-sm py-2 px-4 disabled:opacity-50">{busy ? 'Saving…' : 'Save location'}</button>
        {hasPin && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noreferrer"
            className="text-sm font-semibold px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">Preview on map ↗</a>
        )}
      </div>
      {msg && <p className="text-sm text-slate-600 mt-3">{msg}</p>}
    </div>
  );
}

function BannerUploader({ store, onSaved }: { store: any; onSaved: (s: any) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [headline, setHeadline] = useState(store.theme?.bannerHeadline || store.name || '');
  const [subtext, setSubtext] = useState(store.theme?.bannerSubtext || store.description || '');
  const bannerUrl = store.theme?.bannerUrl || '';
  const logoUrl = store.theme?.logoUrl || '';

  const saveTheme = async (patch: Record<string, any>) => {
    setBusy(true); setErr('');
    try {
      const r = await storesAPI.update(store._id, { theme: { ...store.theme, ...patch } });
      onSaved(r.store || { ...store, theme: { ...store.theme, ...patch } });
    } catch (e: any) {
      setErr(e.message || 'Could not save. Try a smaller image.');
    } finally { setBusy(false); }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>, key: 'bannerUrl' | 'logoUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file.'); return; }
    setBusy(true); setErr('');
    try {
      const url = await uploadImage(file, key === 'logoUrl' ? { maxPx: 400 } : { maxPx: 1600 });
      await saveTheme({ [key]: url });
    } catch (e: any) { setErr(e.message || 'Could not upload that image.'); setBusy(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="font-bold text-slate-900 text-lg mb-1">Business flyer / banner</h3>
      <p className="text-sm text-slate-500 mb-4">Upload a custom flyer that appears across the top of your storefront. Recommended: a wide image (about 1600 × 600), under 3 MB.</p>

      {/* Live preview */}
      <div className="rounded-xl overflow-hidden border border-slate-200 mb-4">
        <div className="h-40 relative flex items-center justify-center text-center px-4"
          style={{ background: bannerUrl ? `url(${bannerUrl}) center/cover` : `linear-gradient(135deg, ${store.theme?.primaryColor || '#312e81'}, ${store.theme?.accentColor || '#818cf8'})` }}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative text-white">
            <p className="text-2xl font-bold drop-shadow">{headline || store.name}</p>
            <p className="text-sm text-white/90 mt-1">{subtext}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className={`text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer text-white ${busy ? 'opacity-50' : ''}`} style={{ background: '#9A7A2E' }}>
          {busy ? 'Uploading…' : bannerUrl ? 'Replace flyer' : 'Upload flyer'}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e, 'bannerUrl')} disabled={busy} />
        </label>
        {bannerUrl && (
          <button onClick={() => saveTheme({ bannerUrl: '' })} disabled={busy}
            className="text-sm font-semibold px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50">
            Remove flyer
          </button>
        )}
      </div>

      {/* Store logo */}
      <div className="mt-6 pt-5 border-t border-slate-100">
        <h4 className="font-bold text-slate-900 mb-1">Store logo</h4>
        <p className="text-sm text-slate-500 mb-3">A square logo shown on your storefront and listings. Recommended: 400 × 400.</p>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center shrink-0">
            {logoUrl ? <img src={logoUrl} alt="logo" className="w-full h-full object-cover" /> : <span className="text-2xl text-slate-300">🏪</span>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className={`text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer text-white ${busy ? 'opacity-50' : ''}`} style={{ background: '#0a6e43' }}>
              {busy ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e, 'logoUrl')} disabled={busy} />
            </label>
            {logoUrl && (
              <button onClick={() => saveTheme({ logoUrl: '' })} disabled={busy}
                className="text-sm font-semibold px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50">
                Remove logo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Headline / subtext */}
      <div className="grid sm:grid-cols-2 gap-3 mt-5">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Banner headline</label>
          <input className={inputClass} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder={store.name} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Banner subtext</label>
          <input className={inputClass} value={subtext} onChange={(e) => setSubtext(e.target.value)} placeholder="A short tagline" />
        </div>
      </div>
      <button onClick={() => saveTheme({ bannerHeadline: headline, bannerSubtext: subtext })} disabled={busy}
        className="btn-primary text-sm py-2 px-4 mt-3 disabled:opacity-50">Save banner text</button>

      {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
    </div>
  );
}

function StaffRow({ member, onRemove, onUpdate }: {
  member: any;
  onRemove: () => void;
  onUpdate: (data: { roleLabel?: string; permissions?: string[] }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [perms, setPerms] = useState<string[]>(member.permissions || []);
  const [roleLabel, setRoleLabel] = useState<string>(member.roleLabel || 'Staff');

  const user = member.user || {};
  const togglePerm = (p: string) => setPerms(arr => arr.includes(p) ? arr.filter(x => x !== p) : [...arr, p]);

  const save = () => {
    onUpdate({ roleLabel, permissions: perms });
    setEditing(false);
  };

  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-sm font-bold">
            {(user.fullName || user.email || '?')[0]?.toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-slate-800 text-sm">{user.fullName || user.email}</p>
            <p className="text-xs text-slate-500">{member.roleLabel} · {(member.permissions || []).length} permissions</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing(!editing)} className="text-xs font-semibold text-indigo-700 hover:underline">
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button onClick={onRemove} className="text-xs font-semibold text-red-600 hover:underline">Remove</button>
        </div>
      </div>

      {editing && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="mb-3">
            <label className="text-xs font-medium text-slate-600 block mb-1">Role label</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={roleLabel}
              onChange={e => setRoleLabel(e.target.value)}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-2 mb-3">
            {Object.entries(PERMISSION_LABELS).map(([perm, info]) => (
              <label key={perm} className={`flex items-start gap-2 p-2.5 border rounded-lg cursor-pointer text-sm ${perms.includes(perm) ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200'}`}>
                <input type="checkbox" checked={perms.includes(perm)} onChange={() => togglePerm(perm)} className="mt-0.5" />
                <span className="font-semibold text-slate-700">{info.label}</span>
              </label>
            ))}
          </div>
          <button onClick={save} className="btn-primary text-sm py-1.5 px-3">Save changes</button>
        </div>
      )}
    </div>
  );
}
