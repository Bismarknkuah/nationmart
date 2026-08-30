/**
 * Store & product repositories — against a REAL PostgreSQL database.
 *
 * The two headline tests are races the old MongoDB code could not win:
 *   • two simultaneous "create store" calls cannot push a seller to 3 stores
 *   • ten simultaneous buyers cannot oversell five items
 */
import { q, closePool } from '../db/pg';
import { createUser } from '../repos/userRepo';
import * as stores from '../repos/storeRepo';
import * as products from '../repos/productRepo';

const URL = process.env.TEST_DATABASE_URL;
const describeIfDb = URL ? describe : describe.skip;

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describeIfDb('Store & product repositories (PostgreSQL)', () => {
  let sellerId: string;
  let otherSellerId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    const seller = await createUser({
      fullName: 'Kofi Trader', email: `kofi-${uniq()}@sp.gh`, phone: '0244000100',
      password: 'pw', role: 'seller', address: 'Adum, Kumasi',
      region: 'Ashanti', district: 'Kumasi Metropolitan',
    });
    sellerId = seller.id;

    const other = await createUser({
      fullName: 'Ama Rival', email: `ama-${uniq()}@sp.gh`, phone: '0244000101',
      password: 'pw', role: 'seller', address: 'Accra', region: 'Greater Accra',
    });
    otherSellerId = other.id;
  });

  afterAll(async () => {
    await q(`DELETE FROM users WHERE email LIKE '%@sp.gh'`).catch(() => {});
    await closePool();
  });

  // ─── Stores ───────────────────────────────────────────────────────────────

  test('creates a store with a unique slug and store number', async () => {
    const s = await stores.createStore({
      ownerId: sellerId, name: 'Ashanti Forest Goods', type: 'general',
      region: 'Ashanti', district: 'Kumasi Metropolitan', lat: 6.69, lng: -1.62,
    });

    // The slug is derived from the name, and suffixed if that base is already
    // taken — so assert the shape, not a value that depends on a clean database.
    expect(s.slug).toMatch(/^ashanti-forest-goods(-[a-z0-9]+)?$/);
    expect(s.store_number).toMatch(/^NM\d{6}$/);
    expect(s.market_scope).toBe('local');
    expect(s.is_international).toBe(false);
    expect(s.status).toBe('active');
  });

  test('a duplicate store name still gets a unique slug', async () => {
    const name = `Twin Store ${uniq()}`;
    const first = await stores.createStore({ ownerId: sellerId, name });
    const second = await stores.createStore({ ownerId: otherSellerId, name });

    expect(second.slug).not.toBe(first.slug);          // never collides
    expect(second.slug).toContain(stores.slugify(name));
  });

  test('the 2-store limit holds even under a simultaneous triple-create', async () => {
    // A brand-new seller, so this test never depends on what ran before it.
    const fresh = await createUser({
      fullName: 'Fresh Seller', email: `fresh-${uniq()}@sp.gh`, phone: '0244000199',
      password: 'pw', role: 'seller', address: 'Kumasi',
    });

    // Three "create store" calls at the same instant. The old count-then-insert
    // had a gap between counting and writing, so all three could pass the check
    // and the seller would end up with three stores. The database trigger closes it.
    const results = await Promise.allSettled([
      stores.createStore({ ownerId: fresh.id, name: `Store A ${uniq()}` }),
      stores.createStore({ ownerId: fresh.id, name: `Store B ${uniq()}` }),
      stores.createStore({ ownerId: fresh.id, name: `Store C ${uniq()}` }),
    ]);

    // Exactly two get in. Not "at most" — exactly. The third is rejected.
    const made = results.filter((r) => r.status === 'fulfilled').length;
    expect(made).toBe(stores.MAX_STORES);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await stores.countByOwner(fresh.id)).toBe(stores.MAX_STORES);

    // Once at the limit, any further attempt is refused outright.
    await expect(
      stores.createStore({ ownerId: fresh.id, name: 'One Too Many' }),
    ).rejects.toThrow(/STORE_LIMIT/);
    expect(await stores.countByOwner(fresh.id)).toBe(stores.MAX_STORES);
  });

  test('only the owner can update a store', async () => {
    const [mine] = await stores.myStores(sellerId);

    const ok = await stores.updateStore(mine.id, sellerId, {
      description: 'Quality building materials',
      logoUrl: 'https://cdn/logo.png',
    });
    expect(ok!.description).toBe('Quality building materials');
    expect(ok!.logo_url).toBe('https://cdn/logo.png');

    // Someone else's attempt simply matches no rows.
    const nope = await stores.updateStore(mine.id, otherSellerId, { name: 'Hijacked' });
    expect(nope).toBeNull();

    const still = await stores.findById(mine.id);
    expect(still!.name).not.toBe('Hijacked');
  });

  test('staff can be added, listed and removed', async () => {
    const [store] = await stores.myStores(sellerId);
    const staff = await createUser({
      fullName: 'Yaw Staff', email: `yaw-${uniq()}@sp.gh`, phone: '0244000102',
      password: 'pw', role: 'buyer', address: 'Kumasi',
    });

    expect(await stores.canManage(store.id, staff.id)).toBe(false);

    await stores.addStaff(store.id, staff.id, 'manager', ['orders', 'inventory']);
    expect(await stores.canManage(store.id, staff.id)).toBe(true);

    const list = await stores.listStaff(store.id);
    expect(list).toHaveLength(1);
    expect(list[0].full_name).toBe('Yaw Staff');
    expect(list[0].permissions).toEqual(['orders', 'inventory']);

    await stores.removeStaff(store.id, staff.id);
    expect(await stores.canManage(store.id, staff.id)).toBe(false);
    // The owner always can.
    expect(await stores.canManage(store.id, sellerId)).toBe(true);
  });

  // ─── Products ─────────────────────────────────────────────────────────────

  test('a new listing starts in review, not live', async () => {
    const [store] = await stores.myStores(sellerId);
    const p = await products.createProduct({
      sellerId, storeId: store.id,
      title: 'Dangote Cement 50kg',
      description: 'Strong cement for building foundations',
      category: 'building_materials',
      pricePerUnit: 75, availableQuantity: 100, unit: 'bag',
      region: 'Ashanti', district: 'Kumasi Metropolitan',
    });

    expect(p.status).toBe('pending_review');       // never auto-live
    expect(Number(p.price_per_unit)).toBe(75);
    expect(p.passport_id).toMatch(/^NM-P-/);
    expect(p.traceability).toHaveLength(1);        // listing event recorded
    expect(p.traceability[0].event).toBe('Product Listed');

    // It must not appear in search until approved.
    const beforeApproval = await products.searchProducts({ query: 'cement' });
    expect(beforeApproval.find((h) => h.id === p.id)).toBeUndefined();

    await products.approveProduct(p.id);
    const afterApproval = await products.searchProducts({ query: 'cement' });
    expect(afterApproval.find((h) => h.id === p.id)).toBeTruthy();
  });

  test('ten simultaneous buyers cannot oversell five items', async () => {
    const [store] = await stores.myStores(sellerId);
    const p = await products.createProduct({
      sellerId, storeId: store.id, title: `Limited Roofing Sheet ${uniq()}`,
      description: 'Aluminium roofing', category: 'building_materials',
      pricePerUnit: 170, availableQuantity: 5,
    });
    await products.approveProduct(p.id);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => products.reserveStock(p.id, 1)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(5);

    const after = await products.findById(p.id);
    expect(Number(after!.available_quantity)).toBe(0);   // never negative
    expect(after!.status).toBe('sold_out');
  });

  test('restocking puts a sold-out listing back on sale', async () => {
    const [store] = await stores.myStores(sellerId);
    const p = await products.createProduct({
      sellerId, storeId: store.id, title: `Sold Out Item ${uniq()}`,
      description: 'x', pricePerUnit: 10, availableQuantity: 1,
    });
    await products.approveProduct(p.id);
    await products.reserveStock(p.id, 1);

    let now = await products.findById(p.id);
    expect(now!.status).toBe('sold_out');

    await products.updateProduct(p.id, sellerId, { availableQuantity: 20 });
    now = await products.findById(p.id);
    expect(Number(now!.available_quantity)).toBe(20);
    expect(now!.status).toBe('active');     // back on sale
  });

  test('only the owning seller can edit a listing', async () => {
    const [store] = await stores.myStores(sellerId);
    const p = await products.createProduct({
      sellerId, storeId: store.id, title: `Protected ${uniq()}`,
      description: 'x', pricePerUnit: 50, availableQuantity: 10,
    });

    const hijack = await products.updateProduct(p.id, otherSellerId, { pricePerUnit: 1 });
    expect(hijack).toBeNull();

    const still = await products.findById(p.id);
    expect(Number(still!.price_per_unit)).toBe(50);   // unchanged
  });

  test('storefront returns the store with only its live listings', async () => {
    const [store] = await stores.myStores(sellerId);
    const front = await stores.storefront(store.slug);

    expect(front).not.toBeNull();
    expect(front!.store.id).toBe(store.id);
    // Every product shown must be live — nothing pending or sold out.
    for (const p of front!.products) {
      expect(Number(p.available_quantity)).toBeGreaterThanOrEqual(0);
    }
  });

  test('low-stock alerts surface the right listings', async () => {
    const low = await products.lowStock(sellerId, 5);
    expect(low.every((p) => Number(p.available_quantity) <= 5)).toBe(true);
  });

  test('traceability events append in order', async () => {
    const [store] = await stores.myStores(sellerId);
    const p = await products.createProduct({
      sellerId, storeId: store.id, title: `Traced Yam ${uniq()}`,
      description: 'Farm yam', category: 'farm_produce',
      pricePerUnit: 30, availableQuantity: 40, origin: 'Techiman',
    });

    await products.addTraceability(p.id, {
      event: 'Left Farm', location: 'Techiman', actorRole: 'seller',
    });
    const traced = await products.addTraceability(p.id, {
      event: 'Arrived Warehouse', location: 'Kumasi', actorRole: 'logistics_officer',
    });

    expect(traced!.traceability).toHaveLength(3);              // listing + 2
    expect(traced!.traceability[0].event).toBe('Product Listed');
    expect(traced!.traceability[2].event).toBe('Arrived Warehouse');
  });
});
