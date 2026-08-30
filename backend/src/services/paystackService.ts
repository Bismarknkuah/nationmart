/**
 * Mobile Money payment service (MTN MoMo / Telecel Cash / AirtelTigo Money).
 *
 * Uses **Paystack** (https://paystack.com) — free to integrate, Ghana-ready,
 * with a sandbox/test mode. Paystack's Charge API sends a real STK/approval
 * prompt to the customer's phone for mobile-money payments.
 *
 *   - Set PAYSTACK_SECRET_KEY (sk_test_... or sk_live_...) to use the real API.
 *   - With no key set, the service runs in SIMULATION mode: it mimics the full
 *     prompt -> authorize -> settle flow so the whole platform works end-to-end
 *     out of the box. Switching to live payments is just adding the env var.
 */
import crypto from 'crypto';

const PAYSTACK_BASE = 'https://api.paystack.co';

/** fetch with a hard timeout so a slow/unreachable gateway never hangs the request (which would surface as a 502). */
async function pfetch(url: string, init: any, ms = 15000): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type MomoNetwork = 'mtn' | 'telecel' | 'airteltigo';

// Paystack mobile_money provider codes for Ghana
const PROVIDER_CODE: Record<MomoNetwork, string> = {
  mtn: 'mtn',
  telecel: 'vod', // Telecel (formerly Vodafone Cash)
  airteltigo: 'atl',
};

export interface ChargeInit {
  reference: string;
  provider: 'paystack' | 'simulated';
  status: 'send_otp' | 'pending' | 'pay_offline' | 'failed';
  displayText: string;
  providerReference?: string;
}

export interface ChargeVerify {
  status: 'success' | 'pending' | 'failed';
  amount: number;     // major units (GHS)
  message: string;
  paidAt?: string;
}

function secretKey(): string | undefined {
  return process.env.PAYSTACK_SECRET_KEY;
}

export function isLiveMode(): boolean {
  return !!secretKey();
}

export function generateReference(prefix = 'NM'): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * Initiate a mobile-money charge. In live mode this triggers the on-phone
 * approval prompt. Amount is in GHS (major units); Paystack expects pesewas.
 */
