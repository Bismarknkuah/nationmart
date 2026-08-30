import { q, tx, money } from '../db/pg';

/**
 * Payment methods & payouts — PostgreSQL.
 *
 * Money in:  a saved card (Visa/Mastercard), mobile money, or a bank transfer.
 * Money out: a payout to mobile money or a bank account.
 *
 * The invariant that protects the business: a payout DEBITS THE WALLET AT
 * REQUEST TIME (request_payout does this under a row lock). A seller who
 * double-taps Withdraw cannot get paid twice, and money in flight is not
 * spendable. If the transfer later fails, reverse_payout() gives it back.
 */

export type MethodKind = 'card' | 'mobile_money' | 'bank_account';
export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'reversed';

export type MethodRow = {
  id: string;
  user_id: string;
  kind: MethodKind;
  label: string;
  auth_code: string | null;
  last4: string | null;
  card_brand: string | null;
  exp_month: string | null;
  exp_year: string | null;
  issuer: string | null;
  momo_phone: string | null;
  momo_network: string | null;
  bank_code: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  recipient_code: string | null;
  is_default: boolean;
  verified: boolean;
  created_at: Date;
};

export type PayoutRow = {
  id: string;
  reference: string;
  user_id: string;
  method_id: string | null;
  amount: string;
  currency: string;
  status: PayoutStatus;
  destination: string;
  recipient_code: string | null;
  transfer_code: string | null;
  provider_ref: string | null;
  failure_reason: string | null;
  requested_at: Date;
  settled_at: Date | null;
};

export const MIN_PAYOUT_GHS = Number(process.env.MIN_PAYOUT_GHS || 10);

export class PayoutError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'PayoutError';
  }
}

