/**
 * Rider batching — grouping a rider's active deliveries by destination buyer.
 *
 * The scenario that matters: one buyer orders from THREE different stores. Because
 * the platform is one-seller-per-order, that's three orders and three deliveries —
 * but they all go to the same person. riderBatches() must collapse them into a
 * single batch with three pickup points, so the rider does one run instead of
 * three scattered trips.
 */
import { q, closePool } from '../db/pg';
import { createUser } from '../repos/userRepo';
import * as stores from '../repos/storeRepo';
import * as products from '../repos/productRepo';
import * as orders from '../repos/orderRepo';
import * as payments from '../repos/paymentRepo';
import * as deliveries from '../repos/deliveryRepo';

const URL = process.env.TEST_DATABASE_URL;
const describeIfDb = URL ? describe : describe.skip;
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describeIfDb('Rider batching (PostgreSQL)', () => {
  let buyerId: string, riderId: string;
  let sellerA: string, sellerB: string, sellerC: string;
  let storeA: string, storeB: string, storeC: string;

  const buyerAddr = { recipientName: 'Ama', city: 'Afrancho', state: 'Ashanti', lat: 6.75, lng: -1.60 };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;

    const buyer = await createUser({
      fullName: 'Ama Buyer', email: `b-${uniq()}@batch.gh`, phone: '0244000701',
      password: 'pw', role: 'buyer', address: 'Afrancho', region: 'Ashanti',
    });
    buyerId = buyer.id;

    const rider = await createUser({
      fullName: 'Kojo Rider', email: `r-${uniq()}@batch.gh`, phone: '0244000702',
      password: 'pw', role: 'rider', address: 'Kumasi', region: 'Ashanti',
    });
    riderId = rider.id;

    async function makeSellerStore(name: string, lat: number, lng: number) {
      const s = await createUser({
        fullName: `${name} Seller`, email: `s-${name}-${uniq()}@batch.gh`, phone: '024400070X',
        password: 'pw', role: 'seller', address: 'Kumasi', region: 'Ashanti',
      });
      const store = await stores.createStore({
        ownerId: s.id, name: `${name} Shop ${uniq()}`,
        region: 'Ashanti', district: 'Kumasi Metropolitan', lat, lng,
      });
      return { sellerId: s.id, storeId: store.id };
    }

    // Three stores at three different locations in Kumasi.
    const a = await makeSellerStore('Kofi', 6.69, -1.62);
    const b = await makeSellerStore('Yaa', 6.71, -1.60);
    const c = await makeSellerStore('Timber', 6.66, -1.63);
    sellerA = a.sellerId; storeA = a.storeId;
    sellerB = b.sellerId; storeB = b.storeId;
    sellerC = c.sellerId; storeC = c.storeId;
  });

  afterAll(async () => {
    await q(`DELETE FROM users WHERE email LIKE '%@batch.gh'`).catch(() => {});
    await closePool();
  });

  /** A paid order from one store, with a delivery assigned to our rider. */
  async function orderWithDelivery(sellerId: string, storeId: string, price: number) {
    const p = await products.createProduct({
      sellerId, storeId, title: `Item ${uniq()}`, description: 'x',
      category: 'building_materials', pricePerUnit: price, availableQuantity: 50,
    });
    await products.approveProduct(p.id);

    const { order } = await orders.createOrder(buyerId, [{ productId: p.id, quantity: 1 }], buyerAddr);
    const payment = await payments.createPayment({
      userId: buyerId, orderId: order.id, purpose: 'order', amount: Number(order.total_amount),
    });
    await payments.settlePayment(payment.reference);

    const d = await deliveries.createForOrder({ orderId: order.id, actorId: sellerId, actorRole: 'seller' });
    await deliveries.assignRider(d.id, riderId);
    return { order, delivery: d };
  }

  test('three stores, one buyer → ONE batch with three pickups', async () => {
    await orderWithDelivery(sellerA, storeA, 100);
    await orderWithDelivery(sellerB, storeB, 200);
    await orderWithDelivery(sellerC, storeC, 150);

    const { batches, multiStoreBatches, totalParcels } = await deliveries.riderBatches(riderId);

    // All three parcels go to Ama, so they collapse into a single batch.
    const amaBatch = batches.find((b: any) => b.buyerId === buyerId);
    expect(amaBatch).toBeTruthy();
    expect(amaBatch.pickups).toHaveLength(3);
    expect(amaBatch.multiStore).toBe(true);
    expect(amaBatch.parcels).toBe(3);

    // The combined fee is the sum of the three legs.
    const legSum = amaBatch.pickups.reduce((s: number, p: any) => s + p.fee, 0);
    expect(amaBatch.totalFee).toBeCloseTo(legSum, 2);

    // Every pickup names its store, so the rider knows where to go.
    const storeNames = amaBatch.pickups.map((p: any) => p.storeName);
    expect(storeNames.every((n: string) => !!n)).toBe(true);

    // The dropoff is the buyer's single address.
    expect(amaBatch.dropoff).toBeTruthy();

    expect(multiStoreBatches).toBeGreaterThanOrEqual(1);
    expect(totalParcels).toBeGreaterThanOrEqual(3);
  });

  test('a single-store order is a batch of one, not flagged multi-store', async () => {
    // A different buyer with just one order.
    const solo = await createUser({
      fullName: 'Solo Buyer', email: `solo-${uniq()}@batch.gh`, phone: '0244000709',
      password: 'pw', role: 'buyer', address: 'Kumasi', region: 'Ashanti',
    });

    const p = await products.createProduct({
      sellerId: sellerA, storeId: storeA, title: `Solo ${uniq()}`, description: 'x',
      category: 'building_materials', pricePerUnit: 60, availableQuantity: 10,
    });
    await products.approveProduct(p.id);
    const { order } = await orders.createOrder(solo.id, [{ productId: p.id, quantity: 1 }],
      { recipientName: 'Solo', city: 'Kumasi', state: 'Ashanti', lat: 6.68, lng: -1.61 });
    const pay = await payments.createPayment({
      userId: solo.id, orderId: order.id, purpose: 'order', amount: Number(order.total_amount),
    });
    await payments.settlePayment(pay.reference);
    const d = await deliveries.createForOrder({ orderId: order.id, actorId: sellerA, actorRole: 'seller' });
    await deliveries.assignRider(d.id, riderId);

    const { batches } = await deliveries.riderBatches(riderId);
    const soloBatch = batches.find((b: any) => b.buyerId === solo.id);
    expect(soloBatch).toBeTruthy();
    expect(soloBatch.pickups).toHaveLength(1);
    expect(soloBatch.multiStore).toBe(false);
  });

  test('multi-store batches sort ahead of single-store ones', async () => {
    const { batches } = await deliveries.riderBatches(riderId);
    const firstSingle = batches.findIndex((b: any) => !b.multiStore);
    const lastMulti = batches.map((b: any) => b.multiStore).lastIndexOf(true);
    if (firstSingle !== -1 && lastMulti !== -1) {
      expect(lastMulti).toBeLessThan(firstSingle);
    }
  });

  test('delivered/failed parcels drop out of the active batch view', async () => {
    // Take one of Ama's parcels all the way to delivered.
    const { batches: before } = await deliveries.riderBatches(riderId);
    const ama = before.find((b: any) => b.buyerId === buyerId);
    const first = ama.pickups[0];

    await deliveries.setStatus(first.deliveryId, riderId, 'accepted');
    await deliveries.setStatus(first.deliveryId, riderId, 'picked_up');
    await deliveries.setStatus(first.deliveryId, riderId, 'in_transit');
    await deliveries.setStatus(first.deliveryId, riderId, 'delivered');

    const { batches: after } = await deliveries.riderBatches(riderId);
    const amaAfter = after.find((b: any) => b.buyerId === buyerId);
    // That parcel is done, so the active batch now has one fewer pickup.
    expect(amaAfter.pickups.find((p: any) => p.deliveryId === first.deliveryId)).toBeUndefined();
    expect(amaAfter.pickups.length).toBe(2);
  });
});