export async function initiateMomoCharge(params: {
  email: string;
  amountGHS: number;
  phone: string;
  network: MomoNetwork;
  reference: string;
  subaccount?: string;          // route the seller's share here
  platformFeeGHS?: number;      // platform commission kept off the subaccount split
}): Promise<ChargeInit> {
  const { email, amountGHS, phone, network, reference, subaccount, platformFeeGHS } = params;

  if (!isLiveMode()) {
    // Simulation: pretend the prompt was delivered to the phone.
    return {
      reference,
      provider: 'simulated',
      status: 'pending',
      displayText:
        `A payment prompt for GHS ${amountGHS.toFixed(2)} has been sent to ${phone}. ` +
        `Approve it on your phone to complete payment. (Simulation mode — no real charge.)`,
    };
  }

  try {
    const payload: any = {
      email,
      amount: Math.round(amountGHS * 100), // pesewas
      currency: 'GHS',
      reference,
      mobile_money: { phone, provider: PROVIDER_CODE[network] },
    };
    // Split to the seller's subaccount; platform keeps the flat commission.
    if (subaccount) {
      payload.subaccount = subaccount;
      payload.bearer = 'account'; // main account (platform) bears Paystack fees
      if (typeof platformFeeGHS === 'number' && platformFeeGHS > 0) {
        payload.transaction_charge = Math.round(platformFeeGHS * 100); // pesewas to platform
      }
    }
    const resp = await pfetch(`${PAYSTACK_BASE}/charge`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data: any = await resp.json().catch(() => ({}));

    if (!resp.ok || data.status === false) {
      const msg: string = data.message || '';
      // Auth/configuration problems shouldn't look like the buyer's fault.
      if (/invalid key|authorization|unauthorized/i.test(msg) || resp.status === 401) {
        console.error('[paystack] charge rejected — check PAYSTACK_SECRET_KEY on the server:', msg);
        return {
          reference,
          provider: 'paystack',
          status: 'failed',
          displayText: 'Payments are temporarily unavailable (gateway not configured). Please try again shortly or contact support.',
        };
      }
      return {
        reference,
        provider: 'paystack',
        status: 'failed',
        displayText: msg || 'Could not initiate mobile money charge.',
      };
    }

    const s = data.data?.status;
    const display: ChargeInit['status'] =
      s === 'send_otp' ? 'send_otp' : s === 'pay_offline' ? 'pay_offline' : 'pending';

    return {
      reference,
      provider: 'paystack',
      status: display,
      displayText: data.data?.display_text || 'Approve the prompt on your phone to complete payment.',
      providerReference: data.data?.reference,
    };
  } catch (err: any) {
    console.error('[paystack] momo charge error:', err?.name, err?.message);
    const timedOut = err?.name === 'AbortError';
    return {
      reference,
      provider: 'paystack',
      status: 'failed',
      displayText: timedOut
        ? 'The payment gateway took too long to respond. Please try again in a moment.'
        : 'Could not reach the payment gateway. Please try again shortly.',
    };
  }
}

/**
 * Submit an OTP when Paystack requests one (some MoMo flows).
 */
export async function submitMomoOtp(otp: string, reference: string): Promise<ChargeVerify> {
  if (!isLiveMode()) {
    return { status: 'success', amount: 0, message: 'OTP accepted (simulation).' };
  }
  try {
    const resp = await pfetch(`${PAYSTACK_BASE}/charge/submit_otp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp, reference }),
    });
    const data: any = await resp.json().catch(() => ({}));
    const s = data.data?.status;
    return {
      status: s === 'success' ? 'success' : s === 'failed' ? 'failed' : 'pending',
      amount: (data.data?.amount || 0) / 100,
      message: data.message || 'OTP submitted.',
    };
  } catch (err: any) {
    return { status: 'failed', amount: 0, message: err.message };
  }
}

/**
 * Verify the final state of a transaction. In simulation mode we treat any
 * verified reference as a success (this is where the "approval" settles).
 */
export async function verifyTransaction(reference: string): Promise<ChargeVerify> {
  if (!isLiveMode()) {
    return {
      status: 'success',
      amount: 0,
      message: 'Payment confirmed (simulation mode).',
      paidAt: new Date().toISOString(),
    };
  }
  try {
    const resp = await pfetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey()}` },
    });
    const data: any = await resp.json().catch(() => ({}));
    const s = data.data?.status;
    return {
      status: s === 'success' ? 'success' : s === 'failed' ? 'failed' : 'pending',
      amount: (data.data?.amount || 0) / 100,
      message: data.data?.gateway_response || data.message || 'Verification complete.',
      paidAt: data.data?.paid_at,
    };
  } catch (err: any) {
    return { status: 'pending', amount: 0, message: err.message };
  }
}

/**
 * Verify a Paystack webhook signature (x-paystack-signature header).
 *
 * `rawBody` MUST be the exact bytes Paystack sent. Re-serialising the parsed
 * body with JSON.stringify() does NOT round-trip (Unicode escaping, float
 * normalisation such as 1.50 -> 1.5, key ordering) and will silently reject
 * genuine webhooks — money taken from the buyer, seller never credited.
 *
 * With no secret key configured we return false rather than HMAC-ing with an
 * empty string, which anyone could reproduce.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const key = secretKey();
  if (!key || !rawBody || !signature) return false;

  const expected = crypto.createHmac('sha512', key).update(rawBody, 'utf8').digest('hex');
  // timingSafeEqual throws on length mismatch, so guard first.
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
}

/** MoMo "bank" codes used as settlement_bank for subaccounts (Ghana). */
export const GHANA_MOMO_BANKS: Record<string, string> = {
  mtn: 'MTN',
  telecel: 'VOD',        // Telecel (ex-Vodafone) Cash
  airteltigo: 'ATL',     // AirtelTigo Money
};

export interface SubaccountResult { ok: boolean; subaccountCode?: string; message?: string }

