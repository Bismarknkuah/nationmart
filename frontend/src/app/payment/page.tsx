'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { paymentsAPI } from '../../lib/api';

type Network = 'mtn' | 'telecel' | 'airteltigo';
type Step = 'select' | 'prompt' | 'otp' | 'success' | 'failed';

const NETWORKS: { value: Network; label: string; color: string }[] = [
  { value: 'mtn', label: 'MTN MoMo', color: 'bg-yellow-400' },
  { value: 'telecel', label: 'Telecel Cash', color: 'bg-red-500' },
  { value: 'airteltigo', label: 'AirtelTigo Money', color: 'bg-blue-500' },
];

function PaymentContent() {
  const sp = useSearchParams();
  const purpose = (sp.get('purpose') as 'order' | 'subscription' | 'wallet_topup') || 'order';
  const orderId = sp.get('orderId') || undefined;
  const amountHint = Number(sp.get('amount') || '0');
  const returnTo = sp.get('return') || '/dashboard';
  const returnUrl = sp.get('return') || '/dashboard';

  const [network, setNetwork] = useState<Network>('mtn');
  const [method, setMethod] = useState<'momo' | 'card'>('momo');
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<Step>('select');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState(amountHint);
  const [message, setMessage] = useState('');
  const [simulated, setSimulated] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const validPhone = (p: string) => /^0\d{9}$/.test(p.replace(/\s/g, ''));

  const startPolling = (ref: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await paymentsAPI.verify(ref);
        const state = res.status || res.state;  // backend returns `status`
        if (state === 'paid' || state === 'success') {
          if (pollRef.current) clearInterval(pollRef.current);
          setStep('success');
        } else if (state === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          setMessage(res.message || 'Payment failed or was declined.');
          setStep('failed');
        }
      } catch { /* keep polling */ }
    }, 3000);
  };

  const initiate = async () => {
    const clean = phone.replace(/\s/g, '');
    if (!validPhone(clean)) { setError('Enter a valid 10-digit Ghana number (e.g. 0240000000)'); return; }
    setError(''); setLoading(true);
    try {
      const res = await paymentsAPI.initiateMomo({ purpose, orderId, amount: purpose === 'wallet_topup' ? amountHint : undefined, network, phone: clean });
      setReference(res.reference);
      setAmount(res.amount);
      setMessage(res.displayText || res.message || 'Approve the prompt on your phone.');
      setSimulated(!!res.simulated);
      // Some networks ask for an OTP instead of an on-screen approval.
      if (res.needsOtp || res.status === 'send_otp') {
        setStep('otp');
      } else {
        setStep('prompt');
        startPolling(res.reference);
      }
    } catch (err: any) {
      setError(err.message || 'Could not start payment.');
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async () => {
    setError(''); setLoading(true);
    try {
      const res = await paymentsAPI.submitOtp(reference, otp);
      if (res.status === 'paid' || res.status === 'success') {
        setStep('success');
      } else {
        setStep('prompt');
        startPolling(reference);
      }
    } catch (err: any) {
      setError(err.message || 'That code was not accepted.');
    } finally { setLoading(false); }
  };

  const payByCard = async () => {
    setError(''); setLoading(true);
    try {
      const res = await paymentsAPI.card(purpose, orderId);
      if (res.authorizationUrl) {
        window.location.href = res.authorizationUrl; // hosted Paystack card page
        return;
      }
      // Simulated success (no live keys) — card data is never collected here.
      setReference(res.reference); setAmount(res.amount); setStep('success');
    } catch (err: any) {
      setError(err.message || 'Could not start card payment.');
    } finally { setLoading(false); }
  };

  const simulateApprove = async () => {
    try {
      const res = await paymentsAPI.verify(reference);
      if (res.state === 'success') { if (pollRef.current) clearInterval(pollRef.current); setStep('success'); }
    } catch { /* ignore */ }
  };

  if (step === 'success') {
    return (
      <Shell>
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5 text-4xl">✓</div>
          <h2 className="text-2xl font-bold text-stone-900 mb-2" style={{ fontFamily: 'Georgia, serif' }}>Payment Successful</h2>
          <p className="text-stone-500 text-sm mb-4">
            {purpose === 'subscription'
              ? 'Your subscription is active. Your listings stay live.'
              : 'Your order is paid and the seller has been notified.'}
          </p>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 mb-6">
            <p className="font-semibold">GHS {amount.toLocaleString()}</p>
            <p className="text-xs mt-1">Reference: {reference}</p>
          </div>
          <Link href={returnUrl} className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm">
            Continue →
          </Link>
        </div>
      </Shell>
    );
  }

  if (step === 'failed') {
    return (
      <Shell>
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5 text-4xl">✕</div>
          <h2 className="text-2xl font-bold text-stone-900 mb-2" style={{ fontFamily: 'Georgia, serif' }}>Payment Failed</h2>
          <p className="text-stone-500 text-sm mb-6">{message}</p>
          <button onClick={() => { setStep('select'); setError(''); }}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm">
            Try Again
          </button>
        </div>
      </Shell>
    );
  }

  if (step === 'otp') {
    return (
      <Shell>
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4 text-3xl">🔑</div>
          <h2 className="text-xl font-bold text-stone-900 mb-2">Enter the code</h2>
          <p className="text-stone-500 text-sm mb-4">{message || 'Your network sent a one-time code. Enter it to approve the payment.'}</p>
          <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric"
            placeholder="OTP" className="w-full text-center tracking-widest text-lg border-2 border-stone-200 rounded-xl py-3 mb-3" />
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <button onClick={submitOtp} disabled={loading || otp.length < 4}
            className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl disabled:opacity-50">
            {loading ? 'Checking…' : 'Approve payment'}
          </button>
        </div>
      </Shell>
    );
  }

  if (step === 'prompt') {
    return (
      <Shell>
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
            <svg className="animate-spin w-10 h-10 text-amber-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-stone-900 mb-2">Approve on your phone</h2>
          <p className="text-stone-500 text-sm mb-4">{message}</p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 mb-4">
            <p className="font-semibold">GHS {amount.toLocaleString()} · {NETWORKS.find(n => n.value === network)?.label}</p>
            <p className="text-xs mt-1">Reference: {reference}</p>
          </div>
          <p className="text-xs text-stone-400 mb-4">Waiting for confirmation… do not close this page.</p>
          {simulated && (
            <button onClick={simulateApprove}
              className="w-full border-2 border-amber-400 text-amber-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-amber-50">
              ✅ Simulate approval (dev mode)
            </button>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h2 className="text-xl font-bold text-stone-900 mb-1" style={{ fontFamily: 'Georgia, serif' }}>
        {purpose === 'subscription' ? 'Pay Subscription' : 'Mobile Money Payment'}
      </h2>
      <p className="text-stone-500 text-sm mb-5">
        {amount > 0 ? `Amount: GHS ${amount.toLocaleString()}` : 'Enter your mobile money details to pay.'}
      </p>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">⚠️ {error}</div>}

      <label className="text-sm font-medium text-stone-700 block mb-2">Payment method</label>
      <div className={`grid ${purpose === 'wallet_topup' ? 'grid-cols-1' : 'grid-cols-2'} gap-2 mb-4`}>
        <button onClick={() => setMethod('momo')}
          className={`rounded-xl border-2 px-2 py-3 text-sm font-semibold transition-all ${method === 'momo' ? 'border-amber-400 bg-amber-50' : 'border-stone-200 hover:border-stone-300'}`}>
          📱 Mobile Money
        </button>
        {purpose !== 'wallet_topup' && (
          <button onClick={() => setMethod('card')}
            className={`rounded-xl border-2 px-2 py-3 text-sm font-semibold transition-all ${method === 'card' ? 'border-amber-400 bg-amber-50' : 'border-stone-200 hover:border-stone-300'}`}>
            💳 Visa / Mastercard
          </button>
        )}
      </div>

      {method === 'momo' ? (
        <>
          <label className="text-sm font-medium text-stone-700 block mb-2">Network</label>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {NETWORKS.map(n => (
              <button key={n.value} onClick={() => setNetwork(n.value)}
                className={`rounded-xl border-2 px-2 py-3 text-xs font-semibold transition-all ${network === n.value ? 'border-amber-400 bg-amber-50' : 'border-stone-200 hover:border-stone-300'}`}>
                <div className={`w-6 h-6 rounded-full ${n.color} mx-auto mb-1.5`} />
                {n.label}
              </button>
            ))}
          </div>

          <label className="text-sm font-medium text-stone-700 block mb-1.5">Mobile Money Number</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0240000000"
            className="w-full border border-stone-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-5" />

          <button onClick={initiate} disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl text-sm">
            {loading ? 'Sending prompt…' : 'Send Payment Prompt'}
          </button>
          <p className="text-xs text-stone-400 text-center mt-3">🔒 Powered by Paystack Mobile Money</p>
        </>
      ) : (
        <>
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-sm text-stone-600 mb-5">
            You'll be taken to a secure card page to enter your Visa/Mastercard details.
            <span className="block text-xs text-stone-400 mt-1">🔒 Card details are entered on the secure processor and are never stored on NationMart or shown to any officer.</span>
          </div>
          <button onClick={payByCard} disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl text-sm">
            {loading ? 'Starting…' : 'Pay by Card'}
          </button>
          <p className="text-xs text-stone-400 text-center mt-3">🔒 Secured by Paystack (PCI-DSS)</p>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-16">
      <div className="bg-white rounded-2xl shadow-lg border border-stone-200 p-8 max-w-md w-full">
        {children}
      </div>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<div className="pt-20 text-center text-stone-500">Loading…</div>}>
      <PaymentContent />
    </Suspense>
  );
}
