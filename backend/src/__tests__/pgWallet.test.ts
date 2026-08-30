/**
 * Wallet ledger tests — run against a REAL PostgreSQL database.
 *
 * These exist because a ledger that is only "probably" correct is worthless.
 * The concurrency test in particular guards the exact bug that would silently
 * corrupt balances under load.
 *
 * Skipped automatically when TEST_DATABASE_URL is not set, so the normal test
 * suite still runs without a database.
 */
import { Pool } from 'pg';
import {
  setPool, closePool, q, postWalletTxn, postWalletTxnOnce,
  getBalance, getWallet, findWalletDrift, walletOverview, money,
} from '../db/pg';

const URL = process.env.TEST_DATABASE_URL;
const describeIfDb = URL ? describe : describe.skip;

describeIfDb('PostgreSQL wallet ledger', () => {
  let riderId: string;

  beforeAll(async () => {
    setPool(new Pool({ connectionString: URL }));
    // Fresh rider for each run.
    const [u] = await q<{ id: string }>(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Test Rider', $1, 'x', 'rider') RETURNING id`,
      [`rider-${Date.now()}-${Math.random().toString(36).slice(2)}@test.gh`],
    );
    riderId = u.id;
  });

  afterAll(async () => {
    await q(`DELETE FROM users WHERE email LIKE 'rider-%@test.gh'`).catch(() => {});
    await closePool();
  });

  test('money() never produces float drift', () => {
    expect(money(0.1 + 0.2)).toBe('0.30');   // the classic float trap
    expect(money(45.555)).toBe('45.56');     // halfway rounds UP, not down
    expect(money(1.005)).toBe('1.01');       // toFixed() gets this wrong
    expect(money(-2.345)).toBe('-2.35');     // sign handled symmetrically
    expect(money('12')).toBe('12.00');
    expect(() => money(NaN)).toThrow();
  });

  test('credit and debit move the balance and write the ledger together', async () => {
    const afterCredit = await postWalletTxn({
      userId: riderId, type: 'credit', category: 'delivery_earning',
      amount: 45.5, description: 'Delivery NM-001',
    });
    expect(afterCredit).toBe(45.5);

    const afterDebit = await postWalletTxn({
      userId: riderId, type: 'debit', category: 'commission',
      amount: 4.55, description: '10% commission',
    });
    expect(afterDebit).toBe(40.95);

    const { wallet, transactions } = await getWallet(riderId);
    expect(wallet.balance).toBe(40.95);
    expect(wallet.totalEarned).toBe(45.5);
    expect(wallet.totalCommission).toBe(4.55);
    expect(transactions).toHaveLength(2);
  });

  test('rejects zero and negative amounts', async () => {
    await expect(postWalletTxn({
      userId: riderId, type: 'credit', category: 'settlement', amount: 0,
    })).rejects.toThrow();

    await expect(postWalletTxn({
      userId: riderId, type: 'credit', category: 'settlement', amount: -10,
    })).rejects.toThrow();
  });

  test('a duplicated payment webhook cannot credit twice', async () => {
    const ref = `PAY-${Date.now()}`;
    const before = await getBalance(riderId);

    const first = await postWalletTxnOnce({
      userId: riderId, type: 'credit', category: 'settlement',
      amount: 100, description: 'MoMo top-up', ref,
    });
    expect(first.applied).toBe(true);
    expect(first.balance).toBe(before + 100);

    // Paystack retries the same webhook.
    const second = await postWalletTxnOnce({
      userId: riderId, type: 'credit', category: 'settlement',
      amount: 100, description: 'MoMo top-up (duplicate)', ref,
    });
    expect(second.applied).toBe(false);          // ignored
    expect(second.balance).toBe(before + 100);   // NOT +200

    expect(await getBalance(riderId)).toBe(before + 100);
  });

  test('concurrent settlements never corrupt the balance', async () => {
    const before = await getBalance(riderId);

    // 20 deliveries completing at the same instant, each owing GHS 1 commission.
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        postWalletTxn({
          userId: riderId, type: 'debit', category: 'commission',
          amount: 1, description: `concurrent commission ${i}`,
        }),
      ),
    );

    // Exact arithmetic, not "close enough".
    // NB: compare through money(), because `before - 20` in raw JS floats can
    // yield 120.94999999999999 — the very bug Postgres NUMERIC exists to avoid.
    expect(money(await getBalance(riderId))).toBe(money(before - 20));
  });

  test('the books always balance (zero drift)', async () => {
    const drift = await findWalletDrift();
    expect(drift).toHaveLength(0);
  });

  test('finance overview separates who is owed from who owes', async () => {
    const { owed, owing } = await walletOverview();
    const balance = await getBalance(riderId);
    const inOwed = owed.some((w) => w.userId === riderId);
    const inOwing = owing.some((w) => w.userId === riderId);
    if (balance > 0) { expect(inOwed).toBe(true); expect(inOwing).toBe(false); }
    if (balance < 0) { expect(inOwing).toBe(true); expect(inOwed).toBe(false); }
  });
});