export function payoutReference(): string {
  return `NM-PO-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

/** Only cards and MoMo can pay IN. Only MoMo and bank accounts can pay OUT. */
export const canPayIn  = (kind: MethodKind) => kind === 'card' || kind === 'mobile_money';
export const canPayOut = (kind: MethodKind) => kind === 'bank_account' || kind === 'mobile_money';

// ─── Saving methods ──────────────────────────────────────────────────────────

/**
 * Save a card from a successful Paystack transaction.
 *
 * We store an opaque authorization code and the last four digits. Not the card
 * number, not the CVV — those never reach our servers at all. The last four
 * exists only so a person can tell their two cards apart.
 *
 * Idempotent: paying twice with the same card does not create two rows.
 */
export async function saveCard(userId: string, auth: {
  authCode: string; last4: string; brand: string;
  expMonth: string; expYear: string; issuer?: string;
}): Promise<MethodRow | null> {
  const label = `${auth.brand ? auth.brand.toUpperCase() : 'Card'} •••• ${auth.last4}`;

  const rows = await q<MethodRow>(
    `INSERT INTO payment_methods (
       user_id, kind, label, auth_code, last4, card_brand, exp_month, exp_year, issuer,
       verified, is_default
     ) VALUES (
       $1::uuid, 'card', $2, $3, $4, $5, $6, $7, $8, TRUE,
       NOT EXISTS (SELECT 1 FROM payment_methods WHERE user_id = $1::uuid)
     )
     ON CONFLICT (user_id, auth_code) WHERE auth_code IS NOT NULL
       DO UPDATE SET exp_month = EXCLUDED.exp_month,
                     exp_year  = EXCLUDED.exp_year,
                     verified  = TRUE
     RETURNING *`,
    [userId, label, auth.authCode, auth.last4, auth.brand,
     auth.expMonth, auth.expYear, auth.issuer ?? null],
  );
  return rows[0] ?? null;
}

export async function saveMomo(userId: string, phone: string, network: string): Promise<MethodRow> {
  const net = String(network).toLowerCase();
  if (!['mtn', 'telecel', 'airteltigo'].includes(net)) {
    throw new PayoutError('Choose MTN, Telecel or AirtelTigo.', 'BAD_NETWORK');
  }
  const clean = String(phone).replace(/[^\d+]/g, '');
  if (clean.length < 9) throw new PayoutError('That phone number looks wrong.', 'BAD_PHONE');

  const rows = await q<MethodRow>(
    `INSERT INTO payment_methods (
       user_id, kind, label, momo_phone, momo_network, verified, is_default
     ) VALUES (
       $1::uuid, 'mobile_money', $2, $3, $4, TRUE,
       NOT EXISTS (SELECT 1 FROM payment_methods WHERE user_id = $1::uuid)
     )
     ON CONFLICT (user_id, momo_phone, momo_network) WHERE momo_phone IS NOT NULL
       DO UPDATE SET verified = TRUE
     RETURNING *`,
    [userId, `${net.toUpperCase()} ${clean}`, clean, net],
  );
  return rows[0];
}

/**
 * Save a bank account for payouts.
 *
 * `accountName` MUST be the name the bank returned from resolveAccount(), never
 * the name the user typed. That check is the cheapest way to stop someone losing
 * GHS 4,000 to a mistyped digit.
 */
export async function saveBankAccount(userId: string, input: {
  accountNumber: string; bankCode: string; bankName: string; accountName: string;
}): Promise<MethodRow> {
  if (!input.accountName?.trim()) {
    throw new PayoutError(
      'The account must be verified with the bank before it can be saved.',
      'UNVERIFIED',
    );
  }
  const rows = await q<MethodRow>(
    `INSERT INTO payment_methods (
       user_id, kind, label, account_number, bank_code, bank_name, account_name,
       verified, is_default
     ) VALUES (
       $1::uuid, 'bank_account', $2, $3, $4, $5, $6, TRUE,
       NOT EXISTS (SELECT 1 FROM payment_methods WHERE user_id = $1::uuid)
     )
     ON CONFLICT (user_id, bank_code, account_number) WHERE account_number IS NOT NULL
       DO UPDATE SET account_name = EXCLUDED.account_name, verified = TRUE
     RETURNING *`,
    [
      userId,
      `${input.bankName} •••${String(input.accountNumber).slice(-4)}`,
      input.accountNumber, input.bankCode, input.bankName, input.accountName.trim(),
    ],
  );
  return rows[0];
}

export async function listMethods(userId: string): Promise<MethodRow[]> {
  return q<MethodRow>(
    `SELECT * FROM payment_methods WHERE user_id = $1::uuid
      ORDER BY is_default DESC, created_at DESC`,
    [userId],
  );
}

export async function findMethod(id: string, userId: string): Promise<MethodRow | null> {
  const rows = await q<MethodRow>(
    `SELECT * FROM payment_methods WHERE id = $1::uuid AND user_id = $2::uuid`,
    [id, userId],
  );
  return rows[0] ?? null;
}

/** The trigger demotes whichever method was previously default. */
export async function setDefault(id: string, userId: string): Promise<MethodRow | null> {
  const rows = await q<MethodRow>(
    `UPDATE payment_methods SET is_default = TRUE
      WHERE id = $1::uuid AND user_id = $2::uuid
      RETURNING *`,
    [id, userId],
  );
  return rows[0] ?? null;
}

/** Roles that get paid by NationMart, and therefore need somewhere to be paid. */
export const EARNING_ROLES = [
  'seller', 'reseller', 'wholesaler', 'manufacturer', 'rider', 'driver',
];

export const needsPayoutMethod = (role: string) => EARNING_ROLES.includes(role);

/** Does this person have anywhere we can actually send money? */
export async function hasPayoutMethod(userId: string): Promise<boolean> {
  const [row] = await q<{ n: string }>(
    `SELECT count(*) AS n FROM payment_methods
      WHERE user_id = $1::uuid
        AND kind IN ('mobile_money', 'bank_account')`,
    [userId],
  );
  return Number(row.n) > 0;
}

/**
 * Remove a payment method.
 *
 * A seller or rider cannot delete their LAST payout destination. If they could,
 * they would keep earning with nowhere for the money to go — and would only find
 * out when they tried to withdraw. They can always swap one for another; they
 * just cannot end up with none.
 */
export async function removeMethod(id: string, userId: string, role: string): Promise<boolean> {
  return tx(async (c) => {
    const { rows } = await c.query<MethodRow>(
      `SELECT * FROM payment_methods WHERE id = $1::uuid AND user_id = $2::uuid FOR UPDATE`,
      [id, userId],
    );
    const method = rows[0];
    if (!method) return false;

    if (needsPayoutMethod(role) && canPayOut(method.kind)) {
      const { rows: left } = await c.query<{ n: string }>(
        `SELECT count(*) AS n FROM payment_methods
          WHERE user_id = $1::uuid
            AND kind IN ('mobile_money','bank_account')
            AND id <> $2::uuid`,
        [userId, id],
      );
      if (Number(left[0].n) === 0) {
        throw new PayoutError(
          'This is the only place we can pay you. Add another payout method first, then remove this one.',
          'LAST_PAYOUT_METHOD',
        );
      }
    }

    await c.query(`DELETE FROM payment_methods WHERE id = $1::uuid`, [id]);
    return true;
  });
}

export async function setRecipientCode(id: string, code: string): Promise<void> {
  await q(`UPDATE payment_methods SET recipient_code = $2 WHERE id = $1::uuid`, [id, code]);
}

/** What the client sees. The authorization code never leaves this file. */
export function publicMethod(m: MethodRow) {
  return {
    id: m.id,
    kind: m.kind,
    label: m.label,
    isDefault: m.is_default,
    verified: m.verified,
    canPayIn: canPayIn(m.kind),
    canPayOut: canPayOut(m.kind),
    ...(m.kind === 'card' ? {
      last4: m.last4,
      brand: m.card_brand,
      expMonth: m.exp_month,
      expYear: m.exp_year,
      issuer: m.issuer,
    } : {}),
    ...(m.kind === 'mobile_money' ? {
      phone: m.momo_phone,
      network: m.momo_network,
    } : {}),
    ...(m.kind === 'bank_account' ? {
      bankName: m.bank_name,
      accountName: m.account_name,
      // Never echo the full account number back.
      accountNumberMasked: m.account_number ? `•••${m.account_number.slice(-4)}` : null,
    } : {}),
    createdAt: m.created_at,
  };
}

// ─── Payouts ─────────────────────────────────────────────────────────────────

/**
 * Request a withdrawal.
 *
 * Debits the wallet in the same transaction as the payout row, under a row lock,
 * so the same balance cannot be withdrawn twice by a double-click or two tabs.
 * Throws PAYOUT_INSUFFICIENT_FUNDS if the money isn't there.
 */
export async function requestPayout(input: {
  userId: string;
  methodId: string;
  amount: number;
  requestedBy: string;
}): Promise<PayoutRow> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PayoutError('Enter an amount to withdraw.', 'BAD_AMOUNT');
  }
  if (amount < MIN_PAYOUT_GHS) {
    throw new PayoutError(
      `The smallest withdrawal is GHS ${MIN_PAYOUT_GHS}.`, 'BELOW_MINIMUM',
    );
  }

  const method = await findMethod(input.methodId, input.userId);
  if (!method) throw new PayoutError('That payout destination is not yours.', 'NO_METHOD');
  if (!canPayOut(method.kind)) {
    throw new PayoutError(
      'Money cannot be paid out to a card. Add mobile money or a bank account.',
      'NOT_PAYABLE',
    );
  }
  if (!method.verified) {
    throw new PayoutError('Verify that destination before withdrawing to it.', 'UNVERIFIED');
  }

  const reference = payoutReference();

  try {
    const rows = await q<{ request_payout: string }>(
      `SELECT request_payout($1::uuid, $2::uuid, $3::numeric, $4, $5, $6::uuid)`,
      [input.userId, method.id, money(amount), reference, method.label, input.requestedBy],
    );
    const id = rows[0].request_payout;
    const [payout] = await q<PayoutRow>(`SELECT * FROM payouts WHERE id = $1::uuid`, [id]);
    return payout;
  } catch (err: any) {
    if (/PAYOUT_INSUFFICIENT_FUNDS/.test(err.message)) {
      throw new PayoutError(
        'You do not have that much available to withdraw.', 'INSUFFICIENT_FUNDS',
      );
    }
    throw err;
  }
}

export async function markProcessing(
  reference: string, transferCode: string, recipientCode: string,
): Promise<void> {
  await q(
    `UPDATE payouts
        SET status = 'processing', transfer_code = $2, recipient_code = $3
      WHERE reference = $1 AND status = 'pending'`,
    [reference, transferCode, recipientCode],
  );
}

/** The transfer landed. The wallet was debited at request time, so no money moves. */
export async function completePayout(reference: string, providerRef?: string): Promise<boolean> {
  const rows = await q<{ complete_payout: boolean }>(
    `SELECT complete_payout($1, $2)`, [reference, providerRef ?? null],
  );
  return rows[0].complete_payout;
}

/** The transfer failed or bounced. Give the seller their money back. */
export async function reversePayout(
  reference: string, status: 'failed' | 'reversed', reason: string,
): Promise<boolean> {
  const rows = await q<{ reverse_payout: boolean }>(
    `SELECT reverse_payout($1, $2::payout_status, $3)`,
    [reference, status, reason || 'The transfer did not complete.'],
  );
  return rows[0].reverse_payout;
}

export async function findPayout(reference: string): Promise<PayoutRow | null> {
  const rows = await q<PayoutRow>(`SELECT * FROM payouts WHERE reference = $1`, [reference]);
  return rows[0] ?? null;
}

export async function findPayoutByTransfer(transferCode: string): Promise<PayoutRow | null> {
  const rows = await q<PayoutRow>(`SELECT * FROM payouts WHERE transfer_code = $1`, [transferCode]);
  return rows[0] ?? null;
}

export async function myPayouts(userId: string, limit = 50): Promise<PayoutRow[]> {
  return q<PayoutRow>(
    `SELECT * FROM payouts WHERE user_id = $1::uuid
      ORDER BY requested_at DESC LIMIT $2`,
    [userId, limit],
  );
}

/** Finance: money that has left the wallets but not yet reached anyone. */
export async function inFlight() {
  return q<any>(`SELECT * FROM payouts_in_flight`);
}

export function publicPayout(p: PayoutRow) {
  return {
    id: p.id,
    reference: p.reference,
    amount: Number(p.amount),
    currency: p.currency,
    status: p.status,
    destination: p.destination,
    failureReason: p.failure_reason,
    requestedAt: p.requested_at,
    settledAt: p.settled_at,
  };
}
