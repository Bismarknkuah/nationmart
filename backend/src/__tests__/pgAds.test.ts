/**
 * Advertising — the money guarantees.
 *
 *   • a campaign debits the wallet for its full budget at creation
 *   • you cannot create an ad you can't fund
 *   • impressions/clicks bill against the budget and stop at zero (no overspend)
 *   • cancelling refunds the unspent remainder, exactly once
 *   • the books balance throughout
 */
import { q, closePool, getBalance, postWalletTxn } from '../db/pg';
import { createUser } from '../repos/userRepo';
import * as stores from '../repos/storeRepo';
import * as products from '../repos/productRepo';
import * as ads from '../repos/adRepo';

const URL = process.env.TEST_DATABASE_URL;
const describeIfDb = URL ? describe : describe.skip;
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describeIfDb('Advertising (PostgreSQL)', () => {
  let sellerId: string, storeId: string, productId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    const seller = await createUser({ fullName: 'Ad Seller', email: `s-${uniq()}@ad.gh`, phone: '0244001001', password: 'pw', role: 'seller', address: 'Kumasi', region: 'Ashanti' });
    sellerId = seller.id;
    const store = await stores.createStore({ ownerId: sellerId, name: `Ad Store ${uniq()}`, region: 'Ashanti', district: 'Kumasi Metropolitan', lat: 6.69, lng: -1.62 });
    storeId = store.id;
    const p = await products.createProduct({ sellerId, storeId, title: `Ad Product ${uniq()}`, description: 'x', category: 'building_materials', pricePerUnit: 100, availableQuantity: 50 });
    await products.approveProduct(p.id);
    productId = p.id;
  });

  afterAll(async () => {
    await q(`DELETE FROM ad_campaigns WHERE advertiser_id IN (SELECT id FROM users WHERE email LIKE '%@ad.gh')`).catch(() => {});
    await q(`DELETE FROM users WHERE email LIKE '%@ad.gh'`).catch(() => {});
    await closePool();
  });

  async function fund(amount: number) {
    await postWalletTxn({ userId: sellerId, type: 'credit', category: 'sale_earning', amount, description: 'test', ref: `fund-${uniq()}` });
  }

  test('creating an ad debits the wallet for the full budget', async () => {
    await fund(100);
    const before = await getBalance(sellerId);

    const ad = await ads.createAd({
      advertiserId: sellerId, title: 'Promote my cement', budget: 40,
      billKind: 'per_impression', productId, storeId,
    });

    expect(ad!.budget).toBe(40);
    expect(ad!.spent).toBe(0);
    expect(ad!.status).toBe('active');
    expect(await getBalance(sellerId)).toBe(before - 40);   // budget committed
  });

  test('you cannot create an ad you cannot fund', async () => {
    const balance = await getBalance(sellerId);
    await expect(ads.createAd({
      advertiserId: sellerId, title: 'Too big', budget: balance + 1000,
      productId, storeId,
    })).rejects.toThrow(/too low|fund/i);
  });

  test('impressions bill against the budget and stop at zero — no overspend', async () => {
    await fund(10);
    const ad = await ads.createAd({
      advertiserId: sellerId, title: 'Small budget', budget: 1, unitCost: 0.5,
      billKind: 'per_impression', productId, storeId,
    });

    // 1.00 budget at 0.50 each → exactly 2 impressions should succeed.
    expect(await ads.recordImpression(ad!.id)).toBe(true);   // spent 0.50
    expect(await ads.recordImpression(ad!.id)).toBe(true);   // spent 1.00 → exhausted
    expect(await ads.recordImpression(ad!.id)).toBe(false);  // refused, no budget

    const after = await ads.findById(ad!.id);
    expect(after!.spent).toBe(1);
    expect(after!.spent).toBeLessThanOrEqual(after!.budget);   // never overspent
    expect(after!.status).toBe('exhausted');
    expect(after!.impressions).toBe(2);
  });

  test('concurrent impressions cannot push spend past budget', async () => {
    await fund(10);
    const ad = await ads.createAd({
      advertiserId: sellerId, title: 'Race', budget: 1, unitCost: 0.5,
      billKind: 'per_impression', productId, storeId,
    });

    // Fire 10 impressions at once; only 2 can be billed (budget 1.00 / 0.50).
    const results = await Promise.all(Array.from({ length: 10 }, () => ads.recordImpression(ad!.id)));
    const ok = results.filter(Boolean).length;
    expect(ok).toBe(2);

    const after = await ads.findById(ad!.id);
    expect(after!.spent).toBeLessThanOrEqual(1);   // the hard guarantee
  });

  test('clicks only bill a per_click ad', async () => {
    await fund(10);
    const ad = await ads.createAd({
      advertiserId: sellerId, title: 'Click ad', budget: 2, unitCost: 0.5,
      billKind: 'per_click', productId, storeId,
    });
    // An impression event must NOT bill a per_click ad.
    expect(await ads.recordImpression(ad!.id)).toBe(false);
    expect(await ads.recordClick(ad!.id)).toBe(true);

    const after = await ads.findById(ad!.id);
    expect(after!.clicks).toBe(1);
    expect(after!.impressions).toBe(0);
    expect(after!.spent).toBe(0.5);
  });

  test('cancelling refunds the unspent remainder, exactly once', async () => {
    await fund(50);
    const before = await getBalance(sellerId);

    const ad = await ads.createAd({
      advertiserId: sellerId, title: 'Cancel me', budget: 30, unitCost: 0.5,
      billKind: 'per_impression', productId, storeId,
    });
    expect(await getBalance(sellerId)).toBe(before - 30);

    await ads.recordImpression(ad!.id);   // spend 0.50
    const { refunded } = await ads.stopAd(ad!.id, sellerId, 'cancelled');
    expect(refunded).toBeCloseTo(29.5, 2);

    // Seller got back everything except the 0.50 actually spent.
    expect(await getBalance(sellerId)).toBeCloseTo(before - 0.5, 2);

    // A second cancel refunds nothing.
    const again = await ads.stopAd(ad!.id, sellerId, 'cancelled');
    expect(again.refunded).toBe(0);
    expect(await getBalance(sellerId)).toBeCloseTo(before - 0.5, 2);
  });

  test("you cannot stop someone else's ad", async () => {
    await fund(20);
    const ad = await ads.createAd({ advertiserId: sellerId, title: 'Mine', budget: 10, productId, storeId });
    const stranger = await createUser({ fullName: 'Stranger', email: `x-${uniq()}@ad.gh`, phone: '0244001099', password: 'pw', role: 'seller', address: 'Accra' });
    await expect(ads.stopAd(ad!.id, stranger.id, 'cancelled')).rejects.toThrow(/not yours/i);
  });

  test('serving returns active funded ads for a placement', async () => {
    await fund(20);
    await ads.createAd({
      advertiserId: sellerId, title: 'Serve me', budget: 10, placement: 'search',
      billKind: 'per_impression', productId, storeId, targetCategory: 'building_materials',
    });
    const served = await ads.serveAds({ placement: 'search', category: 'building_materials' });
    expect(served.length).toBeGreaterThan(0);
    expect(served[0].sponsored).toBe(true);
  });

  test('the books balance after all ad activity', async () => {
    expect(await q(`SELECT * FROM wallet_drift`)).toHaveLength(0);
  });
});
