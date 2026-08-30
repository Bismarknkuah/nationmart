'use client';
import { useState } from 'react';
import Link from 'next/link';
import { authAPI, setToken } from '../../../lib/api';

// Demo credentials — visible in this test build so reviewers can try every role.
// Grouped by tier so the dropdown stays readable as the list grows.
type DemoEntry = { label: string; email: string; password: string };
type DemoGroup = { groupLabel: string; entries: DemoEntry[] };

const DEMO_GROUPS: DemoGroup[] = [
  {
    groupLabel: 'Executive & Administration',
    entries: [
      { label: 'CEO',             email: 'ceo@nationmart.gh',        password: 'Officer@1234' },
      { label: 'Super Admin',     email: 'admin@nationmart.gh',      password: 'Admin@1234'   },
      { label: 'District Admin',  email: 'district@nationmart.gh',   password: 'District@1234'},
    ],
  },
  {
    groupLabel: 'Finance Office',
    entries: [
      { label: 'National Finance Director', email: 'finance@nationmart.gh', password: 'Officer@1234' },
    ],
  },
  {
    groupLabel: 'HR Office',
    entries: [
      { label: 'National HR Director', email: 'hr@nationmart.gh', password: 'Officer@1234' },
    ],
  },
  {
    groupLabel: 'Officers',
    entries: [
      { label: 'National Compliance Director',  email: 'compliance@nationmart.gh', password: 'Officer@1234' },
      { label: 'Regional Logistics Officer',    email: 'logistics@nationmart.gh',  password: 'Officer@1234' },
      { label: 'District Commerce Officer',     email: 'commerce@nationmart.gh',   password: 'Officer@1234' },
    ],
  },
  {
    groupLabel: 'Sellers',
    entries: [
      { label: 'Seller (Timber, on trial)',  email: 'kofi@ashantiforest.gh', password: 'Seller@1234' },
      { label: 'Seller (Boutique, active)',  email: 'ama@kumasaw.gh',        password: 'Seller@1234' },
      { label: 'Manufacturer (past due)',    email: 'yaw@accrabuild.gh',     password: 'Seller@1234' },
    ],
  },
  {
    groupLabel: 'Buyers',
    entries: [
      { label: 'Buyer (International, USA)', email: 'buyer@timberusa.com', password: 'Buyer@1234' },
      { label: 'Buyer (Local, Kumasi)',      email: 'efua@buyer.gh',       password: 'Buyer@1234' },
    ],
  },
  {
    groupLabel: 'Logistics partners',
    entries: [
      { label: 'District Logistics Officer', email: 'dlo@nationmart.gh',    password: 'Officer@1234' },
      { label: 'Rider (available)',           email: 'rider@nationmart.gh',  password: 'Rider@1234'   },
      { label: 'Driver (available)',          email: 'driver@nationmart.gh', password: 'Driver@1234'  },
    ],
  },
];

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Please enter your email, phone, or username, and your password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const id = form.email.trim();
      const data = await authAPI.login(id.includes('@') ? id.toLowerCase() : id, form.password);
      setToken(data.token);
      localStorage.setItem('wt_user', JSON.stringify(data.user));
      const redirectTo = new URLSearchParams(window.location.search).get('redirect') || '/dashboard';
      window.location.href = redirectTo;
    } catch (err: any) {
      setError(err.message || 'Login failed. Check your email and password and try again.');
    } finally {
      setLoading(false);
    }
  };

  const useDemo = async (d: DemoEntry) => {
    setForm({ email: d.email, password: d.password });
    setDemoOpen(false);
    setError('');
    setLoading(true);
    try {
      const data = await authAPI.login(d.email, d.password);
      setToken(data.token);
      localStorage.setItem('wt_user', JSON.stringify(data.user));
      const redirectTo = new URLSearchParams(window.location.search).get('redirect') || '/dashboard';
      window.location.href = redirectTo;
    } catch (err: any) {
      setError(err.message || 'Demo login failed. Make sure the backend is seeded.');
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 relative"
      style={{
        // Drop a photo at frontend/public/market.jpg (e.g. Adum/Makola market) and it
        // shows automatically; otherwise this warm market-stall gradient is the fallback.
        backgroundImage:
          "linear-gradient(rgba(18,14,7,0.66), rgba(18,14,7,0.78)), url('/market.jpg'), " +
          "radial-gradient(circle at 18% 28%, #c2410c 0, transparent 42%), " +
          "radial-gradient(circle at 82% 18%, #C8A24B 0, transparent 38%), " +
          "radial-gradient(circle at 65% 82%, #0f766e 0, transparent 44%), " +
          "linear-gradient(135deg, #1f2937, #3b2f1a)",
        backgroundSize: 'cover, cover, cover, cover, cover, cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* thin gold trim along the top */}
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(90deg,#9A7A2E,#E7CB77,#C8A24B)' }} />
      <div className="w-full max-w-md relative">

        {/* Brand */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 flex items-center justify-center text-white font-bold">N</span>
            <span className="text-2xl font-bold text-white drop-shadow">NationMart</span>
          </Link>
          <p className="text-xs text-amber-100/80 mt-2">Ghana&apos;s national marketplace</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="px-8 pt-8 pb-2">
            <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>Welcome back</h1>
            <p className="text-sm text-slate-500 mt-1">Sign in to access your dashboard.</p>
          </div>

          <div className="px-8 pt-6 pb-8 space-y-5">

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="text-sm font-medium text-slate-700 block mb-1.5">Email, phone, or username</label>
                <input
                  id="email"
                  type="text"
                  inputMode="email"
                  value={form.email}
                  autoComplete="username"
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com  or  024 000 0000"
                  className="input-field"
                />
                <p className="text-xs text-slate-400 mt-1">End users can sign in with their phone number, username, or email.</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
                  <Link href="/auth/forgot-password" className="text-xs text-indigo-700 font-semibold hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    autoComplete="current-password"
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Your password"
                    className="input-field pr-20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Signing in...
                  </>
                ) : 'Sign In'}
              </button>
            </form>

            {/* Demo accounts dropdown — for testing only */}
            <div className="border-t border-slate-100 pt-5">
              <button
                type="button"
                onClick={() => setDemoOpen(!demoOpen)}
                className="w-full flex items-center justify-between text-sm font-semibold text-slate-700 hover:text-indigo-700"
              >
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block px-2 py-0.5 text-[10px] uppercase tracking-wide rounded bg-amber-100 text-amber-800 font-bold">Demo</span>
                  Try a sample account
                </span>
                <svg className={`w-4 h-4 transition-transform ${demoOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {demoOpen && (
                <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                  {DEMO_GROUPS.map(group => (
                    <div key={group.groupLabel}>
                      <div className="bg-slate-50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                        {group.groupLabel}
                      </div>
                      {group.entries.map(d => (
                        <button
                          key={d.email}
                          type="button"
                          onClick={() => useDemo(d)}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 border-b border-slate-100 transition-colors"
                        >
                          <div className="font-semibold text-slate-800">{d.label}</div>
                          <div className="text-xs text-slate-500">{d.email}</div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
              <div className="relative flex justify-center text-xs text-slate-400"><span className="bg-white px-3">or</span></div>
            </div>

            {/* Guest link */}
            <Link
              href="/stores"
              className="w-full btn-secondary text-sm"
            >
              Continue as Guest
            </Link>
          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 text-center">
            <p className="text-slate-500 text-sm">
              Don&apos;t have an account?{' '}
              <Link href="/auth/register" className="text-indigo-700 font-bold hover:underline">
                Create an account
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-slate-400 text-xs mt-6">
          Protected by NationMart account security
        </p>
      </div>
    </div>
  );
}