/**
 * Payment management console — the finance/exec money view.
 *
 * Proves the overview aggregates correctly (GMV, escrow held, commission,
 * payouts in flight) and that the transaction feed reflects real payments.
 * All derived from the ledger, so it can never itself move money.
 */
import { q, closePool } from '../db/pg';
import { createUser } from '../repos/userRepo';
import * as stores from '../repos/storeRepo';
import * as products from '../repos/productRepo';
import * as orders from '../repos/orderRepo';
import * as payments from '../repos/paymentRepo';

const URL = process.env.TEST_DATABASE_URL;
const describeIfDb = URL ? describe : describe.skip;
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describeIfDb('Payment management (PostgreSQL)', () => {
  let buyerId: string, sellerId: string, storeId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    const buyer = await createUser({ fullName: 'Pay Buyer', email: `b-${uniq()}@pm.gh`, phone: '0244000901', password: 'pw', role: 'buyer', address: 'Accra' });
    const seller = await createUser({ fullName: 'Pay Seller', email: `s-${uniq()}@pm.gh`, phone: '0244000902', password: 'pw', role: 'seller', address: 'Kumasi', region: 'Ashanti' });
    buyerId = buyer.id; sellerId = seller.id;
    const store = await stores.createStore({ ownerId: sellerId, name: `PM Store ${uniq()}`, region: 'Ashanti', district: 'Kumasi Metropolitan', lat: 6.69, lng: -1.62 });
    storeId = store.id;
  });

  afterAll(async () => {
    await q(`DELETE FROM users WHERE email LIKE '%@pm.gh'`).catch(() => {});
    await closePool();
  });

  async function paidOrder(price: number, qty: number) {
    const p = await products.createProduct({ sellerId, storeId, title: `Item ${uniq()}`, description: 'x', category: 'building_materials', pricePerUnit: price, availableQuantity: qty * 5 });
    await products.approveProduct(p.id);
    const { order } = await orders.createOrder(buyerId, [{ productId: p.id, quantity: qty }], { recipientName: 'B', city: 'Accra', state: 'GA', lat: 5.6, lng: -0.2 });
    const pay = await payments.createPayment({ userId: buyerId, orderId: order.id, purpose: 'order', amount: Number(order.total_amount) });
    await payments.settlePayment(pay.reference);
    return { order, payment: pay };
  }

  test('overview aggregates GMV, commission and escrow', async () => {
    const before = await payments.paymentOverview();

    await paidOrder(100, 5);   // GHS 500
    await paidOrder(200, 1);   // GHS 200

    const after = await payments.paymentOverview();

    // GMV rose by at least 700.
    expect(after.gmv).toBeGreaterThanOrEqual(before.gmv + 700);
    // Escrow held rose (money is held until delivery).
    expect(after.escrowHeld).toBeGreaterThanOrEqual(before.escrowHeld + 700);
    // Commission was earned on settlement (5% of 700 = 35).
    expect(after.commissionEarned).toBeGreaterThan(before.commissionEarned);
    // Paid count went up by 2.
    expect(after.counts.paid).toBeGreaterThanOrEqual(before.counts.paid + 2);
  });

  test('the overview never invents money — totals are non-negative and coherent', async () => {
    const o = await payments.paymentOverview();
    expect(o.gmv).toBeGreaterThanOrEqual(0);
    expect(o.escrowHeld).toBeGreaterThanOrEqual(0);
    expect(o.commissionEarned).toBeGreaterThanOrEqual(0);
    expect(o.payouts.inFlightValue).toBeGreaterThanOrEqual(0);
    // Channel values sum to at most total_in (some payments may lack a channel).
    const channelSum = o.channels.reduce((s, c) => s + c.value, 0);
    expect(channelSum).toBeLessThanOrEqual(o.totalIn + 0.01);
  });

  test('the transaction feed lists recent payments, newest first', async () => {
    const feed = await payments.recentTransactions({ limit: 10 });
    expect(feed.length).toBeGreaterThan(0);
    expect(feed[0].amount).toBeGreaterThan(0);
    expect(['paid', 'pending', 'failed', 'refunded', 'unpaid']).toContain(feed[0].status);

    // Sorted newest-first.
    for (let i = 1; i < feed.length; i++) {
      expect(new Date(feed[i - 1].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(feed[i].createdAt).getTime());
    }

    // Filtering by status works.
    const paidOnly = await payments.recentTransactions({ status: 'paid', limit: 10 });
    expect(paidOnly.every((t) => t.status === 'paid')).toBe(true);
  });
});