/**
 * Create a Paystack subaccount so a seller receives their share automatically.
 * settlementBank: a Paystack bank code (or MoMo code from GHANA_MOMO_BANKS).
 * percentageCharge: the share (%) that goes to the SUBACCOUNT (seller). Paystack
 * sends the rest to the main (platform) account. e.g. 95 → seller gets 95%.
 */
export async function createSubaccount(params: {
  businessName: string;
  settlementBank: string;
  accountNumber: string;
  percentageCharge: number;
}): Promise<SubaccountResult> {
  if (!isLiveMode()) {
    // Simulation: hand back a fake code so the flow is testable without keys.
    return { ok: true, subaccountCode: `ACCT_sim_${Math.random().toString(36).slice(2, 10)}`, message: 'Simulated subaccount (no Paystack key set).' };
  }
  try {
    const resp = await pfetch(`${PAYSTACK_BASE}/subaccount`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_name: params.businessName,
        settlement_bank: params.settlementBank,
        account_number: params.accountNumber,
        percentage_charge: params.percentageCharge,
      }),
    });
    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok || data.status === false) {
      return { ok: false, message: data.message || 'Could not create subaccount.' };
    }
    return { ok: true, subaccountCode: data.data?.subaccount_code, message: 'Subaccount created.' };
  } catch (err: any) {
    return { ok: false, message: err.message };
  }
}

/** What a buyer can pay with. */
export type PayChannel = 'card' | 'mobile_money' | 'bank_transfer' | 'bank';

/**
 * Start a hosted checkout — Visa/Mastercard, mobile money, or bank transfer.
 *
 * `channels` restricts what the Paystack page offers. Pass ['card'] and the
 * buyer only sees the card form. Omit it and they get everything the Paystack
 * account has enabled for Ghana.
 *
 * NOTE: which channels actually appear depends on what is switched on for YOUR
 * Paystack account and country. In Ghana, card and mobile_money are the reliable
 * two; bank_transfer needs to be enabled on the account and may not show. We ask
 * for what the caller wants and let Paystack render what it supports rather than
 * pretending on the client side.
 *
 * Returns a Paystack-hosted URL to send the buyer to. With no PAYSTACK_SECRET_KEY
 * set the service stays in SIMULATION mode and returns null, so the rest of the
 * platform still works end-to-end while you wait for your live keys.
 */
