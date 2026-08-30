'use client';
import { useEffect, useState, useRef } from 'react';
import { payoutsAPI } from '../lib/api';

/**
 * The payments office.
 *
 * One component, used from every earning role's dashboard (seller, rider,
 * driver, wholesaler, manufacturer) and from a buyer's wallet. It does the whole
 * job the backend supports:
 *   • see your saved cards, MoMo and bank accounts
 *   • add MoMo or a bank account (with the bank name-check before saving)
 *   • set a default, remove one
 *   • withdraw earnings — and see why a withdrawal is blocked, if it is
 *
 * Cards are added by paying, not here (Paystack hands us the reusable token on a
 * successful charge), so this screen only *shows* them.
 */

type Method = {
  id: string; kind: 'card' | 'mobile_money' | 'bank_account'; label: string;
  isDefault: boolean; verified: boolean; canPayIn: boolean; canPayOut: boolean;
  last4?: string; brand?: string; phone?: string; network?: string;
  bankName?: string; accountName?: string; accountNumberMasked?: string;
};

const KIND_ICON: Record<string, string> = {
  card: '💳', mobile_money: '📱', bank_account: '🏦',
};

const NETWORKS = [
  { id: 'mtn', label: 'MTN MoMo' },
  { id: 'telecel', label: 'Telecel Cash' },
  { id: 'airteltigo', label: 'AirtelTigo Money' },
] as const;

