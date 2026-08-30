// frontend/src/lib/api.ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// ─── Token helpers ────────────────────────────────────────────────────────────
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('wt_token');
}

export function setToken(token: string): void {
  localStorage.setItem('wt_token', token);
}

export function removeToken(): void {
  localStorage.removeItem('wt_token');
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// ─── Core request ─────────────────────────────────────────────────────────────
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

  // Handle 401 – token expired or invalid. We clear the token but DO NOT
  // redirect here. The page that triggered the request is responsible for
  // navigating away (so we can show error states and avoid redirect loops).
  if (res.status === 401) {
    removeToken();
    let msg = 'Session expired. Please log in again.';
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {}
    throw new Error(msg);
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error('Invalid server response');
  }

  if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}

// ─── File upload (multipart) ──────────────────────────────────────────────────
async function uploadFile<T>(endpoint: string, formData: FormData): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || 'Upload failed');
  return data;
}

// ─── Query string builder ─────────────────────────────────────────────────────
function qs(params: Record<string, any> = {}): string {
  const clean = Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)])
  );
  const str = new URLSearchParams(clean).toString();
  return str ? `?${str}` : '';
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTH
// ═════════════════════════════════════════════════════════════════════════════
export const authAPI = {
  login: (email: string, password: string) =>
    request<{ token: string; user: any }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (data: Record<string, any>) =>
    request<{ token: string; user: any }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  me: () => request<any>('/api/auth/me'),

  updateProfile: (data: Record<string, any>) =>
    request<any>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<any>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // Public profile (rating/score visible before doing business)
  publicProfile: (userId: string) => request<any>(`/api/users/${userId}`),

  logout: () => {
    removeToken();
    window.location.href = '/';
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ═════════════════════════════════════════════════════════════════════════════
export const productsAPI = {
  bulk: (products: any[]) =>
    request<{ createdCount: number; errorCount: number; errors: any[] }>('/api/products/bulk', { method: 'POST', body: JSON.stringify({ products }) }),
  // Browse catalog with filters
  list: (params: {
    category?: string;
    region?: string;
    district?: string;
    species?: string;
    minPrice?: number;
    maxPrice?: number;
    flegtVerified?: boolean;
    fscCertified?: boolean;
    laceyActCompliant?: boolean;
    eudrCompliant?: boolean;
    exportMarket?: string;
    market?: 'local' | 'international' | 'all';
    search?: string;
    town?: string;
    country?: string;
    currency?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
    sort?: string;
  } = {}) => {
    // The backend's product listing runs through the typo-tolerant search, which
    // reads `q`. Older callers pass `search` — map it so both work.
    const { search, ...rest } = params as any;
    return request<any>(`/api/products${qs({ ...rest, q: search ?? (rest as any).q })}`);
  },

  getById: (id: string) => request<any>(`/api/products/${id}`),

  getByPassport: (passportId: string) =>
    request<any>(`/api/products/passport/${passportId}`),

  create: (data: Record<string, any>) =>
    request<any>('/api/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Record<string, any>) =>
    request<any>(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<any>(`/api/products/${id}`, { method: 'DELETE' }),

  // Seller's own listings
  mine: (params: { page?: number; limit?: number; status?: string } = {}) =>
    request<any>(`/api/products/seller/mine${qs(params)}`),

  // Add a traceability event
  addTraceEvent: (id: string, event: {
    event: string;
    location: string;
    notes?: string;
  }) =>
    request<any>(`/api/products/${id}/trace`, {
      method: 'POST',
      body: JSON.stringify(event),
    }),

  // Upload product images
  uploadImages: (id: string, formData: FormData) =>
    uploadFile<any>(`/api/products/${id}/images`, formData),
};

// ═════════════════════════════════════════════════════════════════════════════
// ORDERS
// ═════════════════════════════════════════════════════════════════════════════
export const ordersAPI = {
  create: (data: {
    items: Array<{ product: string; quantity: number }>;
    shippingAddress: {
      street: string;
      city: string;
      country: string;
      state?: string;
      postalCode?: string;
    };
    currency?: 'GHS' | 'USD';
    notes?: string;
  }) =>
    request<any>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Buyer's orders
  myOrders: (params: { page?: number; limit?: number; status?: string } = {}) =>
    request<any>(`/api/orders/my${qs(params)}`),

  // Seller's incoming orders
  sellerOrders: (params: { page?: number; limit?: number; status?: string } = {}) =>
    request<any>(`/api/orders/seller${qs(params)}`),

  getById: (id: string) => request<any>(`/api/orders/${id}`),

  // Seller confirms they received payment for an order
  confirmPayment: (id: string) =>
    request<any>(`/api/orders/${id}/confirm-payment`, { method: 'POST' }),

  updateStatus: (id: string, data: {
    status: string;
    note?: string;
    trackingNumber?: string;
    carrier?: string;
  }) =>
    request<any>(`/api/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  cancel: (id: string, reason: string) =>
    request<any>(`/api/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled', note: reason }),
    }),
};

// ═════════════════════════════════════════════════════════════════════════════
// EXPORT COMPLIANCE
// ═════════════════════════════════════════════════════════════════════════════
export const exportAPI = {
  // PDF download URLs (open directly in browser or use as anchor href)
  laceyActUrl: (orderId: string) =>
    `${BASE_URL}/api/export/lacey-act/${orderId}?token=${getToken()}`,

  commercialInvoiceUrl: (orderId: string) =>
    `${BASE_URL}/api/export/commercial-invoice/${orderId}?token=${getToken()}`,

  eudrStatementUrl: (orderId: string) =>
    `${BASE_URL}/api/export/eudr-statement/${orderId}?token=${getToken()}`,

  flegtCertificateUrl: (orderId: string) =>
    `${BASE_URL}/api/export/flegt-certificate/${orderId}?token=${getToken()}`,

  getComplianceStatus: (orderId: string) =>
    request<any>(`/api/export/compliance-status/${orderId}`),

  updateComplianceItem: (orderId: string, data: {
    item: string;
    completed: boolean;
    notes?: string;
  }) =>
    request<any>(`/api/export/compliance/${orderId}/checklist`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

// ═════════════════════════════════════════════════════════════════════════════
// LICENSES
// ═════════════════════════════════════════════════════════════════════════════
export const licensesAPI = {
  // Upload license metadata (document URL from Cloudinary)
  upload: (data: {
    type: string;
    licenseNumber: string;
    issuedBy: string;
    issuedDate: string;
    expiryDate: string;
    documentUrl?: string;
  }) =>
    request<any>('/api/licenses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Upload license document file
  uploadDocument: (formData: FormData) =>
    uploadFile<{ url: string; publicId: string }>('/api/licenses/upload', formData),

  mine: () => request<any>('/api/licenses/mine'),

  delete: (licenseId: string) =>
    request<any>(`/api/licenses/${licenseId}`, { method: 'DELETE' }),
};

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN
// ═════════════════════════════════════════════════════════════════════════════
export const adsAPI = {
  mine: () => request<{ ads: any[] }>('/api/ads/mine'),
  create: (body: { title: string; budget: number; billKind?: 'per_impression' | 'per_click'; placement?: string; productId?: string; storeId?: string; targetCategory?: string; targetRegion?: string; keywords?: string; unitCost?: number }) =>
    request<{ ad: any; message: string }>('/api/ads', { method: 'POST', body: JSON.stringify(body) }),
  pause: (id: string) => request<{ message: string }>(`/api/ads/${id}/pause`, { method: 'POST' }),
  resume: (id: string) => request<{ ad: any; message: string }>(`/api/ads/${id}/resume`, { method: 'POST' }),
  cancel: (id: string) => request<{ refunded: number; message: string }>(`/api/ads/${id}/cancel`, { method: 'POST' }),
  serve: (placement: string, category?: string) => request<{ ads: any[] }>(`/api/ads/serve${qs({ placement, category })}`),
  adminOverview: () => request<{ summary: any; campaigns: any[] }>('/api/ads/admin/overview'),
};

export const paymentMgmtAPI = {
  overview: () =>
    request<{
      gmv: number; totalIn: number; commissionEarned: number; refunded: number; escrowHeld: number;
      payouts: { inFlightValue: number; inFlightCount: number; paidOut: number; failed: number };
      counts: { paid: number; pending: number; failed: number; refunded: number };
      channels: { channel: string; count: number; value: number }[];
      inFlight: any[];
    }>('/api/office/finance/payments/overview'),

  transactions: (status?: string, limit = 30) =>
    request<{ transactions: any[] }>(`/api/office/finance/payments/transactions${qs({ status, limit })}`),

  integrity: () =>
    request<{ ok: boolean; driftCount: number; drift: any[] }>('/api/office/finance/integrity'),
};

export const promosAdminAPI = {
  overview: (scope: 'platform' | 'all' = 'platform') =>
    request<{ promos: any[]; summary: { total: number; live: number; redemptions: number } }>(
      `/api/promos/overview${qs({ scope })}`),

  createCampaign: (body: { code: string; discountPercent?: number; discountAmount?: number; minOrder?: number; maxUses?: number; expiresAt?: string }) =>
    request<{ promo: any; message: string }>('/api/promos/campaign', { method: 'POST', body: JSON.stringify(body) }),

  setActive: (code: string, active: boolean) =>
    request<{ promo: any; message: string }>(`/api/promos/${code}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
};

export const userMgmtAPI = {
  list: (params: { role?: string; status?: string; region?: string; district?: string; search?: string; page?: number; limit?: number } = {}) =>
    request<{ users: any[]; total: number; page: number; limit: number; assignableRoles: string[] }>(
      `/api/user-management${qs(params)}`),

  create: (body: { fullName: string; email: string; phone: string; password: string; role: string; region?: string; district?: string; address?: string; ghanaCardNumber?: string }) =>
    request<{ user: any; message: string }>('/api/user-management', { method: 'POST', body: JSON.stringify(body) }),

  update: (id: string, body: { fullName?: string; phone?: string; region?: string; district?: string; address?: string }) =>
    request<{ user: any }>(`/api/user-management/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  changeRole: (id: string, role: string) =>
    request<{ user: any; message: string }>(`/api/user-management/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),

  setStatus: (id: string, status: 'active' | 'suspended' | 'flagged') =>
    request<{ user: any; message: string }>(`/api/user-management/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  resetPassword: (id: string, password: string) =>
    request<{ message: string }>(`/api/user-management/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }),
};

export const adminAPI = {
  stats: () => request<any>('/api/admin/stats'),

  // Administrative hierarchy (Command Center)
  officers: (params: { level?: number; region?: string; district?: string; search?: string } = {}) =>
    request<{ officers: any[]; totalRoles: number }>(`/api/admin/officers${qs(params)}`),

  auditLog: (params: { actor?: string; action?: string; entityType?: string; page?: number; limit?: number } = {}) =>
    request<{ entries: any[]; total: number; page: number; limit: number }>(`/api/admin/audit-log${qs(params)}`),

  // License management
  pendingLicenses: () => request<any>('/api/admin/pending-licenses'),

  reviewLicense: (userId: string, licenseId: string, data: {
    action: 'approve' | 'reject';
    rejectionReason?: string;
  }) =>
    request<any>(`/api/admin/users/${userId}/licenses/${licenseId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Product management
  approveProduct: (productId: string) =>
    request<any>(`/api/admin/products/${productId}/approve`, {
      method: 'PATCH',
    }),

  pendingProducts: () => request<any>('/api/admin/pending-products'),

  rejectProduct: (productId: string, reason: string) =>
    request<any>(`/api/admin/products/${productId}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }),

  // User management
  getUsers: (params: { role?: string; status?: string; page?: number } = {}) =>
    request<any>(`/api/admin/users${qs(params)}`),

  suspendUser: (userId: string, reason: string) =>
    request<any>(`/api/admin/users/${userId}/suspend`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }),

  reactivateUser: (userId: string) =>
    request<any>(`/api/admin/users/${userId}/reactivate`, {
      method: 'PATCH',
    }),

  // Orders overview
  allOrders: (params: { page?: number; status?: string; destination?: string } = {}) =>
    request<any>(`/api/admin/orders${qs(params)}`),

  // Platform compliance report
  complianceReport: () => request<any>('/api/admin/compliance-report'),
};

// ═════════════════════════════════════════════════════════════════════════════
// SEARCH
// ═════════════════════════════════════════════════════════════════════════════
export const searchAPI = {
  // Typo-tolerant, local-name aware, distance-ranked. Pass lat/lng and nearby
  // sellers rank first.
  products: (query: string, filters: Record<string, any> = {}) =>
    request<{ products: any[]; total: number; didYouMean: string | null; corrected: boolean }>(
      `/api/search${qs({ q: query, ...filters })}`),

  suggestions: (query: string) =>
    request<{ suggestions: { suggestion: string; kind: string; hits: number }[] }>(
      `/api/search/suggest${qs({ q: query })}`),

  storesNear: (lat: number, lng: number, radiusKm = 25) =>
    request<{ stores: any[] }>(`/api/search/stores-near${qs({ lat, lng, radiusKm })}`),

  trending: () => request<{ trending: { query: string; searches: number }[] }>('/api/search/trending'),

  // Officer only — the searches that found nothing. Every row is a supply gap.
  unmetDemand: (days = 30) =>
    request<{ unmetDemand: any[]; note: string }>(`/api/search/unmet-demand${qs({ days })}`),

  addAlias: (alias: string, canonical: string) =>
    request<any>('/api/search/aliases', { method: 'POST', body: JSON.stringify({ alias, canonical }) }),
};

// ═════════════════════════════════════════════════════════════════════════════
// CURRENCY (client-side helper using live rate or fallback)
// ═════════════════════════════════════════════════════════════════════════════
export const currencyAPI = {
  // Fallback rate — replace with live API if needed
  GHS_TO_USD: 0.068,
  USD_TO_GHS: 14.7,

  convert: (amount: number, from: 'GHS' | 'USD', to: 'GHS' | 'USD'): number => {
    if (from === to) return amount;
    return from === 'GHS'
      ? parseFloat((amount * 0.068).toFixed(2))
      : parseFloat((amount * 14.7).toFixed(2));
  },

  format: (amount: number, currency: 'GHS' | 'USD'): string => {
    if (currency === 'GHS')
      return `₵${amount.toLocaleString('en-GH', { maximumFractionDigits: 0 })}`;
    return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  },

  formatBoth: (ghsAmount: number): string => {
    const usd = parseFloat((ghsAmount * 0.068).toFixed(0));
    return `₵${ghsAmount.toLocaleString()} / $${usd.toLocaleString()}`;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// MOBILE MONEY PAYMENTS (MoMo via Paystack — order & subscription)
// ═════════════════════════════════════════════════════════════════════════════
export const paymentsAPI = {
  setupPayout: (body: { storeId: string; businessName?: string; settlementBank: string; accountNumber: string }) =>
    request<{ ok: boolean; subaccountCode: string; sellerShare: number; platformPercent: number; simulated: boolean }>('/api/payments/payout-setup', { method: 'POST', body: JSON.stringify(body) }),

  /**
   * Start a payment. `channel` decides how:
   *   'card'          — Visa / Mastercard (hosted page, returns authorizationUrl)
   *   'mobile_money'  — direct on-phone prompt (returns status; may need OTP)
   *   'bank_transfer' — bank transfer
   *   (omitted)       — let them choose on the Paystack page
   * Pass `methodId` to charge a SAVED card in one tap — no redirect.
   */
  initiate: (body: {
    purpose: 'order' | 'subscription' | 'wallet_topup';
    orderId?: string;
    amount?: number;
    channel?: 'card' | 'mobile_money' | 'bank_transfer';
    methodId?: string;
    momoPhone?: string;
    momoNetwork?: 'mtn' | 'telecel' | 'airteltigo';
  }) =>
    request<{
      reference: string; amount: number; status?: string;
      authorizationUrl?: string | null; channel?: string;
      needsOtp?: boolean; message?: string;
    }>('/api/payments/initiate', { method: 'POST', body: JSON.stringify(body) }),

  card: (purpose: 'order' | 'subscription' | 'wallet_topup', orderId?: string) =>
    request<{ mode: string; authorizationUrl?: string; reference: string; amount: number; simulated?: boolean; message?: string }>('/api/payments/card', { method: 'POST', body: JSON.stringify({ purpose, orderId }) }),

  // Direct MoMo prompt — the phone buzzes, no redirect.
  initiateMomo: (data: {
    purpose: 'order' | 'subscription' | 'wallet_topup';
    orderId?: string;
    amount?: number;
    network: 'mtn' | 'telecel' | 'airteltigo';
    phone: string;
  }) =>
    request<{
      reference: string; amount: number; status: string;
      displayText?: string; message?: string; needsOtp?: boolean; simulated?: boolean;
    }>('/api/payments/initiate', {
      method: 'POST',
      body: JSON.stringify({
        purpose: data.purpose, orderId: data.orderId, amount: data.amount,
        channel: 'mobile_money', momoPhone: data.phone, momoNetwork: data.network,
      }),
    }),

  submitOtp: (reference: string, otp: string) =>
    request<{ status: string; message: string }>('/api/payments/momo/otp', {
      method: 'POST',
      body: JSON.stringify({ reference, otp }),
    }),

  verify: (reference: string) =>
    request<{ status?: string; state?: 'success' | 'pending' | 'failed'; amount?: number; message?: string; payment?: any }>(
      `/api/payments/${reference}/verify`
    ),

  mine: () => request<any>('/api/payments/mine'),
};

// ═════════════════════════════════════════════════════════════════════════════
// PAYMENT METHODS & PAYOUTS  (the seller/rider "payments office")
// Cards & MoMo pay IN; MoMo & bank accounts pay OUT.
// ═════════════════════════════════════════════════════════════════════════════
export const payoutsAPI = {
  methods: () => request<{ methods: any[] }>('/api/payouts/methods'),

  addMomo: (phone: string, network: 'mtn' | 'telecel' | 'airteltigo') =>
    request<{ method: any }>('/api/payouts/methods/momo', {
      method: 'POST', body: JSON.stringify({ phone, network }),
    }),

  banks: () => request<{ banks: { name: string; code: string; type: string }[] }>('/api/payouts/banks'),

  // Ask the bank whose account this is BEFORE saving/paying. Returns the name to confirm.
  resolveBank: (accountNumber: string, bankCode: string) =>
    request<{ accountName: string; confirm: string }>('/api/payouts/banks/resolve', {
      method: 'POST', body: JSON.stringify({ accountNumber, bankCode }),
    }),

  addBank: (accountNumber: string, bankCode: string, bankName: string) =>
    request<{ method: any }>('/api/payouts/methods/bank', {
      method: 'POST', body: JSON.stringify({ accountNumber, bankCode, bankName }),
    }),

  setDefault: (id: string) =>
    request<{ method: any }>(`/api/payouts/methods/${id}/default`, { method: 'POST' }),

  remove: (id: string) =>
    request<{ message: string }>(`/api/payouts/methods/${id}`, { method: 'DELETE' }),

  // Withdrawals
  mine: () => request<{ payouts: any[]; available: number; minimum: number }>('/api/payouts'),

  request: (methodId: string, amount: number) =>
    request<{ payout: any; message: string }>('/api/payouts', {
      method: 'POST', body: JSON.stringify({ methodId, amount }),
    }),

  inFlight: () => request<{ inFlight: any[] }>('/api/payouts/in-flight'),
};

// ═════════════════════════════════════════════════════════════════════════════
// DISPUTES & REFUNDS
// ═════════════════════════════════════════════════════════════════════════════
export const disputesAPI = {
  raise: (body: { orderId: string; reason?: string; details?: string; claimAmount?: number }) =>
    request<{ dispute: any; message: string }>('/api/disputes', {
      method: 'POST', body: JSON.stringify(body),
    }),

  mine: () => request<{ disputes: any[] }>('/api/disputes/mine'),

  get: (id: string) => request<{ dispute: any; evidence: any[] }>(`/api/disputes/${id}`),

  addEvidence: (id: string, body: string, attachmentUrl?: string) =>
    request<{ evidence: any }>(`/api/disputes/${id}/evidence`, {
      method: 'POST', body: JSON.stringify({ body, attachmentUrl }),
    }),

  withdraw: (id: string) =>
    request<{ dispute: any }>(`/api/disputes/${id}/withdraw`, { method: 'POST' }),

  // Officer desk
  queue: (status?: string) => request<{ disputes: any[] }>(`/api/disputes/queue${qs({ status })}`),
  claim: (id: string) => request<{ dispute: any }>(`/api/disputes/${id}/claim`, { method: 'POST' }),
  resolve: (id: string, body: { outcome: 'refund_buyer' | 'favour_seller'; refundAmount?: number; resolution: string }) =>
    request<{ dispute: any; message: string }>(`/api/disputes/${id}/resolve`, {
      method: 'POST', body: JSON.stringify(body),
    }),
  overdue: () => request<{ overdue: any[] }>('/api/disputes/overdue'),

  // A shop's public dispute record — buyers can see it before they buy.
  record: (sellerId: string) => request<{ record: any }>(`/api/disputes/record/${sellerId}`),
};

// ═════════════════════════════════════════════════════════════════════════════
// REPORTS (buyers & sellers report each other)
// ═════════════════════════════════════════════════════════════════════════════
export const reportsAPI = {
  create: (data: {
    reportedUserId: string;
    orderId?: string;
    category: string;
    reason: string;
    description: string;
    evidenceUrls?: string[];
  }) =>
    request<any>('/api/reports', { method: 'POST', body: JSON.stringify(data) }),

  mine: () => request<any>('/api/reports/mine'),
  againstMe: () => request<any>('/api/reports/against-me'),

  // Admin / district admin
  list: (params: { status?: string; district?: string } = {}) =>
    request<any>(`/api/reports${qs(params)}`),

  review: (id: string, data: { status: string; action?: string; reviewNote?: string }) =>
    request<any>(`/api/reports/${id}/review`, { method: 'PATCH', body: JSON.stringify(data) }),
};

// ═════════════════════════════════════════════════════════════════════════════
// RATINGS (1-5 score, publicly visible)
// ═════════════════════════════════════════════════════════════════════════════
export const ratingsAPI = {
  // Public: view a user's score + reviews
  forUser: (userId: string, params: { page?: number; limit?: number } = {}) =>
    request<{ ratings: any[]; total: number; distribution: Record<string, number> }>(
      `/api/ratings/user/${userId}${qs(params)}`
    ),

  // Rate the other party after a delivered order
  create: (data: { orderId: string; score: number; comment?: string }) =>
    request<any>('/api/ratings', { method: 'POST', body: JSON.stringify(data) }),
};

// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═════════════════════════════════════════════════════════════════════════════
export const notificationsAPI = {
  list: () => request<{ notifications: any[]; unread: number }>('/api/notifications'),
  unreadCount: () => request<{ unread: number }>('/api/notifications/unread-count'),
  markRead: (id: string) =>
    request<any>(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request<any>('/api/notifications/read-all', { method: 'PATCH' }),
};

// ═════════════════════════════════════════════════════════════════════════════
// ORDER TRACKING
// ═════════════════════════════════════════════════════════════════════════════
export const trackingAPI = {
  track: (orderNumber: string) => request<any>(`/api/orders/track/${orderNumber}`),
};

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN — district pending-review queue
// ═════════════════════════════════════════════════════════════════════════════
export const districtAdminAPI = {
  pendingUsers: () => request<{ pending: Array<{ user: any; reports: any[] }> }>('/api/admin/pending-users'),
  setRole: (userId: string, role: string, district?: string) =>
    request<any>(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role, district }),
    }),
};

// ═════════════════════════════════════════════════════════════════════════════
// STORES (customizable multi-store storefronts)
// ═════════════════════════════════════════════════════════════════════════════
export const storesAPI = {
  browse: (params: { type?: string; international?: boolean; market?: 'local' | 'international'; region?: string; district?: string; search?: string } = {}) =>
    request<{ stores: any[] }>(`/api/stores${qs(params)}`),
  mine: () => request<{ stores: any[]; max: number }>('/api/stores/mine'),
  storefront: (slug: string) => request<{ store: any; products: any[] }>(`/api/stores/${slug}`),
  permissions: () => request<{ permissions: string[] }>('/api/stores/permissions'),
  create: (data: Record<string, any>) =>
    request<any>('/api/stores', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, any>) =>
    request<any>(`/api/stores/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  analytics: (id: string) => request<any>(`/api/stores/${id}/analytics`),
  addStaff: (id: string, data: { email: string; roleLabel: string; permissions: string[] }) =>
    request<any>(`/api/stores/${id}/staff`, { method: 'POST', body: JSON.stringify(data) }),
  updateStaff: (id: string, userId: string, data: { roleLabel?: string; permissions?: string[] }) =>
    request<any>(`/api/stores/${id}/staff/${userId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removeStaff: (id: string, userId: string) =>
    request<any>(`/api/stores/${id}/staff/${userId}`, { method: 'DELETE' }),
  bulkUpload: (id: string, formData: FormData) =>
    uploadFile<any>(`/api/stores/${id}/products/bulk`, formData),
};

// ═════════════════════════════════════════════════════════════════════════════
// MESSAGING (buyer <-> seller chat)
// ═════════════════════════════════════════════════════════════════════════════
export const storeCategoriesAPI = {
  list: (all = false) =>
    request<{ categories: any[] }>(`/api/store-categories${all ? '?all=true' : ''}`),
  upsert: (body: { value: string; label: string; tagline?: string; imageUrl?: string; iconPath?: string; order?: number; active?: boolean }) =>
    request<{ category: any }>('/api/store-categories', { method: 'POST', body: JSON.stringify(body) }),
  remove: (value: string) =>
    request<{ ok: boolean }>(`/api/store-categories/${value}`, { method: 'DELETE' }),
};

export const discoverAPI = {
  visual: (image: string) =>
    request<{ keywords: string[]; query?: string; note?: string }>('/api/discover/visual', { method: 'POST', body: JSON.stringify({ image }) }),
};

export const walletAPI = {
  mine: () => request<{ wallet: any; transactions: any[] }>('/api/wallet/mine'),
  settle: (body: { amount: number; userId?: string; note?: string }) =>
    request<{ wallet: any }>('/api/wallet/settle', { method: 'POST', body: JSON.stringify(body) }),
  overview: () => request<{ owing: any[]; owed: any[] }>('/api/wallet/overview'),
};

export const hrAPI = {
  submitLeave: (body: { type: string; startDate: string; endDate: string; reason?: string }) =>
    request<{ leave: any }>('/api/hr/leave', { method: 'POST', body: JSON.stringify(body) }),
  myLeave: () => request<{ leaves: any[] }>('/api/hr/leave/mine'),
  cancelLeave: (id: string) => request<{ leave: any }>(`/api/hr/leave/${id}/cancel`, { method: 'POST' }),
  listLeave: (status?: string) => request<{ leaves: any[] }>(`/api/hr/leave${status ? `?status=${status}` : ''}`),
  decideLeave: (id: string, decision: 'approved' | 'declined', note?: string) =>
    request<{ leave: any }>(`/api/hr/leave/${id}/decide`, { method: 'POST', body: JSON.stringify({ decision, note }) }),
  listOnboarding: () => request<{ records: any[] }>('/api/hr/onboarding'),
  startOnboarding: (body: { staffId?: string; email?: string }) =>
    request<{ record: any }>('/api/hr/onboarding/start', { method: 'POST', body: JSON.stringify(body) }),
  toggleTask: (id: string, index: number, done: boolean) =>
    request<{ record: any }>(`/api/hr/onboarding/${id}/task`, { method: 'POST', body: JSON.stringify({ index, done }) }),
};

export const messagesAPI = {
  orderThread: (orderId: string) =>
    request<{ conversation: any; messages: any[] }>(`/api/messages/order/${orderId}`),
  sendOrderMessage: (orderId: string, body: string) =>
    request<{ message: any }>(`/api/messages/order/${orderId}`, { method: 'POST', body: JSON.stringify({ body }) }),
  start: (data: { recipientId: string; body: string; storeId?: string; orderId?: string }) =>
    request<any>('/api/messages/start', { method: 'POST', body: JSON.stringify(data) }),
  conversations: () => request<{ conversations: any[] }>('/api/messages/conversations'),
  thread: (conversationId: string) =>
    request<{ conversation: any; messages: any[] }>(`/api/messages/${conversationId}`),
  send: (conversationId: string, body: string) =>
    request<any>(`/api/messages/${conversationId}`, { method: 'POST', body: JSON.stringify({ body }) }),
};

// ═════════════════════════════════════════════════════════════════════════════
// PROMO CODES (loyalty / discounts)
// ═════════════════════════════════════════════════════════════════════════════
export const promosAPI = {
  create: (data: Record<string, any>) =>
    request<any>('/api/promos', { method: 'POST', body: JSON.stringify(data) }),
  forStore: (storeId: string) => request<{ promos: any[] }>(`/api/promos/store/${storeId}`),
  validate: (storeId: string, code: string, orderTotal: number) =>
    request<any>('/api/promos/validate', { method: 'POST', body: JSON.stringify({ storeId, code, orderTotal }) }),
  toggle: (id: string, active?: boolean) =>
    request<any>(`/api/promos/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
};

// ═════════════════════════════════════════════════════════════════════════════
// CURRENCY (local <-> international conversion)
// ═════════════════════════════════════════════════════════════════════════════
export const currencyConvertAPI = {
  supported: () => request<{ currencies: string[] }>('/api/currency/supported'),
  convert: (amount: number, from: string, to: string) =>
    request<{ result: number }>('/api/currency/convert', {
      method: 'POST', body: JSON.stringify({ amount, from, to }),
    }),
};

// ═════════════════════════════════════════════════════════════════════════════
// RECEIPTS (branded PDF)
// ═════════════════════════════════════════════════════════════════════════════
export const receiptsAPI = {
  orderReceiptUrl: (orderId: string) =>
    `${BASE_URL}/api/receipts/order/${orderId}?token=${getToken()}`,
};

// ═════════════════════════════════════════════════════════════════════════════
// Workflow engine — officer approval inbox + decisions
// ═════════════════════════════════════════════════════════════════════════════
export const workflowAPI = {
  definitions: () =>
    request<{ definitions: any[] }>('/api/workflows/definitions'),

  // Items awaiting the current officer's decision. The server narrows by
  // role + region/district; the client just renders.
  inbox: () =>
    request<{ inbox: any[]; summary: { total: number; overdue: number } }>(
      '/api/workflows/inbox'
    ),

  list: (params: {
    status?: 'pending' | 'in_review' | 'approved' | 'rejected' | 'cancelled' | 'escalated';
    definitionKey?: string;
    entityType?: string;
    page?: number;
    limit?: number;
  } = {}) =>
    request<{ instances: any[]; total: number; page: number; limit: number }>(
      `/api/workflows${qs(params)}`
    ),

  get: (id: string) =>
    request<{ instance: any }>(`/api/workflows/${id}`),

  decide: (id: string, body: { decision: 'approved' | 'rejected' | 'escalated'; comment?: string }) =>
    request<{ message: string; instance: any; complete: boolean }>(
      `/api/workflows/${id}/decide`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  start: (body: { definitionKey: string; entityType: string; entityId: string; region?: string; district?: string }) =>
    request<{ message: string; instance: any }>(
      '/api/workflows/start',
      { method: 'POST', body: JSON.stringify(body) }
    ),
};

// ═════════════════════════════════════════════════════════════════════════════
// Internal officer messaging — department channels + emergency broadcast
// ═════════════════════════════════════════════════════════════════════════════
export const officerCommsAPI = {
  channels: () =>
    request<{ channels: any[] }>('/api/officer-comms/channels'),

  channel: (id: string) =>
    request<{ channel: any; messages: any[]; canPost: boolean }>(
      `/api/officer-comms/channels/${id}/messages`
    ),

  send: (id: string, body: string, priority: 'normal' | 'urgent' | 'emergency' = 'normal') =>
    request<{ message: any }>(
      `/api/officer-comms/channels/${id}/messages`,
      { method: 'POST', body: JSON.stringify({ body, priority }) }
    ),

  markRead: (id: string) =>
    request<{ ok: boolean }>(
      `/api/officer-comms/channels/${id}/read`,
      { method: 'POST' }
    ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Logistics / Delivery
// ─────────────────────────────────────────────────────────────────────────────
export const deliveryAPI = {
  aiReassign: (minutes?: number) =>
    request<{ reassigned: string[]; stillStuck: string[]; message: string }>('/api/deliveries/ai-reassign', { method: 'POST', body: JSON.stringify({ minutes }) }),
  list: (params: { status?: string; limit?: number } = {}) =>
    request<{ deliveries: any[] }>(`/api/deliveries${qs(params)}`),

  mine: () =>
    request<{ deliveries: any[]; summary: { active: number; completed: number; earnings: number; pending: number } }>(
      '/api/deliveries/mine'
    ),

  // Active jobs grouped by destination buyer — multi-store orders in one run.
  batches: () =>
    request<{
      batches: {
        buyerId: string; buyerName: string; buyerPhone: string;
        dropoff: { address: string; region: string; district: string; lat: number; lng: number };
        pickups: { deliveryId: string; trackingNumber: string; orderNumber: string; storeName: string; sellerName: string; status: string; pickupRegion: string; pickupDistrict: string; pickupLat: number; pickupLng: number; weightKg: number; fee: number }[];
        totalFee: number; parcels: number; multiStore: boolean;
      }[];
      totalBatches: number; multiStoreBatches: number; totalParcels: number;
    }>('/api/deliveries/batches'),

  stats: () =>
    request<{ counts: Record<string, number>; active: number; total: number; unassigned: number }>(
      '/api/deliveries/stats'
    ),
  ping: (id: string, lat: number, lng: number) =>
    request<{ ok: boolean }>(`/api/deliveries/${id}/ping`, { method: 'POST', body: JSON.stringify({ lat, lng }) }),
  shareLocation: (id: string, body: { lat?: number; lng?: number; locationText?: string }) =>
    request<{ ok: boolean }>(`/api/deliveries/${id}/ping`, { method: 'POST', body: JSON.stringify(body) }),
  byOrder: (orderId: string) =>
    request<{ delivery: any }>(`/api/deliveries/by-order/${orderId}`),
  publicTrack: (tracking: string) =>
    request<{ delivery: any }>(`/api/deliveries/track/${tracking}`),

  createForOrder: (orderId: string, body?: { vehicleType?: 'rider' | 'driver'; parcelWeightKg?: number }) =>
    request<{ delivery: any }>(`/api/deliveries/from-order/${orderId}`, { method: 'POST', body: JSON.stringify(body || {}) }),

  recommend: (id: string) =>
    request<{ recommendation: any; message?: string }>(`/api/deliveries/${id}/recommend`, { method: 'POST' }),

  assign: (id: string, body: { riderId?: string; auto?: boolean }) =>
    request<{ delivery: any }>(`/api/deliveries/${id}/assign`, { method: 'POST', body: JSON.stringify(body) }),

  setStatus: (id: string, body: { status: string; note?: string }) =>
    request<{ delivery: any }>(`/api/deliveries/${id}/status`, { method: 'POST', body: JSON.stringify(body) }),

  vehicles: () =>
    request<{ vehicles: any[] }>('/api/deliveries/vehicles/all'),

  createVehicle: (body: any) =>
    request<{ vehicle: any }>('/api/deliveries/vehicles', { method: 'POST', body: JSON.stringify(body) }),

  updateVehicle: (id: string, body: any) =>
    request<{ vehicle: any }>(`/api/deliveries/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  riders: (params: { status?: string } = {}) =>
    request<{ riders: any[]; counts: { available: number; busy: number; offline: number; total: number } }>(`/api/deliveries/riders${qs(params)}`),
  registerRider: (body: { fullName: string; email: string; phone: string; password: string; role?: string; region?: string; district?: string; vehicleLicense?: string }) =>
    request<{ rider: any }>('/api/deliveries/riders', { method: 'POST', body: JSON.stringify(body) }),
  setRiderDuty: (id: string, status: 'available' | 'busy' | 'offline') =>
    request<{ rider: any }>(`/api/deliveries/riders/${id}/duty`, { method: 'POST', body: JSON.stringify({ status }) }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Management (staff, moderation, approvals, discounts, AI regional intelligence)
// ─────────────────────────────────────────────────────────────────────────────
export const managementAPI = {
  listUsers: (params: { search?: string; role?: string; status?: string; region?: string; page?: number } = {}) =>
    request<{ users: any[]; total: number; page: number; pages: number }>(`/api/management/users${qs(params)}`),
  deleteUser: (id: string) =>
    request<{ ok: boolean; deleted: any }>(`/api/management/users/${id}`, { method: 'DELETE' }),
  enrollBuyer: (body: { fullName: string; email: string; phone: string; password: string; region?: string; district?: string; buyerType?: string }) =>
    request<{ buyer: any }>('/api/management/buyers/enroll', { method: 'POST', body: JSON.stringify(body) }),
  activity: (params: { action?: string; page?: number } = {}) =>
    request<{ logs: any[]; total: number; page: number; pages: number; last24h: number }>(`/api/management/activity${qs(params)}`),
  platformStats: () =>
    request<{ stats: any; trend: { label: string; orders: number; revenue: number }[] }>('/api/management/platform-stats'),
  officeStats: () =>
    request<{ finance: any; logistics: any; security: any; hr: any }>('/api/management/office-stats'),
  migrateSubscriptions: () =>
    request<{ ok: boolean; sellersUpdated: number; partnersUpdated: number; pricing: any }>('/api/management/migrate-subscriptions', { method: 'POST' }),
  jurisdictionLogistics: () =>
    request<{ scope: any; fleet: any; activeDeliveries: number; deliveredTotal: number; unassigned: number; failed: number; topRiders: any[]; recentDeliveries: any[] }>('/api/management/jurisdiction-logistics'),
  regionalOverview: () =>
    request<{ scope: any; stats: any; breakdown: { area: string; users: number; stores: number }[] }>('/api/management/regional-overview'),
  listStaff: (params: { region?: string; district?: string; role?: string } = {}) =>
    request<{ staff: any[] }>(`/api/management/staff${qs(params)}`),
  createStaff: (body: any) =>
    request<{ staff: any }>('/api/management/staff', { method: 'POST', body: JSON.stringify(body) }),
  moderate: (id: string, action: 'suspend' | 'flag' | 'reactivate', reason?: string) =>
    request<{ user: any }>(`/api/management/users/${id}/moderate`, { method: 'POST', body: JSON.stringify({ action, reason }) }),
  pendingRiders: () =>
    request<{ riders: any[] }>('/api/management/riders/pending'),
  approveRider: (id: string, approve: boolean, reason?: string) =>
    request<{ rider: any }>(`/api/management/riders/${id}/approve`, { method: 'POST', body: JSON.stringify({ approve, reason }) }),
  applyDiscount: (id: string, discountPercent: number) =>
    request<{ user: any }>(`/api/management/users/${id}/discount`, { method: 'POST', body: JSON.stringify({ discountPercent }) }),
  createStoreFor: (body: { ownerEmail: string; name: string; type?: string; region?: string; district?: string }) =>
    request<{ store: any }>('/api/management/stores', { method: 'POST', body: JSON.stringify(body) }),
  regionalIntelligence: () =>
    request<{ regions: any[]; weakest: any[]; headline: string; generatedAt: string }>('/api/management/regional-intelligence'),
  userRisk: (id: string) =>
    request<{ risk: { score: number; band: string; reasons: string[] } }>(`/api/management/users/${id}/risk`),
  aiApproveRiders: () =>
    request<{ approved: string[]; heldForReview: string[]; message: string }>('/api/management/riders/ai-approve', { method: 'POST' }),
  applyDiscountByEmail: (email: string, discountPercent: number) =>
    request<{ user: any }>('/api/management/discount', { method: 'POST', body: JSON.stringify({ email, discountPercent }) }),
  createPromotion: (body: { ownerEmail: string; code?: string; kind?: string; value: number; minOrder?: number; usageLimit?: number; expiresAt?: string }) =>
    request<{ promo: any }>('/api/management/promotions', { method: 'POST', body: JSON.stringify(body) }),
  discountRecommendations: () =>
    request<{ recommendations: any[]; generatedAt: string }>('/api/management/discount-recommendations'),
  reportUser: (body: { email: string; category: string; reason: string; description?: string }) =>
    request<{ report: any }>('/api/management/report', { method: 'POST', body: JSON.stringify(body) }),
  bulkStaff: (staff: any[]) =>
    request<{ createdCount: number; errorCount: number; errors: any[] }>('/api/management/staff/bulk', { method: 'POST', body: JSON.stringify({ staff }) }),
};

export const SUBSCRIPTION = {
  momoNumber: '+233 24 071 5156',
  trialMonths: 4,
  trialDays: 120,
  partnerFee: 30,
  priceForStores: (stores: number) => (stores >= 2 ? 70 : 50),
};

// ─────────────────────────────────────────────────────────────────────────────
// AI: assistant knowledge base + executive AI task runner
// ─────────────────────────────────────────────────────────────────────────────
export const aiAPI = {
  status: () =>
    request<{ llmEnabled: boolean; provider: string | null; model: string | null; mode: string; selfLearning?: boolean; learning?: { learned: number; knowledge: number; totalUpvotes: number } }>('/api/ai/status'),
  feedback: (question: string, answer: string, helpful: boolean, scope?: string) =>
    request<{ ok: boolean }>('/api/ai/feedback', { method: 'POST', body: JSON.stringify({ question, answer, helpful, scope }) }),
  chat: (message: string, persona?: string) =>
    request<{ reply?: string; fallback?: boolean; source?: string; confidence?: number }>('/api/ai/chat', { method: 'POST', body: JSON.stringify({ message, persona }) }),
  teach: (question: string, answer: string, scope?: string) =>
    request<{ message: string; learning: any }>('/api/ai/teach', { method: 'POST', body: JSON.stringify({ question, answer, scope }) }),
  faqs: (scope?: string) =>
    request<{ entries: any[] }>(`/api/ai/faqs${scope ? `?scope=${scope}` : ''}`),
  faqsAdmin: () =>
    request<{ entries: any[] }>('/api/ai/faqs/admin'),
  createFaq: (body: { question: string; answer: string; scope?: string; keywords?: string[] }) =>
    request<{ entry: any }>('/api/ai/faqs', { method: 'POST', body: JSON.stringify(body) }),
  updateFaq: (id: string, body: any) =>
    request<{ entry: any }>(`/api/ai/faqs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteFaq: (id: string) =>
    request<{ ok: boolean }>(`/api/ai/faqs/${id}`, { method: 'DELETE' }),
  tasks: () =>
    request<{ tasks: any[] }>('/api/ai/tasks'),
  createTask: (body: { type: string; prompt?: string }) =>
    request<{ task: any }>('/api/ai/tasks', { method: 'POST', body: JSON.stringify(body) }),
};


export const reportingAPI = {
  inbox: () => request<{ reports: any[]; myLevel: string; childLevel: string | null }>('/api/office/reports/inbox'),
  aiAssist: (period: string) => request<{ draft: string; analysis?: string; metrics: any; usedLLM: boolean }>('/api/office/reports/ai-assist', { method: 'POST', body: JSON.stringify({ period }) }),
  create: (body: { title: string; body: string; period: string; status?: string; metrics?: any }) => request<{ report: any }>('/api/office/reports', { method: 'POST', body: JSON.stringify(body) }),
  forward: (id: string) => request<{ report: any; message: string }>(`/api/office/reports/${id}/forward`, { method: 'POST' }),
  compile: (ids: string[], title: string, period: string) => request<{ report: any }>('/api/office/reports/compile', { method: 'POST', body: JSON.stringify({ ids, title, period }) }),
  review: (id: string, note?: string) => request<{ report: any }>(`/api/office/reports/${id}/review`, { method: 'POST', body: JSON.stringify({ note }) }),
};

export const financeAPI = {
  structure: () => request<{ structure: any[] }>('/api/office/finance/structure'),
  upsertStructure: (body: { role: string; grade?: string; monthlyGross: number; allowances?: number }) => request<{ row: any }>('/api/office/finance/structure', { method: 'POST', body: JSON.stringify(body) }),
  pay: (officerEmail: string, period?: string, deductions?: number) => request<{ payment: any }>('/api/office/finance/pay', { method: 'POST', body: JSON.stringify({ officerEmail, period, deductions }) }),
  bulkPay: (payments: any[]) => request<{ createdCount: number; errorCount: number; errors: any[] }>('/api/office/finance/pay/bulk', { method: 'POST', body: JSON.stringify({ payments }) }),
  payments: () => request<{ payments: any[] }>('/api/office/finance/payments'),
  summary: () => request<any>('/api/office/finance/summary'),
  aiAnalysis: (period?: string) => request<{ analysis: string; data: any; usedLLM: boolean }>(`/api/office/finance/ai-analysis${period ? `?period=${period}` : ''}`),
};
