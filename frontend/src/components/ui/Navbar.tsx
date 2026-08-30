'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cartCount, onCartChange } from '../../lib/cart';
import { personaForRole } from '../../lib/roleConfig';

// ─── Currency store (module-scoped, in-memory) ───────────────────────────────
export type Currency = 'GHS' | 'USD';
let globalCurrency: Currency = 'GHS';
const listeners: Set<(c: Currency) => void> = new Set();
export function getCurrency() { return globalCurrency; }
export function setCurrencyGlobal(c: Currency) {
  globalCurrency = c;
  if (typeof window !== 'undefined') localStorage.setItem('wtg_currency', c);
  listeners.forEach(fn => fn(c));
}
export function useCurrency() {
  const [currency, setCurrency] = useState<Currency>(globalCurrency);
  useEffect(() => {
    const saved = localStorage.getItem('wtg_currency') as Currency | null;
    if (saved && saved !== globalCurrency) setCurrencyGlobal(saved);
    listeners.add(setCurrency);
    return () => { listeners.delete(setCurrency); };
  }, []);
  return { currency, setCurrency: setCurrencyGlobal };
}

export const GHS_TO_USD = 0.068;
export function convertPrice(ghsPrice: number, currency: Currency): string {
  if (currency === 'GHS') return `₵${ghsPrice.toLocaleString()}`;
  return `$${(ghsPrice * GHS_TO_USD).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const SEARCH_SUGGESTIONS = [
  'Rice', 'Cement', 'Office chair', 'iPhone',
  'Paracetamol', 'Tomatoes', 'Tailoring service', 'Toyota Corolla',
];

function CartLink({ pathname }: { pathname: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => { setCount(cartCount()); return onCartChange(() => setCount(cartCount())); }, []);
  const active = pathname === '/cart';
  return (
    <Link href="/cart" className={`relative text-sm font-medium px-3 py-2 rounded-lg transition-colors ${active ? 'text-indigo-700 bg-indigo-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>
      🛒 Cart
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">{count}</span>
      )}
    </Link>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const { currency, setCurrency } = useCurrency();
  const pathname = usePathname();
  const router = useRouter();
  // Detect which marketplace this page belongs to.
  // The international section is everything under /international. All other
  // pages are the local Ghana market and must use GHS only.
  const isInternationalPage = pathname?.startsWith('/international') ?? false;

  // Lock currency: GHS in the local market, USD in the international market.
  useEffect(() => {
    if (!isInternationalPage && currency !== 'GHS') setCurrency('GHS');
    if (isInternationalPage && currency === 'GHS') setCurrency('USD');
  }, [isInternationalPage, currency, setCurrency]);
  const searchRef = useRef<HTMLInputElement>(null);
  const menusRef = useRef<HTMLDivElement>(null);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('Account');
  const [userRole, setUserRole] = useState<string>('');
  const [notifications, setNotifications] = useState<any[]>([]);

  // Roles that should see the "Sell" + dashboard seller bits
  const isSeller = ['seller', 'reseller', 'manufacturer'].includes(userRole);
  // Anyone in the administrative hierarchy (L1-L4) sees the Admin Console link.
  const ADMIN_ROLES = new Set([
    'admin', 'district_admin', 'region_admin',
    'ceo', 'coo', 'cto', 'cio', 'cfo', 'chro',
    'national_compliance_director', 'national_logistics_director', 'national_finance_director',
    'national_customer_relations_director', 'national_ai_intelligence_director',
    'national_sme_director', 'national_security_director', 'national_legal_director',
    'compliance_officer', 'logistics_officer', 'finance_officer',
    'customer_relations_officer', 'ai_monitoring_officer', 'data_analyst',
    'business_support_officer', 'security_operations_officer', 'legal_officer',
    'regional_operations_manager', 'regional_logistics_officer',
    'regional_compliance_officer', 'regional_finance_officer',
    'regional_customer_relations_officer',
    'district_commerce_officer', 'district_logistics_officer',
    'district_compliance_officer', 'district_customer_relations_officer',
    'district_sme_officer',
  ]);
  const isAdmin = ADMIN_ROLES.has(userRole);
  // Any officer/executive role gets a "My Office" entry, regardless of the exact
  // title — driven by the same persona logic the dashboard uses.
  const isOfficer = !!userRole && personaForRole(userRole) === 'officer';

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('wt_token') : null;
    if (!token) { setIsLoggedIn(false); setUserRole(''); return; }
    setIsLoggedIn(true);
    try {
      const u = JSON.parse(localStorage.getItem('wt_user') || '{}');
      if (u?.fullName) setUserName(u.fullName);
      if (u?.role) setUserRole(u.role);
    } catch {}
    import('../../lib/api').then(({ notificationsAPI }) => {
      notificationsAPI.list().then((r: any) => setNotifications(r.notifications || [])).catch(() => {});
    });
  }, [pathname]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleLogout = () => {
    try { localStorage.removeItem('wt_token'); localStorage.removeItem('wt_user'); } catch {}
    window.location.href = '/';
  };

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menusRef.current && !menusRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
        setNotifOpen(false);
        setCurrencyMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 100);
  }, [searchOpen]);

  const filteredSuggestions = SEARCH_SUGGESTIONS.filter(s =>
    s.toLowerCase().includes(searchQuery.toLowerCase()) && searchQuery.length > 0
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/catalog?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  return (
    <>
      <nav
        className={`sticky top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'bg-white/95 backdrop-blur-md shadow-md border-b border-slate-200' : 'bg-white border-b border-slate-100'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">

            {/* Logo */}
            <Link href="/" className="font-bold text-xl tracking-tight shrink-0 flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-500 flex items-center justify-center text-white font-bold text-sm">N</span>
              <span className="text-slate-900">NationMart</span>
            </Link>

            {/* Desktop search */}
            <div className="hidden md:flex flex-1 max-w-md relative">
              <form onSubmit={handleSearch} className="w-full">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    ref={searchRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchOpen(true)}
                    onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                    placeholder="Search products, stores, services..."
                    className="w-full bg-slate-50 text-slate-800 placeholder-slate-400 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                  />
                </div>
              </form>
              {searchOpen && filteredSuggestions.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
                  {filteredSuggestions.map(s => (
                    <button
                      key={s}
                      onMouseDown={() => { router.push(`/catalog?search=${encodeURIComponent(s)}`); setSearchQuery(''); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-800"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Desktop right */}
            <div className="hidden md:flex items-center gap-1" ref={menusRef}>
              {[
                { href: '/discover', label: 'Discover' },
                { href: '/stores',  label: 'Marketplace' },
                { href: '/catalog', label: 'Catalog' },
                ...(isSeller || isAdmin ? [{ href: '/sell', label: 'Sell' }] : []),
                ...(isLoggedIn ? [{ href: '/messages', label: 'Messages' }] : []),
              ].map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                    pathname === item.href || pathname.startsWith(item.href + '/')
                      ? 'text-indigo-700 bg-indigo-50'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </Link>
              ))}

              <CartLink pathname={pathname} />

              {/* Currency switcher — only visible in international market.
                  Local market is locked to GHS by the effect above. */}
              {isInternationalPage && (
                <div className="relative ml-1">
                <button
                  onClick={() => setCurrencyMenuOpen(!currencyMenuOpen)}
                  className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all"
                >
                  <span>{currency === 'GHS' ? 'GHS ₵' : 'USD $'}</span>
                  <svg className={`w-3 h-3 transition-transform ${currencyMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {currencyMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
                    <div className="px-3 py-2 text-xs text-slate-400 font-semibold uppercase tracking-wide border-b border-slate-100">Currency</div>
                    {([
                      { code: 'GHS', label: 'Ghana Cedi', symbol: '₵', desc: 'Local market' },
                      { code: 'USD', label: 'US Dollar',  symbol: '$', desc: 'International market' },
                    ] as const).map(c => (
                      <button
                        key={c.code}
                        onClick={() => { setCurrency(c.code); setCurrencyMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-indigo-50 transition-all ${currency === c.code ? 'bg-indigo-50 text-indigo-800' : 'text-slate-700'}`}
                      >
                        <span className="font-bold w-6 text-center">{c.symbol}</span>
                        <div className="text-left flex-1">
                          <div className="font-semibold">{c.label}</div>
                          <div className="text-xs text-slate-400">{c.desc}</div>
                        </div>
                        {currency === c.code && (
                          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                    <div className="px-3 py-2 border-t border-slate-100 text-xs text-slate-400 text-center">
                      Rate: 1 USD ≈ {(1 / GHS_TO_USD).toFixed(1)} GHS
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* Notifications */}
              {isLoggedIn && (
                <div className="relative">
                  <button onClick={() => setNotifOpen(!notifOpen)} className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{unreadCount}</span>
                    )}
                  </button>
                  {notifOpen && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
                      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <span className="font-bold text-slate-800">Notifications</span>
                        <span className="text-xs text-indigo-600 font-semibold">{unreadCount} unread</span>
                      </div>
                      {notifications.length === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-slate-400">No notifications yet</div>
                      ) : notifications.slice(0, 6).map((n: any) => (
                        <div key={n._id} className={`px-4 py-3 border-b border-slate-50 hover:bg-slate-50 cursor-pointer ${!n.read ? 'bg-indigo-50/50' : ''}`}>
                          <div className="flex items-start gap-3">
                            {!n.read && <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 shrink-0" />}
                            <div className={n.read ? 'ml-5' : ''}>
                              <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                              <p className="text-sm text-slate-600">{n.message}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{new Date(n.createdAt).toLocaleDateString()}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                      <Link href="/dashboard" className="block text-center py-2.5 text-sm text-indigo-700 font-semibold hover:bg-indigo-50">View all</Link>
                    </div>
                  )}
                </div>
              )}

              {/* Auth */}
              {isLoggedIn ? (
                <div className="relative ml-1">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg pl-1.5 pr-3 py-1 text-slate-700 text-sm font-semibold transition-all"
                  >
                    <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-600 to-blue-500 flex items-center justify-center text-xs font-bold text-white">
                      {userName[0]?.toUpperCase()}
                    </div>
                    <span className="max-w-[120px] truncate">{userName}</span>
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
                      <div className="px-4 py-3 border-b border-slate-100">
                        <p className="text-sm font-bold text-slate-800 truncate">{userName}</p>
                        <p className="text-xs text-slate-500 capitalize">{userRole.replace('_', ' ') || 'Account'}</p>
                      </div>
                      <Link href="/dashboard" className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">Dashboard</Link>
                      {isOfficer && <Link href="/office" className="block px-4 py-2.5 text-sm text-indigo-700 font-semibold hover:bg-indigo-50">🏛️ My Office</Link>}
                      {isSeller && <Link href="/stores/manage" className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">My Stores</Link>}
                      {isSeller && <Link href="/sell" className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">Add a Listing</Link>}
                      <Link href="/messages" className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">Messages</Link>
                      {isAdmin && (
                        <>
                          <div className="border-t border-slate-100" />
                          <Link href="/admin" className="block px-4 py-2.5 text-sm text-indigo-700 font-semibold hover:bg-indigo-50">Admin Console</Link>
                        </>
                      )}
                      <div className="border-t border-slate-100">
                        <button onClick={handleLogout} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50">Sign Out</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 ml-1">
                  <Link href="/auth/login" className="text-sm text-slate-700 font-semibold px-3 py-1.5 hover:text-slate-900 transition-colors">Log in</Link>
                  <Link href="/auth/register" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors shadow-sm">Sign Up</Link>
                </div>
              )}
            </div>

            {/* Mobile icons */}
            <div className="md:hidden flex items-center gap-2">
              {isInternationalPage && (
                <button onClick={() => setCurrency(currency === 'GHS' ? 'USD' : 'GHS')} className="text-xs font-bold text-slate-700 bg-slate-100 rounded px-2 py-1">
                  {currency === 'GHS' ? '₵' : '$'}
                </button>
              )}
              <button className="text-slate-700 p-1" onClick={() => setMobileOpen(!mobileOpen)}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileOpen
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  }
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 pb-4 pt-2 px-4 flex flex-col gap-1">
            <form onSubmit={handleSearch} className="mb-3">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search products, stores, services..."
                className="w-full bg-slate-50 text-slate-800 placeholder-slate-400 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-400"
              />
            </form>
            {[
              { href: '/discover', label: 'Discover' },
              { href: '/stores',  label: 'Marketplace' },
              { href: '/catalog', label: 'Catalog' },
              { href: '/cart', label: '🛒 Cart' },
              ...(isSeller || isAdmin ? [{ href: '/sell', label: 'Sell' }] : []),
              ...(isLoggedIn ? [{ href: '/dashboard', label: 'Dashboard' }] : []),
              ...(isLoggedIn ? [{ href: '/messages',  label: 'Messages' }] : []),
              ...(isAdmin ? [{ href: '/admin', label: 'Admin Console' }] : []),
              ...(isAdmin ? [{ href: '/admin/store-types', label: 'Store Types' }] : []),
            ].map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-slate-700 font-medium py-2.5 px-3 rounded-lg hover:bg-slate-50 transition-all ${pathname === item.href ? 'bg-indigo-50 text-indigo-700' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            {isInternationalPage && (
              <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100">
                <button onClick={() => setCurrency('GHS')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${currency === 'GHS' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>GHS ₵</button>
                <button onClick={() => setCurrency('USD')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${currency === 'USD' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>USD $</button>
              </div>
            )}
            {!isLoggedIn && (
              <div className="flex gap-2 mt-2">
                <Link href="/auth/login" className="flex-1 border border-slate-300 text-slate-700 font-semibold px-4 py-2.5 rounded-lg text-center" onClick={() => setMobileOpen(false)}>Log in</Link>
                <Link href="/auth/register" className="flex-1 bg-indigo-600 text-white font-semibold px-4 py-2.5 rounded-lg text-center" onClick={() => setMobileOpen(false)}>Sign Up</Link>
              </div>
            )}
            {isLoggedIn && (
              <button onClick={handleLogout} className="mt-2 text-red-600 font-semibold px-3 py-2.5 rounded-lg text-left hover:bg-red-50">Sign Out</button>
            )}
          </div>
        )}
      </nav>
    </>
  );
}
