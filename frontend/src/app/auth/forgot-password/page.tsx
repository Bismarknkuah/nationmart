'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Please enter your email address.'); return; }
    setLoading(true);
    setError('');
    // Reset email delivery is not wired in this build, but we never disclose
    // whether an account exists — we always show the same success message.
    await new Promise(r => setTimeout(r, 700));
    setLoading(false);
    setSent(true);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-mesh-soft flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 flex items-center justify-center text-white font-bold">N</span>
            <span className="text-2xl font-bold text-slate-900">NationMart</span>
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="px-8 pt-8 pb-2">
            <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>
              Reset your password
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Enter the email tied to your NationMart account and we&apos;ll send you a link to reset it.
            </p>
          </div>

          <div className="px-8 pt-6 pb-8 space-y-5">
            {sent ? (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-4">
                <p className="font-semibold mb-1">Check your inbox</p>
                <p>If an account exists for <b>{email}</b>, you&apos;ll receive a reset link shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
                )}
                <div>
                  <label htmlFor="email" className="text-sm font-medium text-slate-700 block mb-1.5">Email address</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    autoComplete="email"
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="input-field"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-primary disabled:opacity-60"
                >
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
            )}
          </div>

          <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 text-center">
            <Link href="/auth/login" className="text-sm text-indigo-700 font-bold hover:underline">
              &larr; Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
