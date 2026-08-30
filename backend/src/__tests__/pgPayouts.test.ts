/**
 * Payment methods & payouts — against a REAL PostgreSQL database.
 *
 * What has to hold:
 *   • a payout debits the wallet AT REQUEST TIME, so a double-tapped Withdraw
 *     cannot spend the same balance twice
 *   • a failed or reversed transfer puts the money BACK — exactly once
 *   • a seller cannot delete the only place we can pay them
 *   • we never store a card number, only Paystack's reusable code
 *   • after all of it, the books still balance
 */
import { q, closePool, getBalance, postWalletTxn } from '../db/pg';
import { createUser } from '../repos/userRepo';
import * as po from '../repos/payoutRepo';

const URL = process.env.TEST_DATABASE_URL;
const describeIfDb = URL ? describe : describe.skip;
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describeIfDb('Payment methods & payouts (PostgreSQL)', () => {
  let sellerId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    const seller = await createUser({
      fullName: 'Payout Seller', email: `s-${uniq()}@pay.gh`, phone: '0244000601',
      password: 'pw', role: 'seller', address: 'Adum', region: 'Ashanti',
    });
    sellerId = seller.id;
  });

  afterAll(async () => {
    await q(`DELETE FROM users WHERE email LIKE '%@pay.gh'`).catch(() => {});
    await closePool();
  });

  /** Put money in a wallet the honest way — through the ledger. */
  async function fund(userId: string, amount: number, ref: string) {
    await postWalletTxn({
      userId, type: 'credit', category: 'sale_earning',
      amount, description: 'Test earnings', ref,
    });
  }

  // ─── Saving methods ───────────────────────────────────────────────────────

  test('a card is saved WITHOUT the card number — only a reusable code', async () => {
    // A Paystack authorization code is an opaque token, not digits.
    const authCode = `AUTH_pk${Math.random().toString(36).slice(2, 12)}`;
    const method = await po.saveCard(sellerId, {
      authCode, last4: '4081', brand: 'visa',
      expMonth: '08', expYear: '2030', issuer: 'GCB Bank',
    });

    expect(method).toBeTruthy();
    expect(method!.kind).toBe('card');
    expect(method!.last4).toBe('4081');

    // The row must contain nothing that could rebuild a card.
    const [row] = await q<any>(`SELECT * FROM payment_methods WHERE id = $1::uuid`, [method!.id]);
    // Nothing in the row could rebuild a card: no PAN, no CVV, no account number.
    const asText = JSON.stringify(row);
    expect(asText).not.toMatch(/\b\d{13,19}\b/);      // no PAN anywhere
    expect(row.account_number).toBeNull();
    expect(row.auth_code).toBe(authCode);              // the opaque token only
    expect(Object.keys(row)).not.toContain('cvv');
    expect(Object.keys(row)).not.toContain('card_number');

    // What the client sees never includes the authorization code.
    const shown = po.publicMethod(method!);
    expect(JSON.stringify(shown)).not.toContain(method!.auth_code!);
    expect(shown.canPayIn).toBe(true);
    expect(shown.canPayOut).toBe(false);              // you cannot be PAID to a card
  });

  test('saving the same card twice does not create two rows', async () => {
    const authCode = `AUTH_${uniq()}`;
    const a = await po.saveCard(sellerId, {
      authCode, last4: '1111', brand: 'mastercard', expMonth: '01', expYear: '2029',
    });
    const b = await po.saveCard(sellerId, {
      authCode, last4: '1111', brand: 'mastercard', expMonth: '02', expYear: '2031',
    });
    expect(b!.id).toBe(a!.id);
    expect(b!.exp_year).toBe('2031');   // updated, not duplicated
  });

  test('mobile money and bank accounts save; a bad network is refused', async () => {
    const momo = await po.saveMomo(sellerId, '0244000601', 'mtn');
    expect(momo.kind).toBe('mobile_money');
    expect(po.canPayOut('mobile_money')).toBe(true);

    await expect(po.saveMomo(sellerId, '0244000601', 'orange'))
      .rejects.toThrow(/MTN, Telecel or AirtelTigo/i);

    const bank = await po.saveBankAccount(sellerId, {
      accountNumber: '1234567890', bankCode: '040100',
      bankName: 'GCB Bank', accountName: 'KOFI MENSAH',
    });
    expect(bank.account_name).toBe('KOFI MENSAH');

    // The full account number is never echoed back to the client.
    const shown = po.publicMethod(bank) as any;
    expect(shown.accountNumberMasked).toBe('•••7890');
    expect(JSON.stringify(shown)).not.toContain('1234567890');
  });

  test('a bank account cannot be saved without the bank confirming the name', async () => {
    await expect(po.saveBankAccount(sellerId, {
      accountNumber: '999', bankCode: '040100', bankName: 'GCB', accountName: '  ',
    })).rejects.toThrow(/verified with the bank/i);
  });

  test('there is exactly one default method, always', async () => {
    const methods = await po.listMethods(sellerId);
    expect(methods.length).toBeGreaterThan(1);

    const target = methods[methods.length - 1];
    await po.setDefault(target.id, sellerId);

    const after = await po.listMethods(sellerId);
    expect(after.filter((m) => m.is_default)).toHaveLength(1);
    expect(after.find((m) => m.is_default)!.id).toBe(target.id);

    // Switch it, and the old default steps down on its own.
    const other = after.find((m) => m.id !== target.id)!;
    await po.setDefault(other.id, sellerId);
    const final = await po.listMethods(sellerId);
    expect(final.filter((m) => m.is_default)).toHaveLength(1);
    expect(final.find((m) => m.is_default)!.id).toBe(other.id);
  });

  // ─── Withdrawing ──────────────────────────────────────────────────────────

  test('a payout debits the wallet at REQUEST time', async () => {
    await fund(sellerId, 1000, `fund-${uniq()}`);
    const before = await getBalance(sellerId);

    const momo = (await po.listMethods(sellerId)).find((m) => m.kind === 'mobile_money')!;
    const payout = await po.requestPayout({
      userId: sellerId, methodId: momo.id, amount: 400, requestedBy: sellerId,
    });

    expect(payout.status).toBe('pending');
    expect(Number(payout.amount)).toBe(400);

    // The money is gone from the wallet already — it is in flight, not spendable.
    expect(await getBalance(sellerId)).toBe(before - 400);
  });

  test('you cannot withdraw money you do not have', async () => {
    const balance = await getBalance(sellerId);
    const momo = (await po.listMethods(sellerId)).find((m) => m.kind === 'mobile_money')!;

    await expect(po.requestPayout({
      userId: sellerId, methodId: momo.id,
      amount: balance + 5000, requestedBy: sellerId,
    })).rejects.toThrow(/do not have that much/i);

    expect(await getBalance(sellerId)).toBe(balance);   // untouched
  });

  test('a double-tapped Withdraw cannot spend the same balance twice', async () => {
    const fresh = await createUser({
      fullName: 'Double Tap', email: `d-${uniq()}@pay.gh`, phone: '0244000602',
      password: 'pw', role: 'seller', address: 'Kumasi',
    });
    await fund(fresh.id, 100, `fund-${uniq()}`);
    const momo = await po.saveMomo(fresh.id, '0244000602', 'mtn');

    // Two clicks land at the same instant. Only one can win.
    const results = await Promise.allSettled([
      po.requestPayout({ userId: fresh.id, methodId: momo.id, amount: 100, requestedBy: fresh.id }),
      po.requestPayout({ userId: fresh.id, methodId: momo.id, amount: 100, requestedBy: fresh.id }),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);

    // GHS 100 was withdrawn, not GHS 200.
    expect(await getBalance(fresh.id)).toBe(0);
    const payouts = await po.myPayouts(fresh.id);
    expect(payouts).toHaveLength(1);
  });

  test('the minimum withdrawal is enforced', async () => {
    const momo = (await po.listMethods(sellerId)).find((m) => m.kind === 'mobile_money')!;
    await expect(po.requestPayout({
      userId: sellerId, methodId: momo.id, amount: 1, requestedBy: sellerId,
    })).rejects.toThrow(/smallest withdrawal/i);
  });

  test('money cannot be paid out to a card', async () => {
    const card = (await po.listMethods(sellerId)).find((m) => m.kind === 'card')!;
    await expect(po.requestPayout({
      userId: sellerId, methodId: card.id, amount: 50, requestedBy: sellerId,
    })).rejects.toThrow(/cannot be paid out to a card/i);
  });

  test("you cannot withdraw to someone else's account", async () => {
    const stranger = await createUser({
      fullName: 'Stranger', email: `x-${uniq()}@pay.gh`, phone: '0244000603',
      password: 'pw', role: 'seller', address: 'Accra',
    });
    const theirs = await po.saveMomo(stranger.id, '0244000603', 'mtn');

    await expect(po.requestPayout({
      userId: sellerId, methodId: theirs.id, amount: 50, requestedBy: sellerId,
    })).rejects.toThrow(/not yours/i);
  });

  // ─── When a transfer fails ────────────────────────────────────────────────

  test('a FAILED transfer puts the money back — exactly once', async () => {
    await fund(sellerId, 500, `fund-${uniq()}`);
    const before = await getBalance(sellerId);

    const momo = (await po.listMethods(sellerId)).find((m) => m.kind === 'mobile_money')!;
    const payout = await po.requestPayout({
      userId: sellerId, methodId: momo.id, amount: 300, requestedBy: sellerId,
    });
    expect(await getBalance(sellerId)).toBe(before - 300);

    // Paystack says the number is dead.
    const reversed = await po.reversePayout(payout.reference, 'failed', 'Recipient unreachable');
    expect(reversed).toBe(true);

    // The seller has their money back.
    expect(await getBalance(sellerId)).toBe(before);

    const after = await po.findPayout(payout.reference);
    expect(after!.status).toBe('failed');
    expect(after!.failure_reason).toBe('Recipient unreachable');

    // Paystack retries the webhook. The money must NOT be credited a second time.
    const again = await po.reversePayout(payout.reference, 'failed', 'Recipient unreachable');
    expect(again).toBe(false);
    expect(await getBalance(sellerId)).toBe(before);

    expect(await q(`SELECT * FROM wallet_drift`)).toHaveLength(0);
  });

  test('a REVERSED transfer (it landed, then bounced) also returns the money', async () => {
    await fund(sellerId, 200, `fund-${uniq()}`);
    const before = await getBalance(sellerId);

    const momo = (await po.listMethods(sellerId)).find((m) => m.kind === 'mobile_money')!;
    const payout = await po.requestPayout({
      userId: sellerId, methodId: momo.id, amount: 200, requestedBy: sellerId,
    });

    await po.reversePayout(payout.reference, 'reversed', 'Bounced back from the network');
    expect(await getBalance(sellerId)).toBe(before);
    expect((await po.findPayout(payout.reference))!.status).toBe('reversed');
  });

  test('a SUCCESSFUL transfer moves no further money — it was debited already', async () => {
    await fund(sellerId, 250, `fund-${uniq()}`);
    const momo = (await po.listMethods(sellerId)).find((m) => m.kind === 'mobile_money')!;

    const payout = await po.requestPayout({
      userId: sellerId, methodId: momo.id, amount: 250, requestedBy: sellerId,
    });
    const afterDebit = await getBalance(sellerId);

    await po.markProcessing(payout.reference, `TRF_${uniq()}`, `RCP_${uniq()}`);

    const done = await po.completePayout(payout.reference, 'provider-123');
    expect(done).toBe(true);
    expect(await getBalance(sellerId)).toBe(afterDebit);   // no second deduction

    const row = await po.findPayout(payout.reference);
    expect(row!.status).toBe('paid');
    expect(row!.settled_at).toBeTruthy();

    // A duplicate success webhook changes nothing.
    expect(await po.completePayout(payout.reference, 'provider-123')).toBe(false);

    // And a late 'failed' cannot claw back money that already landed.
    expect(await po.reversePayout(payout.reference, 'failed', 'too late')).toBe(false);
    expect(await getBalance(sellerId)).toBe(afterDebit);
  });

  // ─── The seller always has somewhere to be paid ───────────────────────────

  test('a seller cannot delete the only place we can pay them', async () => {
    const solo = await createUser({
      fullName: 'Solo Seller', email: `solo-${uniq()}@pay.gh`, phone: '0244000604',
      password: 'pw', role: 'seller', address: 'Tamale',
    });

    expect(await po.hasPayoutMethod(solo.id)).toBe(false);
    const momo = await po.saveMomo(solo.id, '0244000604', 'mtn');
    expect(await po.hasPayoutMethod(solo.id)).toBe(true);

    // It is their only one — removing it would leave them earning with nowhere
    // for the money to go.
    await expect(po.removeMethod(momo.id, solo.id, 'seller'))
      .rejects.toThrow(/only place we can pay you/i);

    // Add a second, and now the first can go.
    const bank = await po.saveBankAccount(solo.id, {
      accountNumber: '5555555555', bankCode: '130100',
      bankName: 'Ecobank', accountName: 'SOLO SELLER',
    });
    expect(await po.removeMethod(momo.id, solo.id, 'seller')).toBe(true);
    expect(await po.hasPayoutMethod(solo.id)).toBe(true);

    // But now the bank account is the last one, so IT is protected.
    await expect(po.removeMethod(bank.id, solo.id, 'seller'))
      .rejects.toThrow(/only place we can pay you/i);
  });

  test('a buyer has no payout requirement — they are not owed anything', async () => {
    const buyer = await createUser({
      fullName: 'Just Buying', email: `b-${uniq()}@pay.gh`, phone: '0244000605',
      password: 'pw', role: 'buyer', address: 'Accra',
    });
    expect(po.needsPayoutMethod('buyer')).toBe(false);
    expect(po.needsPayoutMethod('seller')).toBe(true);
    expect(po.needsPayoutMethod('rider')).toBe(true);

    // A buyer can save a card and delete it freely — nobody owes them money.
    const card = await po.saveCard(buyer.id, {
      authCode: `AUTH_${uniq()}`, last4: '0002', brand: 'visa',
      expMonth: '12', expYear: '2028',
    });
    expect(await po.removeMethod(card!.id, buyer.id, 'buyer')).toBe(true);
  });

  test('the books balance after every payout in this suite', async () => {
    expect(await q(`SELECT * FROM wallet_drift`)).toHaveLength(0);
  });
});