export async function initiateCardPayment(params: {
  email: string;
  amount: number;              // in GHS (cedis); converted to pesewas here
  reference: string;
  channels?: PayChannel[];
  callbackUrl?: string;
  subaccount?: string;         // seller's split destination
  platformFeeGHS?: number;     // commission kept by the platform
  metadata?: Record<string, any>;
}): Promise<{ authorizationUrl: string | null; accessCode: string | null; reference: string }> {
  if (!isLiveMode()) {
    // Simulation: no gateway to send them to; the caller settles via verify.
    return { authorizationUrl: null, accessCode: null, reference: params.reference };
  }

  try {
    const body: any = {
      email: params.email,
      amount: Math.round(params.amount * 100),   // Paystack works in pesewas
      reference: params.reference,
      currency: 'GHS',
      channels: params.channels?.length
        ? params.channels
        : ['card', 'mobile_money', 'bank_transfer'],
      callback_url: params.callbackUrl || process.env.PAYSTACK_CALLBACK_URL,
      metadata: params.metadata ?? {},
    };
    if (params.subaccount) {
      body.subaccount = params.subaccount;
      body.bearer = 'account';
      if (typeof params.platformFeeGHS === 'number' && params.platformFeeGHS > 0) {
        body.transaction_charge = Math.round(params.platformFeeGHS * 100);
      }
    }

    const resp = await pfetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data: any = await resp.json().catch(() => ({}));
    if (!data.status) {
      throw new Error(data.message || 'Paystack could not start this payment.');
    }

    return {
      authorizationUrl: data.data?.authorization_url ?? null,
      accessCode: data.data?.access_code ?? null,
      reference: data.data?.reference || params.reference,
    };
  } catch (err: any) {
    throw new Error(err.message || 'Payment could not be started. Please try again.');
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Saved cards
// ───────────────────────────────────────────────────────────────────────────

export interface CardAuthorization {
  authCode: string;
  last4: string;
  brand: string;          // visa | mastercard | verve
  expMonth: string;
  expYear: string;
  issuer?: string;
  reusable: boolean;
}

/**
 * Pull the reusable card authorization out of a Paystack transaction payload.
 *
 * This is what lets a buyer pay with one tap next time, and what lets a seller's
 * yearly subscription renew without them doing anything. We never see or store
 * the card number — Paystack hands back an opaque code tied to our account.
 *
 * Returns null when the card is not reusable (some cards refuse), and for MoMo
 * charges, which have no authorization to save.
 */
export function extractAuthorization(txData: any): CardAuthorization | null {
  const a = txData?.authorization;
  if (!a?.authorization_code || !a?.reusable) return null;
  if (a.channel && a.channel !== 'card') return null;   // only cards are reusable

  return {
    authCode: a.authorization_code,
    last4: a.last4 ?? '',
    brand: (a.brand ?? '').toLowerCase(),
    expMonth: a.exp_month ?? '',
    expYear: a.exp_year ?? '',
    issuer: a.bank ?? undefined,
    reusable: true,
  };
}

/**
 * Charge a card the user has already approved once. This is the one-tap repeat
 * payment, and the subscription renewal.
 *
 * Unlike a hosted checkout there is no redirect: the charge either succeeds or
 * it doesn't, right here.
 */
export async function chargeAuthorization(params: {
  authCode: string;
  email: string;
  amount: number;              // GHS
  reference: string;
  metadata?: Record<string, any>;
}): Promise<ChargeVerify> {
  if (!isLiveMode()) {
    return {
      status: 'success',
      amount: params.amount,
      message: 'Card charged (simulation mode — no real charge).',
      paidAt: new Date().toISOString(),
    };
  }

  try {
    const resp = await pfetch(`${PAYSTACK_BASE}/transaction/charge_authorization`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authorization_code: params.authCode,
        email: params.email,
        amount: Math.round(params.amount * 100),
        currency: 'GHS',
        reference: params.reference,
        metadata: params.metadata ?? {},
      }),
    });
    const data: any = await resp.json().catch(() => ({}));

    if (!resp.ok || data.status === false) {
      return { status: 'failed', amount: 0, message: data.message || 'The card was declined.' };
    }
    const s = data.data?.status;
    return {
      status: s === 'success' ? 'success' : s === 'failed' ? 'failed' : 'pending',
      amount: (data.data?.amount || 0) / 100,
      message: data.data?.gateway_response || 'Card charged.',
      paidAt: data.data?.paid_at,
    };
  } catch (err: any) {
    return { status: 'failed', amount: 0, message: err.message };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Payouts — getting money OUT to a seller or rider
// ───────────────────────────────────────────────────────────────────────────

export interface Bank { name: string; code: string; type: string }

/** Banks and MoMo providers we can pay out to in Ghana. */
export async function listBanks(): Promise<Bank[]> {
  if (!isLiveMode()) {
    return [
      { name: 'MTN Mobile Money', code: 'MTN', type: 'mobile_money' },
      { name: 'Telecel Cash', code: 'VOD', type: 'mobile_money' },
      { name: 'AirtelTigo Money', code: 'ATL', type: 'mobile_money' },
      { name: 'GCB Bank', code: '040100', type: 'ghipss' },
      { name: 'Ecobank Ghana', code: '130100', type: 'ghipss' },
      { name: 'Absa Bank Ghana', code: '030100', type: 'ghipss' },
      { name: 'Fidelity Bank', code: '240100', type: 'ghipss' },
      { name: 'Stanbic Bank', code: '190100', type: 'ghipss' },
    ];
  }
  try {
    const resp = await pfetch(`${PAYSTACK_BASE}/bank?currency=GHS`, {
      headers: { Authorization: `Bearer ${secretKey()}` },
    });
    const data: any = await resp.json().catch(() => ({}));
    if (!data.status) return [];
    return (data.data ?? []).map((b: any) => ({
      name: b.name, code: b.code, type: b.type,
    }));
  } catch {
    return [];
  }
}

/**
 * Ask the bank who owns an account number, BEFORE we send money to it.
 *
 * This is the single cheapest way to stop a seller losing GHS 4,000 to a typo.
 * We show them the name the bank returns and make them confirm it; we never
 * trust the name they typed.
 */
export async function resolveAccount(
  accountNumber: string, bankCode: string,
): Promise<{ ok: boolean; accountName?: string; message?: string }> {
  if (!isLiveMode()) {
    return { ok: true, accountName: 'SIMULATED ACCOUNT NAME', message: 'Simulation mode.' };
  }
  try {
    const url = `${PAYSTACK_BASE}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`;
    const resp = await pfetch(url, { headers: { Authorization: `Bearer ${secretKey()}` } });
    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok || data.status === false) {
      return { ok: false, message: data.message || 'Could not verify that account.' };
    }
    return { ok: true, accountName: data.data?.account_name };
  } catch (err: any) {
    return { ok: false, message: err.message };
  }
}

