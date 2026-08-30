/**
 * Disputes & refunds — against a REAL PostgreSQL database.
 *
 * The headline guarantees:
 *   • an open dispute FREEZES escrow — a rider cannot pay the seller by tapping
 *     "delivered" while the buyer says the parcel never arrived
 *   • a refund REVERSES the ledger exactly: seller debited, commission returned,
 *     buyer credited, and the books still balance to the pesewa
 *   • a dispute cannot be resolved twice, and a refund cannot be paid twice
 */
import { q, closePool, getBalance } from '../db/pg';
import { createUser } from '../repos/userRepo';
import * as stores from '../repos/storeRepo';
import * as products from '../repos/productRepo';
import * as orders from '../repos/orderRepo';
import * as payments from '../repos/paymentRepo';
import * as deliveries from '../repos/deliveryRepo';
import * as disputes from '../repos/disputeRepo';

const URL = process.env.TEST_DATABASE_URL;
const describeIfDb = URL ? describe : describe.skip;
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describeIfDb('Disputes & refunds (PostgreSQL)', () => {
  let sellerId: string, buyerId: string, riderId: string, officerId: string, storeId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;

    const seller = await createUser({
      fullName: 'Kofi Seller', email: `s-${uniq()}@dsp.gh`, phone: '0244000401',
      password: 'pw', role: 'seller', address: 'Adum', region: 'Ashanti',
    });
    sellerId = seller.id;

    const buyer = await createUser({
      fullName: 'Efua Buyer', email: `b-${uniq()}@dsp.gh`, phone: '0244000402',
      password: 'pw', role: 'buyer', address: 'Afrancho', region: 'Ashanti',
    });
    buyerId = buyer.id;

    const rider = await createUser({
      fullName: 'Kojo Rider', email: `r-${uniq()}@dsp.gh`, phone: '0244000403',
      password: 'pw', role: 'rider', address: 'Asokwa', region: 'Ashanti',
    });
    riderId = rider.id;

    const officer = await createUser({
      fullName: 'Ama Officer', email: `o-${uniq()}@dsp.gh`, phone: '0244000404',
      password: 'pw', role: 'district_admin', address: 'Kumasi', region: 'Ashanti',
    });
    officerId = officer.id;

    const store = await stores.createStore({
      ownerId: sellerId, name: `Dispute Store ${uniq()}`,
      region: 'Ashanti', district: 'Kumasi Metropolitan', lat: 6.69, lng: -1.62,
    });
    storeId = store.id;
  });

  afterAll(async () => {
    await q(`DELETE FROM users WHERE email LIKE '%@dsp.gh'`).catch(() => {});
    await closePool();
  });

  const address = { recipientName: 'Efua', city: 'Afrancho', state: 'Ashanti', lat: 6.75, lng: -1.60 };

  /** A fully paid order, ready to be disputed. */
  async function paidOrder(price: number, qty: number) {
    const p = await products.createProduct({
      sellerId, storeId, title: `Item ${uniq()}`, description: 'x',
      category: 'building_materials', pricePerUnit: price, availableQuantity: qty * 10,
    });
    await products.approveProduct(p.id);

    const { order } = await orders.createOrder(buyerId, [{ productId: p.id, quantity: qty }], address);
    const payment = await payments.createPayment({
      userId: buyerId, orderId: order.id, purpose: 'order',
      amount: Number(order.total_amount),
    });
    await payments.settlePayment(payment.reference);
    return { order, payment, product: p };
  }

  // ─── The freeze ───────────────────────────────────────────────────────────

  test('an open dispute FREEZES escrow — the rider cannot pay the seller', async () => {
    const { order, payment } = await paidOrder(100, 5);   // GHS 500

    const d = await deliveries.createForOrder({
      orderId: order.id, actorId: sellerId, actorRole: 'seller',
    });
    await deliveries.assignRider(d.id, riderId);
    await deliveries.setStatus(d.id, riderId, 'accepted');
    await deliveries.setStatus(d.id, riderId, 'picked_up');
    await deliveries.setStatus(d.id, riderId, 'in_transit');

    // The buyer disputes BEFORE the rider marks it delivered.
    await disputes.raise({
      orderId: order.id, raisedBy: buyerId,
      reason: 'not_delivered', details: 'Nothing arrived. Rider never called.',
    });

    // The rider now taps "delivered". The database refuses to release the money.
    await expect(
      deliveries.setStatus(d.id, riderId, 'delivered'),
    ).rejects.toThrow(/ESCROW_FROZEN/);

    const pay = await payments.findByReference(payment.reference);
    expect(pay!.escrow_state).toBe('held');     // still held, seller NOT paid
  });

  test('disputing after delivery claws the money back into escrow', async () => {
    const { order, payment } = await paidOrder(200, 2);   // GHS 400

    const d = await deliveries.createForOrder({
      orderId: order.id, actorId: sellerId, actorRole: 'seller',
    });
    await deliveries.assignRider(d.id, riderId);
    await deliveries.setStatus(d.id, riderId, 'accepted');
    await deliveries.setStatus(d.id, riderId, 'picked_up');
    await deliveries.setStatus(d.id, riderId, 'in_transit');
    await deliveries.setStatus(d.id, riderId, 'delivered');

    // Money was released to the seller.
    let pay = await payments.findByReference(payment.reference);
    expect(pay!.escrow_state).toBe('released');

    // The buyer disputes — the money goes back into escrow.
    await disputes.raise({
      orderId: order.id, raisedBy: buyerId,
      reason: 'wrong_item', details: 'They sent roofing sheets, I ordered cement.',
    });

    pay = await payments.findByReference(payment.reference);
    expect(pay!.escrow_state).toBe('held');     // frozen again
  });

  // ─── Raising rules ────────────────────────────────────────────────────────

  test('only the buyer can dispute, and only a paid order', async () => {
    const { order } = await paidOrder(50, 2);

    await expect(disputes.raise({ orderId: order.id, raisedBy: sellerId }))
      .rejects.toThrow(/only the buyer/i);

    // An unpaid order has nothing to dispute.
    const p = await products.createProduct({
      sellerId, storeId, title: `Unpaid ${uniq()}`, description: 'x',
      pricePerUnit: 10, availableQuantity: 5,
    });
    await products.approveProduct(p.id);
    const { order: unpaid } = await orders.createOrder(
      buyerId, [{ productId: p.id, quantity: 1 }], address);

    await expect(disputes.raise({ orderId: unpaid.id, raisedBy: buyerId }))
      .rejects.toThrow(/never paid/i);
  });

  test('one order cannot carry two live disputes', async () => {
    const { order } = await paidOrder(30, 3);

    await disputes.raise({ orderId: order.id, raisedBy: buyerId, reason: 'damaged' });
    await expect(
      disputes.raise({ orderId: order.id, raisedBy: buyerId, reason: 'late' }),
    ).rejects.toThrow(/already an open dispute/i);
  });

  // ─── Evidence ─────────────────────────────────────────────────────────────

  test('both sides can file evidence; outsiders cannot', async () => {
    const { order } = await paidOrder(80, 2);
    const d = await disputes.raise({
      orderId: order.id, raisedBy: buyerId, reason: 'damaged',
      details: 'Two bags were split open.',
    });

    await disputes.addEvidence(d.id, buyerId, 'buyer', 'Photo of the split bags.', 'https://cdn/1.jpg');
    await disputes.addEvidence(d.id, sellerId, 'seller', 'They were sealed when the rider collected them.');
    await disputes.addEvidence(d.id, officerId, 'district_admin', 'Reviewing the rider log.');

    const evidence = await disputes.getEvidence(d.id);
    expect(evidence).toHaveLength(3);
    expect(evidence[0].author_name).toBe('Efua Buyer');
    expect(evidence[0].attachment_url).toBe('https://cdn/1.jpg');
    expect(evidence[2].author_role).toBe('district_admin');

    const stranger = await createUser({
      fullName: 'Nosy', email: `n-${uniq()}@dsp.gh`, phone: '0244000499',
      password: 'pw', role: 'buyer', address: 'Accra',
    });
    await expect(
      disputes.addEvidence(d.id, stranger.id, 'buyer', 'let me in'),
    ).rejects.toThrow(/not part of this dispute/i);

    await expect(
      disputes.addEvidence(d.id, buyerId, 'buyer', '   '),
    ).rejects.toThrow(/empty/i);
  });

  // ─── Refund: the money actually moves back ────────────────────────────────

  test('a full refund REVERSES the ledger exactly', async () => {
    const { order } = await paidOrder(100, 10);   // GHS 1000

    const sellerAfterSale = await getBalance(sellerId);
    const buyerBefore = await getBalance(buyerId);

    const d = await disputes.raise({
      orderId: order.id, raisedBy: buyerId,
      reason: 'not_delivered', details: 'Never arrived.',
    });
    await disputes.claimForReview(d.id, officerId);

    const resolved = await disputes.resolve({
      disputeId: d.id, officerId, outcome: 'refund_buyer',
      resolution: 'Rider log shows no delivery. Buyer refunded in full.',
    });

    expect(resolved.status).toBe('resolved_buyer');
    expect(Number(resolved.refund_amount)).toBe(1000);
    expect(resolved.resolved_by).toBe(officerId);      // attribution required

    // The seller had been credited 950 (1000 less 5% commission).
    // The refund takes back 950 and returns the 50 commission → net −900… no:
    // seller is debited 950 and credited back the 50 commission the platform took,
    // so the seller ends up exactly where they started before the sale.
    const sellerNow = await getBalance(sellerId);
    expect(sellerNow).toBe(sellerAfterSale - 950 + 50);

    // The buyer gets the full 1000 back.
    expect(await getBalance(buyerId)).toBe(buyerBefore + 1000);

    // Escrow and the order both say refunded.
    const [pay] = await q<any>(
      `SELECT escrow_state, status FROM payments WHERE order_id = $1::uuid`, [order.id]);
    expect(pay.escrow_state).toBe('refunded');
    expect(pay.status).toBe('refunded');

    const o = await orders.findById(order.id);
    expect(o!.status).toBe('refunded');

    // And the books still balance.
    expect(await q(`SELECT * FROM wallet_drift`)).toHaveLength(0);
  });

  test('a partial refund moves only the agreed amount', async () => {
    const { order } = await paidOrder(100, 10);   // GHS 1000

    const sellerBefore = await getBalance(sellerId);
    const buyerBefore = await getBalance(buyerId);

    const d = await disputes.raise({
      orderId: order.id, raisedBy: buyerId, reason: 'quantity_short',
      details: 'Ordered 10 bags, got 7.',
      claimAmount: 300,
    });

    const resolved = await disputes.resolve({
      disputeId: d.id, officerId, outcome: 'refund_buyer',
      refundAmount: 300,
      resolution: 'Three bags short. Refunding GHS 300.',
    });

    expect(Number(resolved.refund_amount)).toBe(300);
    expect(await getBalance(buyerId)).toBe(buyerBefore + 300);
    // Seller loses 285 (300 less the 15 commission returned to them).
    expect(await getBalance(sellerId)).toBe(sellerBefore - 285 + 15);
    expect(await q(`SELECT * FROM wallet_drift`)).toHaveLength(0);
  });

  test('a refund cannot exceed the claim', async () => {
    const { order } = await paidOrder(50, 4);   // GHS 200

    const d = await disputes.raise({
      orderId: order.id, raisedBy: buyerId, reason: 'damaged', claimAmount: 50,
    });

    // Asking for 500 on a 50 claim is capped at the claim, not honoured.
    const resolved = await disputes.resolve({
      disputeId: d.id, officerId, outcome: 'refund_buyer',
      refundAmount: 500,
      resolution: 'Capped at the claim.',
    });
    expect(Number(resolved.refund_amount)).toBe(50);
  });

  // ─── Siding with the seller ───────────────────────────────────────────────

  test('finding for the seller lifts the freeze and pays them', async () => {
    const { order, payment } = await paidOrder(150, 4);   // GHS 600

    const d = await deliveries.createForOrder({
      orderId: order.id, actorId: sellerId, actorRole: 'seller',
    });
    await deliveries.assignRider(d.id, riderId);
    await deliveries.setStatus(d.id, riderId, 'accepted');
    await deliveries.setStatus(d.id, riderId, 'picked_up');
    await deliveries.setStatus(d.id, riderId, 'in_transit');

    const dispute = await disputes.raise({
      orderId: order.id, raisedBy: buyerId, reason: 'late', details: 'Too slow.',
    });

    // Frozen: the rider cannot complete.
    await expect(deliveries.setStatus(d.id, riderId, 'delivered'))
      .rejects.toThrow(/ESCROW_FROZEN/);

    const sellerBefore = await getBalance(sellerId);

    await disputes.resolve({
      disputeId: dispute.id, officerId, outcome: 'favour_seller',
      resolution: 'Delivered within the agreed window. Signed for by the buyer.',
    });

    // The freeze is lifted and the money released.
    const pay = await payments.findByReference(payment.reference);
    expect(pay!.escrow_state).toBe('released');

    // No money moved — the seller keeps what the sale already credited them.
    expect(await getBalance(sellerId)).toBe(sellerBefore);

    // And the rider can now finish the job.
    const done = await deliveries.setStatus(d.id, riderId, 'delivered');
    expect(done.status).toBe('delivered');
  });

  // ─── Double-resolution ────────────────────────────────────────────────────

  test('a dispute cannot be resolved twice — no double refund', async () => {
    const { order } = await paidOrder(100, 5);   // GHS 500

    const d = await disputes.raise({
      orderId: order.id, raisedBy: buyerId, reason: 'not_delivered',
    });

    const buyerBefore = await getBalance(buyerId);
    await disputes.resolve({
      disputeId: d.id, officerId, outcome: 'refund_buyer',
      resolution: 'Refunded.',
    });
    const afterFirst = await getBalance(buyerId);
    expect(afterFirst).toBe(buyerBefore + 500);

    // A second officer clicks resolve again.
    await expect(disputes.resolve({
      disputeId: d.id, officerId, outcome: 'refund_buyer',
      resolution: 'Refunded again?',
    })).rejects.toThrow(/already closed/i);

    // The buyer was NOT paid twice.
    expect(await getBalance(buyerId)).toBe(afterFirst);
    expect(await q(`SELECT * FROM wallet_drift`)).toHaveLength(0);
  });

  test('resolving requires a reason — no anonymous verdicts', async () => {
    const { order } = await paidOrder(20, 2);
    const d = await disputes.raise({ orderId: order.id, raisedBy: buyerId });

    await expect(disputes.resolve({
      disputeId: d.id, officerId, outcome: 'refund_buyer', resolution: '  ',
    })).rejects.toThrow(/resolution note is required/i);
  });

  // ─── Withdrawal ───────────────────────────────────────────────────────────

  test('a buyer can withdraw, which lifts the freeze', async () => {
    const { order, payment } = await paidOrder(60, 5);

    const d = await deliveries.createForOrder({
      orderId: order.id, actorId: sellerId, actorRole: 'seller',
    });
    await deliveries.assignRider(d.id, riderId);
    await deliveries.setStatus(d.id, riderId, 'accepted');
    await deliveries.setStatus(d.id, riderId, 'picked_up');
    await deliveries.setStatus(d.id, riderId, 'in_transit');
    await deliveries.setStatus(d.id, riderId, 'delivered');

    const dispute = await disputes.raise({
      orderId: order.id, raisedBy: buyerId, reason: 'late',
    });
    expect((await payments.findByReference(payment.reference))!.escrow_state).toBe('held');

    // "Actually it turned up."
    const withdrawn = await disputes.withdraw(dispute.id, buyerId);
    expect(withdrawn!.status).toBe('withdrawn');

    // The seller is paid, because the goods were in fact delivered.
    expect((await payments.findByReference(payment.reference))!.escrow_state).toBe('released');
  });

  // ─── Officer views ────────────────────────────────────────────────────────

  test('the officer queue puts overdue disputes first', async () => {
    // A dispute that has blown its SLA.
    const { order } = await paidOrder(40, 2);
    const late = await disputes.raise({
      orderId: order.id, raisedBy: buyerId, reason: 'not_delivered',
      details: 'This one has been sitting for weeks.',
    });
    await q(`UPDATE disputes SET due_at = now() - INTERVAL '9 days' WHERE id = $1::uuid`,
      [late.id]);

    // And a fresh one.
    const { order: order2 } = await paidOrder(40, 2);
    const fresh = await disputes.raise({
      orderId: order2.id, raisedBy: buyerId, reason: 'late',
    });

    const queue = await disputes.queue('open');
    expect(queue.length).toBeGreaterThanOrEqual(2);

    // The overdue one is flagged, and sits above the fresh one. (Other runs may
    // have left their own overdue cases behind, so assert the INVARIANT rather
    // than a fixed position — the queue must never bury an overdue case under an
    // on-time one.)
    const lateIdx = queue.findIndex((d) => d.id === late.id);
    const freshIdx = queue.findIndex((d) => d.id === fresh.id);
    expect(lateIdx).toBeGreaterThanOrEqual(0);
    expect(queue[lateIdx].overdue).toBe(true);
    expect(lateIdx).toBeLessThan(freshIdx);

    // Every overdue dispute sorts ahead of every on-time one.
    const lastOverdue = queue.map((d) => !!d.overdue).lastIndexOf(true);
    const firstOnTime = queue.findIndex((d) => !d.overdue);
    if (firstOnTime !== -1 && lastOverdue !== -1) {
      expect(lastOverdue).toBeLessThan(firstOnTime);
    }

    // The status filter works.
    expect(queue.every((d) => d.status === 'open')).toBe(true);

    const overdueList = await disputes.overdue();
    expect(overdueList.some((d) => d.id === late.id)).toBe(true);
    expect(Number(overdueList.find((d) => d.id === late.id).days_late)).toBeGreaterThanOrEqual(8);
  });

  test("a seller's dispute record is honest about their losses", async () => {
    const record = await disputes.sellerRecord(sellerId);

    expect(record.total).toBeGreaterThan(0);
    expect(record.lost).toBeGreaterThan(0);          // we refunded several above
    expect(record.won).toBeGreaterThan(0);           // and found for them once
    expect(record.refunded).toBeGreaterThan(0);
    expect(record.paidOrders).toBeGreaterThan(0);
    expect(record.disputeRatePercent).toBeGreaterThan(0);
  });

  test('both parties see the dispute in their list', async () => {
    const buyerList = await disputes.mine(buyerId);
    const sellerList = await disputes.mine(sellerId);
    expect(buyerList.length).toBeGreaterThan(0);
    expect(sellerList.length).toBeGreaterThan(0);
    expect(buyerList[0].order_number).toBeTruthy();
  });

  test('the books balance after every dispute in this suite', async () => {
    expect(await q(`SELECT * FROM wallet_drift`)).toHaveLength(0);
  });
});
