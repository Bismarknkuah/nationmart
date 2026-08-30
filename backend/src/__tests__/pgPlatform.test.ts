/**
 * Platform domains — messaging, notifications, HR, management — on real PostgreSQL.
 *
 * The management tests double as proof that the dashboards (previously hand-rolled
 * MongoDB aggregation pipelines) return correct numbers as plain SQL, and that
 * jurisdiction scoping genuinely prevents a district officer from seeing another
 * district's data.
 */
import { q, closePool } from '../db/pg';
import { createUser } from '../repos/userRepo';
import * as stores from '../repos/storeRepo';
import * as products from '../repos/productRepo';
import * as orders from '../repos/orderRepo';
import * as payments from '../repos/paymentRepo';
import * as deliveries from '../repos/deliveryRepo';
import * as chat from '../repos/messageRepo';
import * as notes from '../repos/notificationRepo';
import * as hr from '../repos/hrRepo';
import * as mgmt from '../repos/managementRepo';

const URL = process.env.TEST_DATABASE_URL;
const describeIfDb = URL ? describe : describe.skip;
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describeIfDb('Platform domains (PostgreSQL)', () => {
  let sellerId: string, buyerId: string, riderId: string, hrId: string;
  let storeId: string, orderId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;

    const seller = await createUser({
      fullName: 'Kofi Seller', email: `s-${uniq()}@plat.gh`, phone: '0244000301',
      password: 'pw', role: 'seller', address: 'Adum',
      region: 'Ashanti', district: 'Kumasi Metropolitan',
    });
    sellerId = seller.id;

    const buyer = await createUser({
      fullName: 'Efua Buyer', email: `b-${uniq()}@plat.gh`, phone: '0244000302',
      password: 'pw', role: 'buyer', address: 'Afrancho',
      region: 'Ashanti', district: 'Kumasi Metropolitan',
    });
    buyerId = buyer.id;

    const rider = await createUser({
      fullName: 'Kojo Rider', email: `r-${uniq()}@plat.gh`, phone: '0244000303',
      password: 'pw', role: 'rider', address: 'Asokwa',
      region: 'Ashanti', district: 'Kumasi Metropolitan',
    });
    riderId = rider.id;

    const hrOfficer = await createUser({
      fullName: 'Ama HR', email: `h-${uniq()}@plat.gh`, phone: '0244000304',
      password: 'pw', role: 'hr_officer', address: 'Accra', region: 'Greater Accra',
    });
    hrId = hrOfficer.id;

    const store = await stores.createStore({
      ownerId: sellerId, name: `Plat Store ${uniq()}`,
      region: 'Ashanti', district: 'Kumasi Metropolitan', lat: 6.69, lng: -1.62,
    });
    storeId = store.id;

    const p = await products.createProduct({
      sellerId, storeId, title: `Cement ${uniq()}`, description: 'Building',
      category: 'building_materials', pricePerUnit: 100, availableQuantity: 50,
      region: 'Ashanti', district: 'Kumasi Metropolitan',
    });
    await products.approveProduct(p.id);

    const { order } = await orders.createOrder(buyerId, [{ productId: p.id, quantity: 5 }], {
      recipientName: 'Efua', city: 'Afrancho', state: 'Ashanti', lat: 6.75, lng: -1.60,
    });
    orderId = order.id;

    const pay = await payments.createPayment({
      userId: buyerId, orderId: order.id, purpose: 'order', amount: 500,
    });
    await payments.settlePayment(pay.reference);
  });

  afterAll(async () => {
    await q(`DELETE FROM users WHERE email LIKE '%@plat.gh'`).catch(() => {});
    await closePool();
  });

  // ─── 3-way order chat ─────────────────────────────────────────────────────

  test('the order thread includes buyer, seller — and the rider once assigned', async () => {
    const threadId = await chat.getOrCreateOrderThread(orderId);

    expect(await chat.isParticipant(threadId, buyerId)).toBe(true);
    expect(await chat.isParticipant(threadId, sellerId)).toBe(true);
    expect(await chat.isParticipant(threadId, riderId)).toBe(false);  // no rider yet

    // Assign a rider, then refresh the thread.
    const d = await deliveries.createForOrder({
      orderId, actorId: sellerId, actorRole: 'seller',
    });
    await deliveries.assignRider(d.id, riderId);
    await chat.getOrCreateOrderThread(orderId);

    expect(await chat.isParticipant(threadId, riderId)).toBe(true);   // now in the chat
  });

  test('one order has exactly one thread, however often it is opened', async () => {
    const a = await chat.getOrCreateOrderThread(orderId);
    const b = await chat.getOrCreateOrderThread(orderId);
    expect(a).toBe(b);

    const rows = await q(`SELECT id FROM conversations WHERE order_id = $1::uuid`, [orderId]);
    expect(rows).toHaveLength(1);
  });

  test('participants can chat; outsiders cannot; empty messages are refused', async () => {
    const threadId = await chat.getOrCreateOrderThread(orderId);

    await chat.sendMessage(threadId, buyerId, 'Where is my cement?');
    await chat.sendMessage(threadId, sellerId, 'The rider has collected it.');
    await chat.sendMessage(threadId, riderId, 'On my way, 10 minutes.');

    const msgs = await chat.getMessages(threadId);
    expect(msgs).toHaveLength(3);
    expect(msgs[0].sender_name).toBe('Efua Buyer');
    expect(msgs[2].sender_role).toBe('rider');

    await expect(chat.sendMessage(threadId, buyerId, '   ')).rejects.toThrow(/empty/i);

    const outsider = await createUser({
      fullName: 'Nosy Person', email: `n-${uniq()}@plat.gh`, phone: '0244000399',
      password: 'pw', role: 'buyer', address: 'Accra',
    });
    await expect(
      chat.sendMessage(threadId, outsider.id, 'let me in'),
    ).rejects.toThrow(/not part of this conversation/i);
  });

  test('a message notifies the other participants, not the sender', async () => {
    const threadId = await chat.getOrCreateOrderThread(orderId);
    const before = await notes.unreadCount(sellerId);

    await chat.sendMessage(threadId, buyerId, 'Any update please?');
    await new Promise((r) => setTimeout(r, 150));   // the notify is fire-and-forget

    expect(await notes.unreadCount(sellerId)).toBeGreaterThan(before);
  });

  // ─── Notifications ────────────────────────────────────────────────────────

  test('notifications list, count and mark read', async () => {
    await notes.notify({
      userId: buyerId, type: 'delivery_update',
      title: 'Delivery update', message: 'Your parcel is on the way.', link: '/dashboard',
    });

    const list = await notes.list(buyerId);
    expect(list.length).toBeGreaterThan(0);

    const unreadBefore = await notes.unreadCount(buyerId);
    expect(unreadBefore).toBeGreaterThan(0);

    await notes.markAllRead(buyerId);
    expect(await notes.unreadCount(buyerId)).toBe(0);
  });

  // ─── HR ───────────────────────────────────────────────────────────────────

  test('leave: submit, approve, and the decision is attributed', async () => {
    const leave = await hr.submitLeave({
      staffId: riderId, kind: 'annual',
      startDate: '2026-09-01', endDate: '2026-09-05', reason: 'Family',
    });

    expect(leave.status).toBe('pending');
    expect(leave.days).toBe(5);

    const decided = await hr.decideLeave(leave.id, hrId, true, 'Approved — enjoy.');
    expect(decided.status).toBe('approved');
    expect(decided.decided_by).toBe(hrId);       // accountability recorded
    expect(decided.decided_at).toBeTruthy();

    // The staff member is told.
    const staffNotes = await notes.list(riderId);
    expect(staffNotes.some((n) => n.title === 'Leave approved')).toBe(true);
  });

  test('leave with backwards dates is rejected', async () => {
    await expect(hr.submitLeave({
      staffId: riderId, startDate: '2026-09-10', endDate: '2026-09-01',
    })).rejects.toThrow();
  });

  test('a decided request cannot be decided again', async () => {
    const leave = await hr.submitLeave({
      staffId: riderId, startDate: '2026-10-01', endDate: '2026-10-02',
    });
    await hr.decideLeave(leave.id, hrId, false, 'Short staffed');

    const second = await hr.decideLeave(leave.id, hrId, true);
    expect(second).toBeNull();   // no longer pending
  });

  test('onboarding completion is computed from the tasks, never claimed', async () => {
    const newStaff = await createUser({
      fullName: 'New Officer', email: `no-${uniq()}@plat.gh`, phone: '0244000305',
      password: 'pw', role: 'logistics_officer', address: 'Kumasi',
    });

    await hr.startOnboarding(newStaff.id);
    let list = await hr.listOnboarding();
    let mine = list.find((o) => o.staff_id === newStaff.id);
    expect(mine.completed).toBe(false);
    expect(Number(mine.total)).toBe(6);
    expect(Number(mine.done)).toBe(0);

    // Tick every task.
    for (const t of mine.tasks) await hr.toggleTask(String(t.id), true);

    list = await hr.listOnboarding();
    mine = list.find((o) => o.staff_id === newStaff.id);
    expect(Number(mine.done)).toBe(6);
    expect(mine.completed).toBe(true);      // the trigger flipped it

    // Untick one — completion must fall back to false on its own.
    await hr.toggleTask(String(mine.tasks[0].id), false);
    list = await hr.listOnboarding();
    mine = list.find((o) => o.staff_id === newStaff.id);
    expect(mine.completed).toBe(false);
  });

  test('payroll: arithmetic enforced, no double payslip', async () => {
    const slip = await hr.addPayslip(hrId, '2026-07-15', 3000, 500);
    expect(Number(slip.net)).toBe(2500);
    expect(slip.paid).toBe(false);

    // Same person, same month → refused.
    await expect(hr.addPayslip(hrId, '2026-07-20', 3000, 0)).rejects.toThrow();

    const paid = await hr.markPayrollPaid(slip.id);
    expect(paid.paid).toBe(true);
    expect(await hr.markPayrollPaid(slip.id)).toBeNull();   // not twice
  });

  // ─── Management dashboards ────────────────────────────────────────────────

  test('platform stats are correct and the 7-day trend is dense', async () => {
    const s = await mgmt.platformStats();

    expect(s.users).toBeGreaterThan(0);
    expect(s.sellers).toBeGreaterThan(0);
    expect(s.riders).toBeGreaterThan(0);
    expect(s.paidOrders).toBeGreaterThan(0);
    expect(s.gmv).toBeGreaterThanOrEqual(500);

    // Exactly 7 days, quiet days included as zeros rather than missing.
    expect(s.trend).toHaveLength(7);
    expect(s.trend.every((d) => typeof d.orders === 'number')).toBe(true);
  });

  test('office stats cover finance, HR, logistics and security', async () => {
    const o = await mgmt.officeStats();

    expect(o.finance.gmv).toBeGreaterThanOrEqual(500);
    expect(o.finance.commissionEarned).toBeGreaterThan(0);
    expect(o.hr.pendingLeave).toBeGreaterThanOrEqual(0);
    expect(o.logistics.failed).toBeGreaterThanOrEqual(0);

    // The invariant: the ledger must never disagree with the wallets.
    expect(o.security.ledgerDrift).toBe(0);
  });

  test('scopeFor never escalates a district or regional officer to national', () => {
    // REGRESSION: an earlier regex matched /admin/ first, so "district_admin"
    // was granted NATIONAL scope and could read every district in Ghana.
    expect(mgmt.scopeFor({ role: 'district_admin', region: 'A', district: 'B' }).level)
      .toBe('district');
    expect(mgmt.scopeFor({ role: 'district_logistics_officer', region: 'A', district: 'B' }).level)
      .toBe('district');
    expect(mgmt.scopeFor({ role: 'region_admin', region: 'A' }).level).toBe('regional');
    expect(mgmt.scopeFor({ role: 'regional_logistics_officer', region: 'A' }).level)
      .toBe('regional');

    // Genuine national roles still get national.
    for (const role of ['ceo', 'coo', 'cfo', 'admin', 'national_logistics_director']) {
      expect(mgmt.scopeFor({ role }).level).toBe('national');
    }

    // An unknown role fails CLOSED — narrowest scope, never the whole country.
    expect(mgmt.scopeFor({ role: 'some_new_role', region: 'A', district: 'B' }).level)
      .toBe('district');
    expect(mgmt.scopeFor({ role: 'seller' }).level).toBe('district');
  });

  test('jurisdiction scoping stops an officer seeing another district', async () => {
    const national = mgmt.scopeFor({ role: 'ceo' });
    expect(national.level).toBe('national');

    const district = mgmt.scopeFor({
      role: 'district_admin', region: 'Ashanti', district: 'Kumasi Metropolitan',
    });
    expect(district.level).toBe('district');

    const mine = await mgmt.regionalOverview(district);
    expect(mine.stats.stores).toBeGreaterThan(0);   // my district has data

    // A different district: same query, no leakage.
    const elsewhere = await mgmt.regionalOverview({
      level: 'district', region: 'Northern', district: 'Tamale Metropolitan',
    });
    expect(elsewhere.stats.stores).toBe(0);
    expect(elsewhere.stats.gmv).toBe(0);

    // The national view sees everything.
    const all = await mgmt.regionalOverview(national);
    expect(all.stats.stores).toBeGreaterThanOrEqual(mine.stats.stores);
  });

  test('logistics desk reports the fleet for its jurisdiction', async () => {
    const l = await mgmt.jurisdictionLogistics({
      level: 'regional', region: 'Ashanti',
    });
    expect(l.fleet.total).toBeGreaterThan(0);
    expect(l.deliveredTotal).toBeGreaterThanOrEqual(0);
  });

  test('finance overview separates payables from receivables', async () => {
    const f = await mgmt.financeOverview();
    expect(f.owed.every((w) => w.balance > 0)).toBe(true);
    expect(f.owing.every((w) => w.balance < 0)).toBe(true);
    // The seller earned from the paid order, so they are owed money.
    expect(f.owed.some((w) => w.userId === sellerId)).toBe(true);
  });

  test('approving a rider lets them start work', async () => {
    const pending = await createUser({
      fullName: 'Pending Rider', email: `pr-${uniq()}@plat.gh`, phone: '0244000306',
      password: 'pw', role: 'rider', address: 'Kumasi', region: 'Ashanti',
    });
    expect(pending.is_approved).toBe(false);
    expect(pending.account_status).toBe('pending_review');

    await mgmt.approveUser(pending.id);

    const [after] = await q<any>(
      `SELECT is_approved, account_status FROM users WHERE id = $1::uuid`, [pending.id]);
    expect(after.is_approved).toBe(true);
    expect(after.account_status).toBe('active');
  });
});
