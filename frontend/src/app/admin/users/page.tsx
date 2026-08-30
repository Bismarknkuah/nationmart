'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI, userMgmtAPI, isLoggedIn } from '../../../lib/api';
import { getRoleProfile, formatRole } from '../../../lib/roleConfig';
import { DashPage, DashHeader, DashBody, HeaderAction, Panel, Empty } from '../../../components/ui/Dash';

/**
 * User management — add, edit, reassign, suspend, reset.
 *
 * The role dropdown is populated from `assignableRoles`, which the server
 * computes from the signed-in actor's own level, so the UI can only ever offer
 * what the backend would allow. Every mutation is re-checked server-side too.
 */

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
  flagged: 'bg-amber-50 text-amber-700 border-amber-200',
  pending: 'bg-slate-100 text-slate-500 border-slate-200',
};

export default function UserManagementPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [assignable, setAssignable] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login?redirect=/admin/users'); return; }
    authAPI.me().then((u) => {
      const user = u.user || u;
      const prof = getRoleProfile(user.role);
      if (prof.level > 4) { router.replace('/dashboard'); return; }  // admins only
      setReady(true);
    }).catch(() => router.push('/auth/login?redirect=/admin/users'));
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await userMgmtAPI.list({
        search: search || undefined, role: roleFilter || undefined,
        status: statusFilter || undefined, page, limit: 25,
      });
      setUsers(r.users || []);
      setTotal(r.total || 0);
      setAssignable(r.assignableRoles || []);
    } catch (e: any) { setErr(e.message || 'Could not load users.'); }
    finally { setLoading(false); }
  }, [search, roleFilter, statusFilter, page]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  async function act(fn: () => Promise<any>, ok: string) {
    setErr('');
    try { await fn(); flash(ok); load(); }
    catch (e: any) { setErr(e.message); }
  }

  if (!ready) {
    return <DashPage><div className="min-h-[50vh] flex items-center justify-center text-slate-400">Checking access…</div></DashPage>;
  }

  return (
    <DashPage>
      <DashHeader
        eyebrow="Administration"
        title="User Management"
        subtitle="Add, edit, reassign, and suspend accounts. You can only manage roles below your own."
        icon="👥"
        accent="indigo"
        actions={
          <>
            <HeaderAction href="/office">← Office</HeaderAction>
            <HeaderAction onClick={() => setShowCreate(true)} primary>+ Add user</HeaderAction>
          </>
        }
      />

      <DashBody>
        {/* Filters */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-slate-600">Search</label>
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Name, email or phone…"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Role</label>
            <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              <option value="">All roles</option>
              {assignable.map((r) => <option key={r} value={r}>{formatRole(r)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Status</label>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="flagged">Flagged</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>

        {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{err}</div>}
        {msg && <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">{msg}</div>}

        <Panel title={`${total} user${total === 1 ? '' : 's'}`}>
          {loading ? (
            <div className="py-8 text-center text-slate-400 text-sm">Loading…</div>
          ) : users.length === 0 ? (
            <Empty>No users match those filters.</Empty>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 text-sm">
                        {u.fullName}
                        <span className={`ml-2 text-[11px] px-2 py-0.5 rounded-full border ${STATUS_STYLE[u.status] || ''}`}>{u.status}</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {u.email} · {u.phone || 'no phone'} · <span className="capitalize">{formatRole(u.role)}</span>
                        {u.district ? ` · ${u.district}` : u.region ? ` · ${u.region}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      <button onClick={() => setEditing(u)}
                        className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50">Edit</button>
                      {u.status === 'active' ? (
                        <button onClick={() => act(() => userMgmtAPI.setStatus(u.id, 'suspended'), 'User suspended.')}
                          className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">Suspend</button>
                      ) : (
                        <button onClick={() => act(() => userMgmtAPI.setStatus(u.id, 'active'), 'User reactivated.')}
                          className="text-xs px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50">Reactivate</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {total > 25 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">← Prev</button>
              <span className="text-slate-500">Page {page} of {Math.ceil(total / 25)}</span>
              <button disabled={page >= Math.ceil(total / 25)} onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Next →</button>
            </div>
          )}
        </Panel>
      </DashBody>

      {showCreate && (
        <CreateUserModal assignable={assignable}
          onClose={() => setShowCreate(false)}
          onCreated={(m) => { setShowCreate(false); flash(m); load(); }} />
      )}
      {editing && (
        <EditUserModal user={editing} assignable={assignable}
          onClose={() => setEditing(null)}
          onSaved={(m) => { setEditing(null); flash(m); load(); }}
          onError={setErr} />
      )}
    </DashPage>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function CreateUserModal({ assignable, onClose, onCreated }: { assignable: string[]; onClose: () => void; onCreated: (m: string) => void }) {
  const [f, setF] = useState({ fullName: '', email: '', phone: '', password: '', role: assignable[0] || 'seller', region: '', district: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit() {
    setBusy(true); setErr('');
    try {
      const r = await userMgmtAPI.create(f);
      onCreated(r.message);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="Add a user" onClose={onClose}>
      {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-2.5 text-sm text-red-700">{err}</div>}
      <div className="space-y-3">
        <Field label="Full name" value={f.fullName} onChange={(v) => set('fullName', v)} />
        <Field label="Email" value={f.email} onChange={(v) => set('email', v)} type="email" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" value={f.phone} onChange={(v) => set('phone', v)} />
          <Field label="Temp password" value={f.password} onChange={(v) => set('password', v)} type="text" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Role</label>
          <select value={f.role} onChange={(e) => set('role', e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
            {assignable.map((r) => <option key={r} value={r}>{formatRole(r)}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Region (optional)" value={f.region} onChange={(v) => set('region', v)} />
          <Field label="District (optional)" value={f.district} onChange={(v) => set('district', v)} />
        </div>
      </div>
      <button onClick={submit} disabled={busy || !f.fullName || !f.email || !f.password}
        className="mt-4 w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50">
        {busy ? 'Creating…' : 'Create user'}
      </button>
    </Modal>
  );
}

function EditUserModal({ user, assignable, onClose, onSaved, onError }: { user: any; assignable: string[]; onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void }) {
  const [f, setF] = useState({ fullName: user.fullName || '', phone: user.phone || '', region: user.region || '', district: user.district || '' });
  const [role, setRole] = useState(user.role);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const canReassign = assignable.includes(user.role);   // only if actor outranks current role

  async function save() {
    setBusy(true);
    try {
      await userMgmtAPI.update(user.id, f);
      if (role !== user.role) await userMgmtAPI.changeRole(user.id, role);
      if (newPassword) await userMgmtAPI.resetPassword(user.id, newPassword);
      onSaved('Changes saved.');
    } catch (e: any) { onError(e.message); onClose(); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={`Edit ${user.fullName}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Full name" value={f.fullName} onChange={(v) => set('fullName', v)} />
        <Field label="Phone" value={f.phone} onChange={(v) => set('phone', v)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Region" value={f.region} onChange={(v) => set('region', v)} />
          <Field label="District" value={f.district} onChange={(v) => set('district', v)} />
        </div>
        {canReassign && (
          <div>
            <label className="text-xs font-medium text-slate-600">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              {[...new Set([user.role, ...assignable])].map((r) => <option key={r} value={r}>{formatRole(r)}</option>)}
            </select>
          </div>
        )}
        <Field label="Reset password (leave blank to keep)" value={newPassword} onChange={setNewPassword} type="text" />
      </div>
      <button onClick={save} disabled={busy}
        className="mt-4 w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50">
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </Modal>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
    </div>
  );
}