export default function PaymentsOffice({
  canWithdraw = true,
  accent = '#C8A24B',
}: { canWithdraw?: boolean; accent?: string }) {
  const [methods, setMethods] = useState<Method[]>([]);
  const [available, setAvailable] = useState(0);
  const [minimum, setMinimum] = useState(10);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [adding, setAdding] = useState<'momo' | 'bank' | null>(null);
  // Set when the signup flow routed the user here to finish adding a payout
  // destination (?setup=payout). We highlight the section and pre-open the form.
  const [setupPrompt, setSetupPrompt] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    setErr('');
    try {
      const m = await payoutsAPI.methods();
      setMethods(m.methods || []);
      if (canWithdraw) {
        const p = await payoutsAPI.mine();
        setAvailable(p.available || 0);
        setMinimum(p.minimum || 10);
        setPayouts(p.payouts || []);
      }
    } catch (e: any) {
      setErr(e.message || 'Could not load your payment methods.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Respond to ?setup=payout from the signup redirect: scroll here, and open the
  // bank form (the non-Ghana seller who arrives this way needs a bank account).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('setup') === 'payout') {
      setSetupPrompt(true);
      setTimeout(() => {
        rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 400);
    }
  }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  async function setDefault(id: string) {
    try { await payoutsAPI.setDefault(id); flash('Default updated.'); load(); }
    catch (e: any) { setErr(e.message); }
  }
  async function remove(id: string) {
    setErr('');
    try { await payoutsAPI.remove(id); flash('Removed.'); load(); }
    catch (e: any) { setErr(e.message); }   // e.g. "the only place we can pay you"
  }

  const payoutMethods = methods.filter((m) => m.canPayOut);
  const noPayout = payoutMethods.length === 0;

  // When signup sent them here and they still have no payout destination, open
  // the bank form straight away — that's the one thing they came to do.
  useEffect(() => {
    if (setupPrompt && !loading && noPayout && adding === null) {
      setAdding('bank');
    }
  }, [setupPrompt, loading, noPayout, adding]);

  return (
    <div ref={rootRef} className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
      style={setupPrompt ? { boxShadow: `0 0 0 3px ${accent}55` } : undefined}>
      <div className="h-1 w-full" style={{ background: accent }} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-slate-800 text-lg">Payments office</h3>
          {canWithdraw && (
            <div className="text-right">
              <div className="text-[11px] text-slate-500 uppercase tracking-wide">Available</div>
              <div className="text-xl font-bold" style={{ color: accent }}>
                ₵{available.toLocaleString()}
              </div>
            </div>
          )}
        </div>
        <p className="text-sm text-slate-500 mb-4">
          How you get paid and pay. Cards and mobile money can pay in; mobile money
          and bank accounts can be paid out to.
        </p>

        {setupPrompt && (
          <div className="mb-4 rounded-xl bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-800">
            👋 Almost there — add a payout method so we can send your earnings.
            You’ll need at least one before you can list anything for sale.
          </div>
        )}

        {noPayout && (
          <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            ⚠️ You have no payout destination yet. Add mobile money or a bank account
            so we have somewhere to send your earnings.
          </div>
        )}

        {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{err}</div>}
        {msg && <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">{msg}</div>}

        {loading ? (
          <div className="py-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
          <>
            <div className="space-y-2">
              {methods.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                  <span className="text-2xl">{KIND_ICON[m.kind]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 truncate">
                      {m.label}
                      {m.isDefault && (
                        <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full text-white" style={{ background: accent }}>Default</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {m.kind === 'bank_account' && m.accountName ? m.accountName : null}
                      {m.canPayOut ? ' · can receive payouts' : ' · pay-in only'}
                    </div>
                  </div>
                  {!m.isDefault && (
                    <button onClick={() => setDefault(m.id)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50">
                      Make default
                    </button>
                  )}
                  <button onClick={() => remove(m.id)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                    Remove
                  </button>
                </div>
              ))}
              {methods.length === 0 && (
                <div className="text-sm text-slate-400 py-4 text-center">Nothing saved yet.</div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => setAdding(adding === 'momo' ? null : 'momo')}
                className="text-sm px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-medium">
                📱 Add mobile money
              </button>
              <button onClick={() => setAdding(adding === 'bank' ? null : 'bank')}
                className="text-sm px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-medium">
                🏦 Add bank account
              </button>
            </div>

            {adding === 'momo' && <AddMomo accent={accent} onDone={() => { setAdding(null); flash('Mobile money added.'); load(); }} onError={setErr} />}
            {adding === 'bank' && <AddBank accent={accent} onDone={() => { setAdding(null); flash('Bank account added.'); load(); }} onError={setErr} />}

            {canWithdraw && !noPayout && (
              <Withdraw
                accent={accent} available={available} minimum={minimum}
                methods={payoutMethods}
                onDone={(m) => { flash(m); load(); }}
                onError={setErr}
              />
            )}

            {canWithdraw && payouts.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Recent withdrawals</div>
                <div className="space-y-1.5">
                  {payouts.slice(0, 5).map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                      <span className="text-slate-600">{p.destination}</span>
                      <span className="font-medium">₵{Number(p.amount).toLocaleString()}</span>
                      <PayoutStatus status={p.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PayoutStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-600', processing: 'bg-blue-50 text-blue-700',
    paid: 'bg-emerald-50 text-emerald-700', failed: 'bg-red-50 text-red-700',
    reversed: 'bg-amber-50 text-amber-700',
  };
  const label: Record<string, string> = {
    pending: 'Queued', processing: 'On its way', paid: 'Received',
    failed: 'Returned', reversed: 'Returned',
  };
  return <span className={`text-[11px] px-2 py-0.5 rounded-full ${map[status] || 'bg-slate-100'}`}>{label[status] || status}</span>;
}

function AddMomo({ accent, onDone, onError }: { accent: string; onDone: () => void; onError: (m: string) => void }) {
  const [phone, setPhone] = useState('');
  const [network, setNetwork] = useState<'mtn' | 'telecel' | 'airteltigo'>('mtn');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); onError('');
    try { await payoutsAPI.addMomo(phone, network); onDone(); }
    catch (e: any) { onError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600">Network</label>
          <select value={network} onChange={(e) => setNetwork(e.target.value as any)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
            {NETWORKS.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">MoMo number</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0244 000 000"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
      </div>
      <button onClick={save} disabled={busy || phone.length < 9}
        className="mt-3 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
        style={{ background: accent }}>
        {busy ? 'Saving…' : 'Save mobile money'}
      </button>
    </div>
  );
}

/**
 * Adding a bank account is a two-step confirmation, on purpose. We resolve the
 * account with the bank and make the user confirm the NAME the bank returns
 * before we save it. That check is the cheapest way to stop a mistyped digit
 * sending someone's earnings to a stranger.
 */
function AddBank({ accent, onDone, onError }: { accent: string; onDone: () => void; onError: (m: string) => void }) {
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [resolved, setResolved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    payoutsAPI.banks().then((r) => {
      const onlyBanks = (r.banks || []).filter((b) => b.type !== 'mobile_money');
      setBanks(onlyBanks);
      if (onlyBanks[0]) setBankCode(onlyBanks[0].code);
    }).catch(() => {});
  }, []);

  async function check() {
    setBusy(true); onError(''); setResolved(null);
    try {
      const r = await payoutsAPI.resolveBank(accountNumber, bankCode);
      setResolved(r.accountName);
    } catch (e: any) { onError(e.message); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); onError('');
    try {
      const bankName = banks.find((b) => b.code === bankCode)?.name || 'Bank';
      await payoutsAPI.addBank(accountNumber, bankCode, bankName);
      onDone();
    } catch (e: any) { onError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600">Bank</label>
          <select value={bankCode} onChange={(e) => { setBankCode(e.target.value); setResolved(null); }}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
            {banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Account number</label>
          <input value={accountNumber} onChange={(e) => { setAccountNumber(e.target.value); setResolved(null); }}
            placeholder="1234567890"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
      </div>

      {!resolved ? (
        <button onClick={check} disabled={busy || accountNumber.length < 5 || !bankCode}
          className="mt-3 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
          style={{ background: accent }}>
          {busy ? 'Checking…' : 'Verify account'}
        </button>
      ) : (
        <div className="mt-3">
          <div className="rounded-lg bg-white border border-emerald-200 p-3 text-sm">
            Money will be sent to <span className="font-semibold">{resolved}</span>. Is that right?
          </div>
          <div className="mt-2 flex gap-2">
            <button onClick={save} disabled={busy}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ background: accent }}>
              {busy ? 'Saving…' : 'Yes, save it'}
            </button>
            <button onClick={() => setResolved(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm">
              No, edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Withdraw({
  accent, available, minimum, methods, onDone, onError,
}: {
  accent: string; available: number; minimum: number;
  methods: Method[]; onDone: (m: string) => void; onError: (m: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [methodId, setMethodId] = useState(methods.find((m) => m.isDefault)?.id || methods[0]?.id || '');
  const [busy, setBusy] = useState(false);

  const value = Number(amount) || 0;
  const tooLow = value > 0 && value < minimum;
  const tooHigh = value > available;

  async function submit() {
    setBusy(true); onError('');
    try {
      const r = await payoutsAPI.request(methodId, value);
      onDone(r.message || 'Withdrawal sent.');
      setAmount('');
    } catch (e: any) { onError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-5 rounded-xl border-2 border-dashed p-4" style={{ borderColor: `${accent}55` }}>
      <div className="text-sm font-semibold text-slate-700 mb-2">Withdraw earnings</div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600">To</label>
          <select value={methodId} onChange={(e) => setMethodId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
            {methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Amount (₵)</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
            placeholder={`min ₵${minimum}`}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
      </div>
      {tooLow && <div className="mt-2 text-xs text-amber-600">The smallest withdrawal is ₵{minimum}.</div>}
      {tooHigh && <div className="mt-2 text-xs text-red-600">That is more than your available ₵{available.toLocaleString()}.</div>}
      <button onClick={submit} disabled={busy || value <= 0 || tooLow || tooHigh || !methodId}
        className="mt-3 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
        style={{ background: accent }}>
        {busy ? 'Sending…' : `Withdraw ₵${value ? value.toLocaleString() : ''}`}
      </button>
    </div>
  );
}
