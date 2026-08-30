/**
 * Promotions management — the exec/admin console over promo codes.
 *
 * The atomic claim logic is already covered elsewhere; this proves the
 * management view: overview counts, live-vs-expired classification, usage
 * percentage, and the activate/deactivate lifecycle.
 */
import { q, closePool } from '../db/pg';
import { promos } from '../repos/platformRepo';

const URL = process.env.TEST_DATABASE_URL;
const describeIfDb = URL ? describe : describe.skip;
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describeIfDb('Promotions management (PostgreSQL)', () => {
  beforeAll(() => { process.env.DATABASE_URL = URL; });
  afterAll(async () => {
    await q(`DELETE FROM promo_codes WHERE code LIKE 'TEST%'`).catch(() => {});
    await closePool();
  });

  test('a platform-wide percentage promo shows up as live', async () => {
    const code = `TEST${uniq()}`.slice(0, 20).toUpperCase();
    await promos.create({ code, discountPercent: 10, minOrder: 50, maxUses: 100 });

    const { promos: list, summary } = await promos.overview({ platformOnly: true });
    const mine = list.find((p) => p.code === code);
    expect(mine).toBeTruthy();
    expect(mine!.scope).toBe('platform');
    expect(mine!.discount).toBe('10%');
    expect(mine!.isLive).toBe(true);
    expect(mine!.usagePercent).toBe(0);
    expect(summary.live).toBeGreaterThanOrEqual(1);
  });

  test('usage percent tracks redemptions', async () => {
    const code = `TEST${uniq()}`.slice(0, 20).toUpperCase();
    await promos.create({ code, discountAmount: 20, minOrder: 0, maxUses: 4 });

    await promos.claim(code, 100);   // 1 of 4
    await promos.claim(code, 100);   // 2 of 4

    const { promos: list } = await promos.overview({ platformOnly: true });
    const mine = list.find((p) => p.code === code);
    expect(mine!.usedCount).toBe(2);
    expect(mine!.usagePercent).toBe(50);
    expect(mine!.discountAmount).toBe(20);
  });

  test('a maxed-out promo is no longer live', async () => {
    const code = `TEST${uniq()}`.slice(0, 20).toUpperCase();
    await promos.create({ code, discountPercent: 5, minOrder: 0, maxUses: 1 });
    await promos.claim(code, 100);   // exhausts it

    const { promos: list } = await promos.overview({ platformOnly: true });
    const mine = list.find((p) => p.code === code);
    expect(mine!.usedCount).toBe(1);
    expect(mine!.isLive).toBe(false);   // maxed out
  });

  test('deactivate and reactivate flip the live flag', async () => {
    const code = `TEST${uniq()}`.slice(0, 20).toUpperCase();
    await promos.create({ code, discountPercent: 15, minOrder: 0, maxUses: 50 });

    await promos.setActive(code, false);
    let list = (await promos.overview({ platformOnly: true })).promos;
    expect(list.find((p) => p.code === code)!.isLive).toBe(false);

    await promos.setActive(code, true);
    list = (await promos.overview({ platformOnly: true })).promos;
    expect(list.find((p) => p.code === code)!.isLive).toBe(true);
  });

  test('a deactivated promo cannot be claimed', async () => {
    const code = `TEST${uniq()}`.slice(0, 20).toUpperCase();
    await promos.create({ code, discountPercent: 15, minOrder: 0, maxUses: 50 });
    await promos.setActive(code, false);

    // claim_promo returns 0 (or throws) for an inactive code — either way, no discount.
    let discount = 0;
    try { discount = await promos.claim(code, 200); } catch { discount = 0; }
    expect(discount).toBe(0);
  });
});