/**
 * Register a payout destination with Paystack.
 *   • mobile_money — account_number is the PHONE, bank_code is MTN/VOD/ATL
 *   • ghipss       — a Ghanaian bank account
 */
export async function createTransferRecipient(params: {
  type: 'mobile_money' | 'ghipss';
  name: string;
  accountNumber: string;
  bankCode: string;
}): Promise<{ ok: boolean; recipientCode?: string; message?: string }> {
  if (!isLiveMode()) {
    return {
      ok: true,
      recipientCode: `RCP_sim_${crypto.randomBytes(5).toString('hex')}`,
      message: 'Simulated recipient (no Paystack key set).',
    };
  }
  try {
    const resp = await pfetch(`${PAYSTACK_BASE}/transferrecipient`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: params.type,
        name: params.name,
        account_number: params.accountNumber,
        bank_code: params.bankCode,
        currency: 'GHS',
      }),
    });
    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok || data.status === false) {
      return { ok: false, message: data.message || 'Could not register that payout destination.' };
    }
    return { ok: true, recipientCode: data.data?.recipient_code };
  } catch (err: any) {
    return { ok: false, message: err.message };
  }
}

export interface TransferResult {
  ok: boolean;
  status: 'processing' | 'paid' | 'failed';
  transferCode?: string;
  message: string;
}

/**
 * Actually send the money.
 *
 * The wallet has ALREADY been debited by request_payout() before this is called,
 * so a failure here must be reversed by the caller — never left silently
 * swallowed. The webhook (transfer.success / transfer.failed / transfer.reversed)
 * is the authority on where it ended up.
 */
export async function initiateTransfer(params: {
  recipientCode: string;
  amount: number;              // GHS
  reference: string;
  reason?: string;
}): Promise<TransferResult> {
  if (!isLiveMode()) {
    return {
      ok: true,
      status: 'processing',
      transferCode: `TRF_sim_${crypto.randomBytes(5).toString('hex')}`,
      message: 'Transfer queued (simulation mode — no real money moved).',
    };
  }
  try {
    const resp = await pfetch(`${PAYSTACK_BASE}/transfer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'balance',
        recipient: params.recipientCode,
        amount: Math.round(params.amount * 100),
        currency: 'GHS',
        reference: params.reference,
        reason: params.reason || 'NationMart withdrawal',
      }),
    });
    const data: any = await resp.json().catch(() => ({}));

    if (!resp.ok || data.status === false) {
      const msg: string = data.message || 'The transfer was rejected.';
      // Worth calling out plainly: this one means YOUR Paystack balance is empty,
      // not that the seller did anything wrong.
      if (/balance|insufficient/i.test(msg)) {
        console.error('[paystack] TRANSFER REJECTED — the NationMart Paystack balance is too low to pay out:', msg);
      }
      return { ok: false, status: 'failed', message: msg };
    }

    const s = data.data?.status;
    return {
      ok: true,
      status: s === 'success' ? 'paid' : 'processing',
      transferCode: data.data?.transfer_code,
      message: data.message || 'Transfer queued.',
    };
  } catch (err: any) {
    return { ok: false, status: 'failed', message: err.message };
  }
}
