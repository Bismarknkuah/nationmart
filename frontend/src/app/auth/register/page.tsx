'use client';
import { useState, Suspense, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { GHANA_REGIONS, getDistrictNames } from '../../../lib/ghanaRegions';
import { COUNTRIES } from '../../../lib/countries';
import { authAPI, setToken } from '../../../lib/api';

const ROLES = [
  { value: 'buyer',  label: 'Buyer',  desc: 'Buy products from verified Ghanaian sellers' },
  { value: 'seller', label: 'Seller', desc: 'Open a store and sell on NationMart' },
  { value: 'rider',  label: 'Rider',  desc: 'Deliver parcels by motorbike or bicycle' },
  { value: 'driver', label: 'Driver', desc: 'Deliver orders by car, van or truck' },
];

const inputClass = 'w-full border border-stone-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all bg-white';
const labelClass = 'text-sm font-medium text-stone-700 block mb-1.5';

const TERMS: { title: string; body: string }[] = [
  { title: 'Accurate identity & eligibility', body: 'I will provide accurate identity information — a valid Ghana Card (Ghana) or my country’s national ID/passport — and I am legally able to use this service.' },
  { title: 'Lawful use & fair dealing', body: 'I will use NationMart lawfully, list products honestly, fulfil orders in good faith, and not engage in fraud, counterfeiting or prohibited goods.' },
  { title: 'Payments, escrow & fees', body: 'I authorise payments via my chosen method (Mobile Money and/or card) through NationMart’s payment partners. Order funds may be held in escrow and released on delivery. Sellers and logistics partners agree to subscription fees after the free trial; buyers are not charged a subscription.' },
  { title: 'Card & financial data security', body: 'Card details are entered on the secure payment processor and are never stored by NationMart or shown to any officer. I will keep my own credentials confidential.' },
  { title: 'Data protection & privacy', body: 'My personal data is processed only to operate the platform, verify identity, and meet legal obligations, and is protected with appropriate safeguards.' },
  { title: 'Conduct, moderation & reporting', body: 'I accept NationMart’s moderation, fraud-prevention and reporting processes, and that accounts in breach may be suspended or removed.' },
  { title: 'Deliveries & logistics', body: 'I understand deliveries are handled by approved riders/drivers, that live tracking may be used, and delivery timelines are estimates.' },
  { title: 'Acceptance', body: 'I confirm I have read and agree to all of the above Terms & Conditions and the Privacy Policy of NationMart, designed by Desward Technology.' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

function RegisterContent() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [passportPreview, setPassportPreview] = useState<string | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [consents, setConsents] = useState<number[]>([]);
  const [countryQuery, setCountryQuery] = useState<string | null>(null);
  const [countryOpen, setCountryOpen] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const passportRef = useRef<HTMLInputElement>(null);

  const initialRole = ['buyer', 'seller', 'rider', 'driver'].includes(searchParams.get('role') || '')
    ? (searchParams.get('role') as string)
    : 'buyer';

  const [form, setForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    username: '',
    phone: '',
    password: '',
    confirmPassword: '',
    role: initialRole,
    company: '',
    region: '',
    district: '',
    address: '',
    businessRegNumber: '',
    vehicleLicense: '',
    taxIdNumber: '',
    ghanaCardNumber: '',
    idType: 'passport',
    idNumber: '',
    paymentMethods: [] as string[],
    momoNumber: '',
    momoNetwork: 'mtn',
    country: 'Ghana',
    passportPhoto: null as File | null,
  });

  const isGhana = form.country === 'Ghana';
  const togglePay = (m: string) => setForm(prev => ({
    ...prev,
    paymentMethods: prev.paymentMethods.includes(m) ? prev.paymentMethods.filter(x => x !== m) : [...prev.paymentMethods, m],
  }));

  const selectedRole = ROLES.find(r => r.value === form.role);
  const isSeller = form.role === 'seller';
  const isPartner = form.role === 'rider' || form.role === 'driver';
  // Roles NationMart pays out to. They need a payout destination (MoMo or bank),
  // not just a way to pay in. A card cannot receive earnings.
  const isEarner = ['seller', 'reseller', 'wholesaler', 'manufacturer', 'rider', 'driver'].includes(form.role);

  const update = (field: string, value: string) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'region') next.district = '';
      return next;
    });
  };

  const handlePassportUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Passport photo must be under 5MB'); return; }
    setForm(prev => ({ ...prev, passportPhoto: file }));
    const reader = new FileReader();
    reader.onload = () => setPassportPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const districts = getDistrictNames(form.region);

  const validateStep1 = () => {
    if (!form.firstName.trim()) return 'First name is required';
    if (!form.lastName.trim()) return 'Last name is required';
    if (!form.email.trim() || !form.email.includes('@')) return 'Valid email is required';
    if (!form.phone.trim()) return 'Phone number is required';
    if (form.password.length < 8) return 'Password must be at least 8 characters';
    if (form.password !== form.confirmPassword) return 'Passwords do not match';
    return '';
  };

  const validateStep2 = () => {
    if (isGhana && !form.region) return 'Please select your region';
    if (isGhana && districts.length > 0 && !form.district) return 'Please select your district';
    if (isSeller && !form.company.trim()) return 'Company name is required';
    if (isPartner && !form.vehicleLicense.trim()) return 'Your vehicle licence / plate number is required';
    if (!form.address.trim()) return 'Address is required';
    if (isGhana) {
      if (!/^GHA-\d{9}-\d$/.test(form.ghanaCardNumber.trim().toUpperCase()))
        return 'Enter a valid Ghana Card number (format GHA-XXXXXXXXX-X)';
    } else if (form.idNumber.trim().length < 4) {
      return 'Enter your national ID or passport number';
    }
    // Payment method: at least one. Non-Ghana = card only.
    const methods = isGhana ? form.paymentMethods : form.paymentMethods.filter(m => m === 'card');
    if (methods.length === 0) {
      return isGhana ? 'Choose at least one payment method (Mobile Money or Card)' : 'Choose Card payment to continue';
    }
    if (methods.includes('momo') && !form.momoNumber.trim()) return 'Enter your Mobile Money number';

    // The payout gate. An earning role must give us a way to PAY THEM, not just
    // a way to pay in. In Ghana that means Mobile Money at signup; elsewhere we
    // let them through and require a bank account before they can list (the
    // dashboard enforces that), because we don't collect bank details here.
    if (isEarner && isGhana) {
      if (!form.paymentMethods.includes('momo')) {
        return 'As a seller/partner you must add Mobile Money so we can pay your earnings. Card alone cannot receive payouts.';
      }
      if (!form.momoNumber.trim()) return 'Enter the Mobile Money number where you want to be paid.';
    }
    return '';
  };

  const handleNext = () => {
    const err = validateStep1();
    if (err) { setError(err); return; }
    setError('');
    setStep(2);
  };

  const handleSubmit = async () => {
    const err = validateStep2();
    if (err) { setError(err); return; }
    if (!acceptedTerms) { setError('Please read and accept the Terms & Conditions.'); return; }
    setLoading(true);
    setError('');
    try {
      const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' ');
      const data = await authAPI.register({
        fullName,
        email: form.email,
        username: form.username.trim() || undefined,
        phone: form.phone,
        password: form.password,
        role: form.role,
        company: form.company,
        country: form.country,
        region: isGhana ? form.region : '',
        district: isGhana ? form.district : '',
        address: form.address,
        businessRegNumber: form.businessRegNumber,
        vehicleLicense: form.vehicleLicense.trim(),
        taxIdNumber: form.taxIdNumber,
        ghanaCardNumber: isGhana ? form.ghanaCardNumber.trim().toUpperCase() : undefined,
        idType: isGhana ? 'ghana_card' : form.idType,
        idNumber: isGhana ? '' : form.idNumber.trim(),
        paymentMethods: isGhana ? form.paymentMethods : form.paymentMethods.filter(m => m === 'card'),
        momoNumber: form.paymentMethods.includes('momo') ? form.momoNumber : '',
        momoNetwork: form.momoNetwork,
        acceptedTerms: true,
        termsVersion: 'v2',
      } as any);
      if (data.token) setToken(data.token);
      setSuccess(true);
      // The backend tells us whether this account still needs a payout
      // destination (e.g. a non-Ghana seller who couldn't add MoMo here). If so,
      // land them in the payments office to add a bank account before anything
      // else — otherwise straight to the dashboard.
      const destination = (data as any).payoutMethodRequired
        ? '/dashboard?setup=payout'
        : '/dashboard';
      setTimeout(() => { window.location.href = destination; }, 2000);
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-100 via-amber-50 to-stone-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-xl border border-stone-200 p-10 text-center max-w-md w-full">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-stone-900 mb-3" style={{ fontFamily: 'Georgia, serif' }}>Account Created!</h2>
          <p className="text-stone-500 mb-2 text-sm">
            {form.role === 'buyer'
              ? 'Your buyer account is ready. Redirecting to dashboard...'
              : isPartner
                ? 'Your rider/driver application is submitted and awaiting approval by a logistics officer. You can sign in to check your status.'
                : 'Your seller account has been created! Upload your licenses in the dashboard for admin review.'}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-amber-600 text-sm font-medium">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Redirecting to dashboard...
          </div>
        </div>
      </div>
    );
  }

  const stepTitles = ['Personal Information', isPartner ? 'Location & ID' : 'Business & Location'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 via-amber-50 to-stone-100 flex items-center justify-center px-4 py-12">
      {showTerms && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowTerms(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-stone-900 mb-1">NationMart — Terms &amp; Conditions</h3>
            <p className="text-xs text-stone-400 mb-3">Please read and accept each item below before joining.</p>
            <div className="text-sm text-stone-600 space-y-3 max-h-[40vh] overflow-y-auto pr-1">
              {TERMS.map((t, i) => (
                <div key={i}>
                  <p className="font-semibold text-stone-800">{t.title}</p>
                  <p className="text-xs text-stone-600">{t.body}</p>
                </div>
              ))}
              <p className="text-xs text-stone-400 pt-1">Version v2 · NationMart, designed by Desward Technology.</p>
            </div>

            <label className="flex items-center gap-2 mt-4 pt-3 border-t border-stone-200 cursor-pointer">
              <input type="checkbox" checked={consents.length === TERMS.length}
                onChange={(e) => setConsents(e.target.checked ? TERMS.map((_, i) => i) : [])} className="w-4 h-4" />
              <span className="text-sm font-semibold text-stone-800">Mark all &amp; accept</span>
            </label>
            <div className="mt-2 space-y-1.5">
              {TERMS.map((t, i) => (
                <label key={i} className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={consents.includes(i)}
                    onChange={(e) => setConsents(prev => e.target.checked ? [...prev, i] : prev.filter(x => x !== i))} className="mt-0.5 w-4 h-4" />
                  <span className="text-xs text-stone-600">{t.title}</span>
                </label>
              ))}
            </div>

            <button disabled={consents.length < TERMS.length}
              onClick={() => { setAcceptedTerms(true); setShowTerms(false); }}
              className="mt-4 w-full bg-indigo-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm">
              {consents.length < TERMS.length ? `Accept all to continue (${consents.length}/${TERMS.length})` : 'I accept all the Terms & Conditions'}
            </button>
          </div>
        </div>
      )}
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 flex items-center justify-center text-white font-bold text-lg">N</span>
            <div className="text-left">
              <div className="text-2xl font-bold text-indigo-700" style={{ fontFamily: 'Georgia, serif' }}>NationMart</div>
              <div className="text-xs text-amber-700 font-semibold tracking-widest uppercase">Ghana</div>
            </div>
          </Link>
          <p className="text-stone-500 text-sm mt-2">Ghana&apos;s intelligent commerce platform</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-stone-200 overflow-hidden">

          {/* Card Header */}
          <div className="bg-indigo-600 px-8 py-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>Create Account</h1>
                <p className="text-amber-200 text-xs mt-0.5">Step {step} of 2 — {stepTitles[step - 1]}</p>
              </div>
              {/* Step indicators */}
              <div className="flex items-center gap-2">
                {[1, 2].map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      step > s ? 'bg-green-400 text-white' : step === s ? 'bg-amber-400 text-white' : 'bg-white/20 text-white/60'
                    }`}>
                      {step > s ? '✓' : s}
                    </div>
                    {s < 2 && <div className={`w-6 h-0.5 rounded ${step > s ? 'bg-green-400' : 'bg-white/20'}`} />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card Body */}
          <div className="px-8 py-6">

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-5 flex items-center gap-2">
                <span>⚠️</span> {error}
              </div>
            )}

            {/* STEP 1: Personal Info */}
            {step === 1 && (
              <div className="space-y-4">

                {/* Role Dropdown */}
                <div>
                  <label className={labelClass}>Registering as *</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setRoleOpen(!roleOpen)}
                      className="w-full border border-stone-300 rounded-xl px-4 py-3 text-sm text-left flex items-center justify-between bg-white hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all"
                    >
                      <span className={selectedRole ? 'text-stone-900 font-medium' : 'text-stone-400'}>
                        {selectedRole ? selectedRole.label : '— Select your role —'}
                      </span>
                      <span className={`text-stone-400 transition-transform duration-200 ${roleOpen ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    {roleOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-2xl shadow-xl z-50 overflow-hidden">
                        {ROLES.map((role) => (
                          <button
                            key={role.value}
                            type="button"
                            onClick={() => { update('role', role.value); setRoleOpen(false); }}
                            className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-amber-50 transition-all border-b border-stone-100 last:border-0 ${form.role === role.value ? 'bg-amber-50' : ''}`}
                          >
                            <div className="flex-1">
                              <p className="font-semibold text-stone-900 text-sm">{role.label}</p>
                              <p className="text-stone-400 text-xs">{role.desc}</p>
                            </div>
                            {form.role === role.value && <span className="text-amber-500 font-bold text-sm">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Passport Photo */}
                <div>
                  <label className={labelClass}>Passport Photo *</label>
                  <div
                    onClick={() => passportRef.current?.click()}
                    className="border-2 border-dashed border-stone-300 hover:border-amber-400 rounded-xl p-4 text-center cursor-pointer transition-all"
                  >
                    {passportPreview ? (
                      <div className="flex items-center gap-4">
                        <img src={passportPreview} alt="Passport" className="w-16 h-16 rounded-xl object-cover border-2 border-amber-300" />
                        <div className="text-left">
                          <p className="text-sm font-semibold text-green-600">✓ Photo uploaded</p>
                          <p className="text-xs text-stone-400">{form.passportPhoto?.name}</p>
                          <p className="text-xs text-amber-600 mt-1">Click to change</p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-3xl mb-1">📷</div>
                        <p className="text-sm font-medium text-stone-600">Click to upload passport photo</p>
                        <p className="text-xs text-stone-400 mt-0.5">JPG, PNG up to 5MB</p>
                      </div>
                    )}
                  </div>
                  <input ref={passportRef} type="file" accept="image/*" onChange={handlePassportUpload} className="hidden" />
                </div>

                {/* Name Fields */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First Name *">
                    <input type="text" value={form.firstName} onChange={e => update('firstName', e.target.value)}
                      placeholder="Kwame" className={inputClass} />
                  </Field>
                  <Field label="Last Name *">
                    <input type="text" value={form.lastName} onChange={e => update('lastName', e.target.value)}
                      placeholder="Asante" className={inputClass} />
                  </Field>
                </div>

                <Field label="Middle Name (Optional)">
                  <input type="text" value={form.middleName} onChange={e => update('middleName', e.target.value)}
                    placeholder="Kofi" className={inputClass} />
                </Field>

                <Field label="Email Address *">
                  <input type="email" value={form.email} onChange={e => update('email', e.target.value)}
                    placeholder="you@example.com" className={inputClass} />
                </Field>

                <Field label="Username (optional)">
                  <input type="text" value={form.username}
                    onChange={e => update('username', e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                    placeholder="e.g. kofi_accra" className={inputClass} />
                  <p className="text-xs text-stone-400 mt-1">Pick a username and you can log in with it instead of your email or phone.</p>
                </Field>

                <Field label="Phone Number *">
                  <div className="flex gap-2">
                    <div className="flex items-center border border-stone-300 rounded-xl px-3 bg-stone-50 text-sm text-stone-600 shrink-0 gap-1.5">
                      <span>🇬🇭</span> +233
                    </div>
                    <input type="tel" value={form.phone} onChange={e => update('phone', e.target.value)}
                      placeholder="24 000 0000" className={inputClass} />
                  </div>
                </Field>

                <Field label="Country *">
                  <div className="relative">
                    <input
                      type="text"
                      value={countryQuery !== null ? countryQuery : form.country}
                      onChange={e => { setCountryQuery(e.target.value); setCountryOpen(true); }}
                      onFocus={() => { setCountryQuery(''); setCountryOpen(true); }}
                      onBlur={() => setTimeout(() => { setCountryOpen(false); setCountryQuery(null); }, 150)}
                      placeholder="Type to search your country…"
                      className="w-full border border-stone-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all bg-white" />
                    {countryOpen && (
                      <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-stone-200 rounded-xl shadow-lg">
                        {COUNTRIES.filter(c => c.toLowerCase().includes((countryQuery || '').toLowerCase())).slice(0, 60).map(c => (
                          <button key={c} type="button"
                            onMouseDown={(e) => { e.preventDefault(); update('country', c); setCountryQuery(null); setCountryOpen(false); }}
                            className={`block w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 ${form.country === c ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-stone-700'}`}>
                            {c === 'Ghana' ? '🇬🇭 Ghana' : c}
                          </button>
                        ))}
                        {COUNTRIES.filter(c => c.toLowerCase().includes((countryQuery || '').toLowerCase())).length === 0 && (
                          <p className="px-4 py-2 text-sm text-stone-400">No match — pick “Other”.</p>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-stone-400 mt-1">Ghana uses the Ghana Card; other countries use their own ID/passport.</p>
                </Field>

                <Field label="Password *">
                  <input type="password" value={form.password} onChange={e => update('password', e.target.value)}
                    placeholder="Min 8 characters" className={inputClass} />
                  {form.password && (
                    <div className="mt-1.5 flex gap-1">
                      {['length', 'upper', 'number'].map((check, i) => {
                        const ok = check === 'length' ? form.password.length >= 8 : check === 'upper' ? /[A-Z]/.test(form.password) : /[0-9]/.test(form.password);
                        return <div key={i} className={`h-1 flex-1 rounded-full transition-all ${ok ? 'bg-green-400' : 'bg-stone-200'}`} />;
                      })}
                    </div>
                  )}
                </Field>

                <Field label="Confirm Password *">
                  <input type="password" value={form.confirmPassword} onChange={e => update('confirmPassword', e.target.value)}
                    placeholder="Repeat your password" className={inputClass} />
                  {form.confirmPassword && (
                    <p className={`text-xs mt-1 ${form.password === form.confirmPassword ? 'text-green-600' : 'text-red-500'}`}>
                      {form.password === form.confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                    </p>
                  )}
                </Field>

                <button onClick={handleNext}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md text-sm mt-2">
                  Continue →
                </button>
              </div>
            )}

            {/* STEP 2: Business & Location */}
            {step === 2 && (
              <div className="space-y-4">

                {isSeller && (
                  <>
                    <Field label="Company Name *">
                      <input type="text" value={form.company} onChange={e => update('company', e.target.value)}
                        placeholder="Asante Timber Co. Ltd." className={inputClass} />
                    </Field>
                    <Field label="Business Registration Number">
                      <input type="text" value={form.businessRegNumber} onChange={e => update('businessRegNumber', e.target.value)}
                        placeholder="BN-GH-XXXXXX" className={inputClass} />
                    </Field>
                    <Field label="Tax Identification Number (TIN)">
                      <input type="text" value={form.taxIdNumber} onChange={e => update('taxIdNumber', e.target.value)}
                        placeholder="GHA-XXXXXXXXX" className={inputClass} />
                    </Field>
                  </>
                )}

                {isGhana ? (
                  <>
                    <Field label="Region *">
                      <div className="relative">
                        <select value={form.region} onChange={e => update('region', e.target.value)}
                          className="w-full border border-stone-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all bg-white appearance-none">
                          <option value="">— Select Region —</option>
                          {GHANA_REGIONS.map(r => (
                            <option key={r.code} value={r.name}>{r.name} Region</option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">▾</div>
                      </div>
                    </Field>

                    {form.region && districts.length > 0 && (
                      <Field label={`District in ${form.region} *`}>
                        <div className="relative">
                          <select value={form.district} onChange={e => update('district', e.target.value)}
                            className="w-full border border-stone-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all bg-white appearance-none">
                            <option value="">— Select District ({districts.length} available) —</option>
                            {districts.map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">▾</div>
                        </div>
                      </Field>
                    )}
                  </>
                ) : (
                  <Field label="State / Province / City">
                    <input type="text" value={form.region} onChange={e => update('region', e.target.value)}
                      placeholder="e.g. California, Greater London, Lagos" className={inputClass} />
                  </Field>
                )}

                <Field label={isPartner ? 'Home Address' : 'Business / Home Address'}>
                  <textarea value={form.address} onChange={e => update('address', e.target.value)}
                    className="w-full border border-stone-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all resize-none"
                    rows={2} placeholder={isGhana ? 'Street, Town, Ghana' : 'Street, City, Country'} />
                </Field>

                {/* Identity — Ghana uses the Ghana Card; other countries use their own ID */}
                {isGhana ? (
                  <Field label="Ghana Card Number *">
                    <input type="text" value={form.ghanaCardNumber}
                      onChange={e => update('ghanaCardNumber', e.target.value.toUpperCase())}
                      placeholder="GHA-123456789-0" className={inputClass} />
                    <p className="text-xs text-stone-400 mt-1">🪪 Verified against the National Identification Authority (NIA). Format: GHA-XXXXXXXXX-X</p>
                  </Field>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="ID Type *">
                      <select value={form.idType} onChange={e => update('idType', e.target.value)}
                        className="w-full border border-stone-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                        <option value="passport">Passport</option>
                        <option value="national_id">National ID</option>
                        <option value="drivers_license">Driver’s Licence</option>
                        <option value="residence_permit">Residence Permit</option>
                      </select>
                    </Field>
                    <div className="col-span-2">
                      <Field label="ID / Passport Number *">
                        <input type="text" value={form.idNumber} onChange={e => update('idNumber', e.target.value)}
                          placeholder="Your national ID or passport number" className={inputClass} />
                        <p className="text-xs text-stone-400 mt-1">🪪 Used to verify your identity per your country’s standard.</p>
                      </Field>
                    </div>
                  </div>
                )}

                {/* Payment method — at least one required to complete registration */}
                <div className="border border-stone-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-stone-800 mb-1">Payment method <span className="text-red-500">*</span></p>
                  <p className="text-xs text-stone-500 mb-3">Choose how you’ll pay for transactions. {isGhana ? 'You can select Mobile Money, Card, or both — at least one is required.' : 'Card payment is required.'}</p>

                  {isEarner && (
                    <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
                      <p className="text-xs text-amber-800">
                        💰 <span className="font-semibold">You’ll be earning on NationMart</span>, so we need somewhere to
                        pay you. Add <span className="font-semibold">Mobile Money</span> now to get paid from your first
                        sale{isGhana ? '' : ' — or add a bank account from your dashboard'}. A card can pay <em>in</em>,
                        but earnings can only be sent to Mobile Money or a bank account.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 cursor-pointer transition-all ${form.paymentMethods.includes('card') ? 'border-indigo-400 bg-indigo-50' : 'border-stone-200 hover:border-stone-300'}`}>
                      <input type="checkbox" checked={form.paymentMethods.includes('card')} onChange={() => togglePay('card')} />
                      <span className="text-sm font-medium text-stone-700">💳 Visa / Mastercard / Credit card</span>
                      {isEarner && <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-stone-400">pay in only</span>}
                    </label>
                    {isGhana && (
                      <label className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 cursor-pointer transition-all ${form.paymentMethods.includes('momo') ? 'border-indigo-400 bg-indigo-50' : 'border-stone-200 hover:border-stone-300'}`}>
                        <input type="checkbox" checked={form.paymentMethods.includes('momo')} onChange={() => togglePay('momo')} />
                        <span className="text-sm font-medium text-stone-700">📱 Mobile Money (MTN / Telecel / AirtelTigo)</span>
                        {isEarner && <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-emerald-600">gets you paid</span>}
                      </label>
                    )}
                  </div>
                  {isGhana && form.paymentMethods.includes('momo') && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <Field label="Mobile Money Number">
                        <input type="tel" value={form.momoNumber} onChange={e => update('momoNumber', e.target.value)}
                          placeholder="0240000000" className={inputClass} />
                      </Field>
                      <Field label="MoMo Network">
                        <select value={form.momoNetwork} onChange={e => update('momoNetwork', e.target.value)}
                          className="w-full border border-stone-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all bg-white">
                          <option value="mtn">MTN MoMo</option>
                          <option value="telecel">Telecel Cash</option>
                          <option value="airteltigo">AirtelTigo Money</option>
                        </select>
                      </Field>
                    </div>
                  )}
                  {form.paymentMethods.includes('card') && (
                    <p className="text-xs text-stone-400 mt-2">🔒 You’ll enter card details securely at checkout — they are never stored by NationMart.</p>
                  )}
                </div>

                {form.region && (
                  <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs text-stone-600">
                    <div className="font-semibold text-stone-700 mb-1">📍 Location Summary</div>
                    <div>Region: <span className="font-semibold text-stone-900">{form.region}</span></div>
                    {form.district && <div>District: <span className="font-semibold text-stone-900">{form.district}</span></div>}
                  </div>
                )}

                {isSeller && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    <p className="font-semibold mb-1">📋 After registration</p>
                    <p className="text-xs">Upload your license and documents in the dashboard for review. You also get a <strong>4-month free trial</strong> — after that, GHS 50/month for one store or GHS 70/month for two, paid by Mobile Money to <strong>+233 24 071 5156</strong>.</p>
                  </div>
                )}

                {isPartner && (
                  <Field label={`${form.role === 'driver' ? 'Car' : 'Motorbike'} licence / plate number *`}>
                    <input type="text" value={form.vehicleLicense}
                      onChange={e => update('vehicleLicense', e.target.value.toUpperCase())}
                      placeholder="e.g. GR-4471-X" className={inputClass} />
                    <p className="text-xs text-stone-400 mt-1">Used to build your unique {form.role} code: Country-Region-District-Licence.</p>
                  </Field>
                )}

                {isPartner && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                    <p className="font-semibold mb-1">🛵 After registration</p>
                    <p className="text-xs">Your application is reviewed and approved by a logistics officer. Once approved you&apos;ll get a unique {form.role} code — then set yourself <strong>Available</strong> to start receiving delivery assignments from the AI dispatcher. Your first <strong>4 months are free</strong>, then GHS 30/month by Mobile Money to <strong>+233 24 071 5156</strong>.</p>
                  </div>
                )}

                <div className="pt-1">
                  <label className="flex items-start gap-2.5 text-sm text-stone-600">
                    <input type="checkbox" checked={acceptedTerms} readOnly
                      onClick={(e) => { e.preventDefault(); if (!acceptedTerms) setShowTerms(true); else setAcceptedTerms(false); }}
                      className="mt-0.5 w-4 h-4" />
                    <span>I have read and accept all the{' '}
                      <button type="button" onClick={() => setShowTerms(true)} className="text-indigo-600 font-semibold underline">Terms &amp; Conditions</button>.
                    </span>
                  </label>
                  {!acceptedTerms && (
                    <button type="button" onClick={() => setShowTerms(true)} className="text-xs text-indigo-600 font-semibold underline mt-1 ml-6">Open and accept all to continue →</button>
                  )}
                </div>

                <div className="flex gap-3 pt-1">
                  <button onClick={() => { setStep(1); setError(''); }}
                    className="flex-1 border border-stone-300 text-stone-700 font-semibold py-3 rounded-xl text-sm hover:bg-stone-50 transition-all">
                    ← Back
                  </button>
                  <button onClick={handleSubmit} disabled={loading || !acceptedTerms}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-md">
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Creating...
                      </span>
                    ) : '🎉 Create Account'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Card Footer */}
          <div className="px-8 py-4 bg-stone-50 border-t border-stone-100 text-center">
            <p className="text-stone-500 text-sm">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-amber-700 font-bold hover:underline">
                Sign In
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-stone-400 text-xs mt-6">
          🔒 Secured by NationMart Compliance Engine
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="pt-20 text-center text-stone-500">Loading...</div>}>
      <RegisterContent />
    </Suspense>
  );
}
