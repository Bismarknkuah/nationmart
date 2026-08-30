/**
 * The money path — orders → payments → deliveries, against a REAL PostgreSQL.
 *
 * These are the tests that protect actual cedis. The headline ones:
 *   • a failed checkout rolls back EVERY stock reservation (no phantom orders)
 *   • a duplicated Paystack webhook cannot pay the seller twice
 *   • delivery releases escrow AND charges rider commission atomically
 */
import { q, closePool, getBalance } from '../db/pg';
import { createUser } from '../repos/userRepo';
import * as stores from '../repos/storeRepo';
import * as products from '../repos/productRepo';
import * as orders from '../repos/orderRepo';
import * as payments from '../repos/paymentRepo';
import * as deliveries from '../repos/deliveryRepo';

const URL = process.env.TEST_DATABASE_URL;
const describeIfDb = URL ? describe : describe.skip;
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describeIfDb('Money path (PostgreSQL)', () => {
  let sellerId: string, buyerId: string, riderId: string, storeId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;

    const seller = await createUser({
      fullName: 'Kofi Seller', email: `s-${uniq()}@money.gh`, phone: '0244000201',
      password: 'pw', role: 'seller', address: 'Adum', region: 'Ashanti',
    });
    sellerId = seller.id;

    const buyer = await createUser({
      fullName: 'Efua Buyer', email: `b-${uniq()}@money.gh`, phone: '0244000202',
      password: 'pw', role: 'buyer', address: 'Afrancho', region: 'Ashanti',
    });
    buyerId = buyer.id;

    const rider = await createUser({
      fullName: 'Kojo Rider', email: `r-${uniq()}@money.gh`, phone: '0244000203',
      password: 'pw', role: 'rider', address: 'Asokwa', region: 'Ashanti',
    });
    riderId = rider.id;

    const store = await stores.createStore({
      ownerId: sellerId, name: `Money Store ${uniq()}`,
      region: 'Ashanti', district: 'Kumasi Metropolitan',
      lat: 6.6885, lng: -1.6244,     // Kumasi
    });
    storeId = store.id;
  });

  afterAll(async () => {
    await q(`DELETE FROM users WHERE email LIKE '%@money.gh'`).catch(() => {});
    await closePool();
  });

  async function liveProduct(price: number, stock: number, title = 'Cement') {
    const p = await products.createProduct({
      sellerId, storeId, title: `${title} ${uniq()}`,
      description: 'Building material', category: 'building_materials',
      pricePerUnit: price, availableQuantity: stock,
      region: 'Ashanti', district: 'Kumasi Metropolitan',
    });
    await products.approveProduct(p.id);
    return p;
  }

  const address = {
    recipientName: 'Efua', phone: '0244000202', street: 'Afrancho Rd',
    city: 'Afrancho', state: 'Ashanti', lat: 6.7500, lng: -1.6000,
  };

  // ─── Checkout ─────────────────────────────────────────────────────────────

  test('checkout reserves stock and writes the order together', async () => {
    const p = await liveProduct(75, 100);

    const { order, items } = await orders.createOrder(
      buyerId, [{ productId: p.id, quantity: 20 }], address);

    expect(order.order_number).toMatch(/^NM-ORD-/);
    expect(Number(order.total_amount)).toBe(1500);      // 20 × 75
    expect(order.payment_status).toBe('unpaid');
    expect(items).toHaveLength(1);

    const after = await products.findById(p.id);
    expect(Number(after!.available_quantity)).toBe(80); // stock taken
  });

  test('a failed line rolls back EVERY reservation in the order', async () => {
    const plenty = await liveProduct(50, 100, 'Plenty');
    const scarce = await liveProduct(50, 2, 'Scarce');

    // The first line is fine; the second asks for more than exists.
    await expect(orders.createOrder(buyerId, [
      { productId: plenty.id, quantity: 10 },
      { productId: scarce.id, quantity: 50 },
    ], address)).rejects.toThrow();

    // The first line's stock must NOT have been quietly taken.
    const p = await products.findById(plenty.id);
    const s = await products.findById(scarce.id);
    expect(Number(p!.available_quantity)).toBe(100);   // untouched
    expect(Number(s!.available_quantity)).toBe(2);     // untouched

    // And no phantom order was left behind.
    const stray = await q(
      `SELECT 1 FROM order_items WHERE product_id = $1::uuid`, [plenty.id]);
    expect(stray).toHaveLength(0);
  });

  test('rejects items from two different sellers', async () => {
    const mine = await liveProduct(20, 50, 'Mine');
    const other = await createUser({
      fullName: 'Other Seller', email: `o-${uniq()}@money.gh`, phone: '0244000299',
      password: 'pw', role: 'seller', address: 'Accra',
    });
    const theirStore = await stores.createStore({ ownerId: other.id, name: `Other ${uniq()}` });
    const theirs = await products.createProduct({
      sellerId: other.id, storeId: theirStore.id, title: `Theirs ${uniq()}`,
      description: 'x', pricePerUnit: 30, availableQuantity: 10,
    });
    await products.approveProduct(theirs.id);

    await expect(orders.createOrder(buyerId, [
      { productId: mine.id, quantity: 1 },
      { productId: theirs.id, quantity: 1 },
    ], address)).rejects.toThrow(/same seller/i);
  });

  test('cancelling an unpaid order puts the stock back', async () => {
    const p = await liveProduct(40, 30, 'Cancellable');
    const { order } = await orders.createOrder(buyerId, [{ productId: p.id, quantity: 10 }], address);

    expect(Number((await products.findById(p.id))!.available_quantity)).toBe(20);

    await orders.cancelOrder(order.id, buyerId);

    expect(Number((await products.findById(p.id))!.available_quantity)).toBe(30);  // restored
    expect((await orders.findById(order.id))!.status).toBe('cancelled');
  });

  // ─── Payment ──────────────────────────────────────────────────────────────

  test('settlement credits the seller net of commission and holds escrow', async () => {
    const p = await liveProduct(100, 50, 'Payable');
    const { order } = await orders.createOrder(buyerId, [{ productId: p.id, quantity: 10 }], address);
    // 10 × 100 = GHS 1000

    const before = await getBalance(sellerId);
    const payment = await payments.createPayment({
      userId: buyerId, orderId: order.id, purpose: 'order',
      amount: Number(order.total_amount), channel: 'momo',
    });

    const result = await payments.settlePayment(payment.reference, 'paystack_ref_1');

    expect(result!.alreadySettled).toBe(false);
    expect(result!.commission).toBe(50);        // 5% of 1000
    expect(result!.sellerCredited).toBe(950);   // net

    // Seller's ledger moved by exactly the net amount (+950 credit, −50 commission).
    expect(await getBalance(sellerId)).toBe(before + 950 - 50);

    const settled = await payments.findByReference(payment.reference);
    expect(settled!.status).toBe('paid');
    expect(settled!.escrow_state).toBe('held');   // buyer protected until delivery

    const paidOrder = await orders.findById(order.id);
    expect(paidOrder!.payment_status).toBe('paid');
    expect(paidOrder!.status).toBe('confirmed');
  });

  test('a duplicated Paystack webhook cannot pay the seller twice', async () => {
    const p = await liveProduct(200, 20, 'Duplicated');
    const { order } = await orders.createOrder(buyerId, [{ productId: p.id, quantity: 5 }], address);
    // 5 × 200 = GHS 1000

    const payment = await payments.createPayment({
      userId: buyerId, orderId: order.id, purpose: 'order', amount: 1000,
    });

    const before = await getBalance(sellerId);
    const first = await payments.settlePayment(payment.reference);
    const afterFirst = await getBalance(sellerId);

    expect(first!.alreadySettled).toBe(false);
    expect(afterFirst).toBe(before + 950 - 50);

    // Paystack retries the very same webhook.
    const second = await payments.settlePayment(payment.reference);
    expect(second!.alreadySettled).toBe(true);        // recognised, ignored
    expect(second!.sellerCredited).toBe(0);

    // The balance did NOT move again.
    expect(await getBalance(sellerId)).toBe(afterFirst);
  });

  test('a wallet top-up credits the rider', async () => {
    const before = await getBalance(riderId);
    const topup = await payments.createPayment({
      userId: riderId, purpose: 'wallet_topup', amount: 50, channel: 'momo',
    });

    await payments.settlePayment(topup.reference);
    expect(await getBalance(riderId)).toBe(before + 50);

    // Retried webhook must not credit twice.
    await payments.settlePayment(topup.reference);
    expect(await getBalance(riderId)).toBe(before + 50);
  });

  // ─── Delivery fees ────────────────────────────────────────────────────────

  test('rider fees: GHS 7/km, floor 20, cap 100', () => {
    expect(deliveries.deliveryQuote(1, 'rider').fee).toBe(20);     // floor
    expect(deliveries.deliveryQuote(5, 'rider').fee).toBe(35);     // 5 × 7
    expect(deliveries.deliveryQuote(10, 'rider').fee).toBe(70);
    expect(deliveries.deliveryQuote(50, 'rider').fee).toBe(100);   // capped
  });

  test('driver fees: GHS 15/km + GHS 2/kg, floor 30, NO cap', () => {
    expect(deliveries.deliveryQuote(1, 'driver', 0).fee).toBe(30);    // floor
    expect(deliveries.deliveryQuote(10, 'driver', 0).fee).toBe(150);  // 10 × 15
    expect(deliveries.deliveryQuote(10, 'driver', 100).fee).toBe(350); // + 100kg × 2

    // A heavy long haul is deliberately uncapped.
    const heavy = deliveries.deliveryQuote(40, 'driver', 500);
    expect(heavy.fee).toBe(40 * 15 + 500 * 2);   // 1600
    expect(heavy.fee).toBeGreaterThan(100);
  });

  // ─── Delivery lifecycle ───────────────────────────────────────────────────

  test('delivery releases escrow and charges rider commission atomically', async () => {
    const p = await liveProduct(100, 50, 'Deliverable');
    const { order } = await orders.createOrder(buyerId, [{ productId: p.id, quantity: 5 }], address);
    const payment = await payments.createPayment({
      userId: buyerId, orderId: order.id, purpose: 'order', amount: 500,
    });
    await payments.settlePayment(payment.reference);

    const d = await deliveries.createForOrder({
      orderId: order.id, vehicleType: 'rider', actorId: sellerId, actorRole: 'seller',
    });
    expect(d.status).toBe('pending_assignment');
    expect(Number(d.fee)).toBeGreaterThanOrEqual(20);   // at least the floor

    await deliveries.assignRider(d.id, riderId);
    await deliveries.setStatus(d.id, riderId, 'accepted');
    await deliveries.setStatus(d.id, riderId, 'picked_up');
    await deliveries.setStatus(d.id, riderId, 'in_transit');

    // Escrow is still held right up until the goods land.
    let pay = await payments.findByReference(payment.reference);
    expect(pay!.escrow_state).toBe('held');

    const riderBefore = await getBalance(riderId);
    const done = await deliveries.setStatus(d.id, riderId, 'delivered');

    expect(done.status).toBe('delivered');
    expect(done.delivered_at).toBeTruthy();

    // Escrow released to the seller…
    pay = await payments.findByReference(payment.reference);
    expect(pay!.escrow_state).toBe('released');
    expect((await orders.findById(order.id))!.status).toBe('delivered');

    // …and the rider's 10% commission charged, in the same transaction.
    const fee = Number(done.fee);
    const commission = Math.round(fee * 0.10 * 100) / 100;
    expect(await getBalance(riderId)).toBe(riderBefore - commission);
  });

  test('a failed delivery demands a reason and returns the stock', async () => {
    const p = await liveProduct(60, 20, 'Failing');
    const { order } = await orders.createOrder(buyerId, [{ productId: p.id, quantity: 5 }], address);
    expect(Number((await products.findById(p.id))!.available_quantity)).toBe(15);

    const d = await deliveries.createForOrder({
      orderId: order.id, actorId: sellerId, actorRole: 'seller',
    });
    await deliveries.assignRider(d.id, riderId);
    await deliveries.setStatus(d.id, riderId, 'accepted');

    // No reason → refused.
    await expect(
      deliveries.setStatus(d.id, riderId, 'failed'),
    ).rejects.toThrow(/why the delivery failed/i);

    const failed = await deliveries.setStatus(
      d.id, riderId, 'failed', 'Customer unreachable after 3 calls');

    expect(failed.status).toBe('failed');
    expect(failed.failure_reason).toBe('Customer unreachable after 3 calls');

    // The goods never left — stock goes back on the shelf.
    expect(Number((await products.findById(p.id))!.available_quantity)).toBe(20);
  });

  test('a rider cannot touch a job that is not theirs', async () => {
    const p = await liveProduct(10, 10, 'NotYours');
    const { order } = await orders.createOrder(buyerId, [{ productId: p.id, quantity: 1 }], address);
    const d = await deliveries.createForOrder({
      orderId: order.id, actorId: sellerId, actorRole: 'seller',
    });
    await deliveries.assignRider(d.id, riderId);

    const stranger = await createUser({
      fullName: 'Stranger', email: `x-${uniq()}@money.gh`, phone: '0244000288',
      password: 'pw', role: 'rider', address: 'Accra',
    });

    await expect(
      deliveries.setStatus(d.id, stranger.id, 'accepted'),
    ).rejects.toThrow(/not yours/i);
  });

  test('delivery statuses cannot be skipped', async () => {
    const p = await liveProduct(10, 10, 'Ladder');
    const { order } = await orders.createOrder(buyerId, [{ productId: p.id, quantity: 1 }], address);
    const d = await deliveries.createForOrder({
      orderId: order.id, actorId: sellerId, actorRole: 'seller',
    });
    await deliveries.assignRider(d.id, riderId);

    // assigned → delivered is not a legal jump; the goods must be collected first.
    await expect(
      deliveries.setStatus(d.id, riderId, 'delivered'),
    ).rejects.toThrow(/cannot go from/i);
  });

  test('one order cannot spawn two deliveries', async () => {
    const p = await liveProduct(10, 10, 'Single');
    const { order } = await orders.createOrder(buyerId, [{ productId: p.id, quantity: 1 }], address);

    await deliveries.createForOrder({ orderId: order.id, actorId: sellerId, actorRole: 'seller' });
    await expect(
      deliveries.createForOrder({ orderId: order.id, actorId: sellerId, actorRole: 'seller' }),
    ).rejects.toThrow(/already exists/i);
  });

  test('the books balance after every transaction', async () => {
    const drift = await q(`SELECT * FROM wallet_drift`);
    expect(drift).toHaveLength(0);
  });
});
