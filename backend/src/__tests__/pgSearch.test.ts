/**
 * Search — against a REAL PostgreSQL database.
 *
 * The tests that matter are the ones that mimic how people actually type:
 * misspelt, phonetic, in a local name, on a phone keyboard. Every one of those
 * used to return an empty page.
 */
import { q, closePool } from '../db/pg';
import { createUser } from '../repos/userRepo';
import * as stores from '../repos/storeRepo';
import * as products from '../repos/productRepo';
import * as search from '../repos/searchRepo';

const URL = process.env.TEST_DATABASE_URL;
const describeIfDb = URL ? describe : describe.skip;
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

// Kumasi, and points at increasing distance from it.
const KUMASI = { lat: 6.6885, lng: -1.6244 };
const OBUASI = { lat: 6.2027, lng: -1.6663 };   // ~55km
const ACCRA  = { lat: 5.6037, lng: -0.1870 };   // ~200km

describeIfDb('Search (PostgreSQL)', () => {
  let sellerId: string;
  let nearStore: string, farStore: string;
  let cementId: string, roofingId: string, timberId: string, accraCementId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;

    const seller = await createUser({
      fullName: 'Search Seller', email: `s-${uniq()}@srch.gh`, phone: '0244000501',
      password: 'pw', role: 'seller', address: 'Adum', region: 'Ashanti',
    });
    sellerId = seller.id;

    const near = await stores.createStore({
      ownerId: sellerId, name: `Kumasi Hardware ${uniq()}`,
      region: 'Ashanti', district: 'Kumasi Metropolitan',
      lat: KUMASI.lat, lng: KUMASI.lng,
    });
    nearStore = near.id;

    const far = await stores.createStore({
      ownerId: sellerId, name: `Accra Depot ${uniq()}`,
      region: 'Greater Accra', district: 'Accra Metropolitan',
      lat: ACCRA.lat, lng: ACCRA.lng,
    });
    farStore = far.id;

    async function live(input: any) {
      const p = await products.createProduct({ sellerId, ...input });
      await products.approveProduct(p.id);
      return p.id;
    }

    cementId = await live({
      storeId: nearStore, title: 'Dangote Cement 50kg',
      description: 'Strong cement for foundations and blockwork',
      category: 'building_materials', pricePerUnit: 75, availableQuantity: 200,
      unit: 'bag', region: 'Ashanti', district: 'Kumasi Metropolitan',
      lat: KUMASI.lat, lng: KUMASI.lng,
    });

    roofingId = await live({
      storeId: nearStore, title: 'Aluzinc Roofing Sheet',
      description: 'Corrugated aluminium roofing sheets',
      category: 'building_materials', pricePerUnit: 170, availableQuantity: 80,
      unit: 'sheet', region: 'Ashanti', district: 'Kumasi Metropolitan',
      lat: OBUASI.lat, lng: OBUASI.lng,
    });

    timberId = await live({
      storeId: nearStore, title: 'Iroko Hardwood Plank',
      description: 'Seasoned iroko timber, export grade',
      category: 'timber', pricePerUnit: 450, availableQuantity: 30,
      unit: 'plank', region: 'Ashanti', district: 'Kumasi Metropolitan',
      lat: KUMASI.lat, lng: KUMASI.lng, species: 'odum',
    });

    // The same product, but 200km away — this is what distance ranking must beat.
    accraCementId = await live({
      storeId: farStore, title: 'Dangote Cement 50kg',
      description: 'Strong cement, Accra warehouse',
      category: 'building_materials', pricePerUnit: 75, availableQuantity: 500,
      unit: 'bag', region: 'Greater Accra', district: 'Accra Metropolitan',
      lat: ACCRA.lat, lng: ACCRA.lng,
    });

    // Something out of stock, to check it is demoted.
    const sold = await live({
      storeId: nearStore, title: 'Cement Mixer Machine',
      description: 'Electric cement mixer',
      category: 'building_materials', pricePerUnit: 3500, availableQuantity: 1,
      lat: KUMASI.lat, lng: KUMASI.lng,
    });
    await products.reserveStock(sold, 1);   // now sold out
  });

  afterAll(async () => {
    await q(`DELETE FROM search_log WHERE query LIKE '%test%'`).catch(() => {});
    await q(`DELETE FROM users WHERE email LIKE '%@srch.gh'`).catch(() => {});
    await closePool();
  });

  const titles = (r: search.SearchResult) => r.hits.map((h) => h.title);

  // ─── Typos: the whole point ───────────────────────────────────────────────

  test('an exact search works, and is marked exact', async () => {
    const r = await search.search({ query: 'cement' });
    expect(r.hits.length).toBeGreaterThan(0);
    expect(titles(r).some((t) => /Cement/i.test(t))).toBe(true);
    expect(r.hits[0].matchedBy).toBe('exact');
    expect(r.corrected).toBe(false);
  });

  test.each([
    ['cemnt',   'dropped letter'],
    ['sement',  'phonetic spelling'],
    ['cemet',   'missing letter'],
    ['ciment',  'French/ear spelling'],
  ])('a misspelling still finds it: "%s" (%s)', async (typo) => {
    const r = await search.search({ query: typo });

    expect(r.hits.length).toBeGreaterThan(0);           // NOT an empty page
    expect(titles(r).some((t) => /Cement/i.test(t))).toBe(true);
    expect(r.hits[0].matchedBy).toBe('fuzzy');
    expect(r.corrected).toBe(true);                     // we guessed, and said so
  });

  test('a mistyped two-word search still works', async () => {
    const r = await search.search({ query: 'roofin shet' });
    expect(r.hits.length).toBeGreaterThan(0);
    expect(titles(r).some((t) => /Roofing/i.test(t))).toBe(true);
  });

  // ─── Ghana local names ────────────────────────────────────────────────────

  test.each([
    ['simenti', /Cement/i,  'Ghanaian for cement'],
    ['ghacem',  /Cement/i,  'a cement brand used as the generic'],
    ['zinc',    /Roofing/i, 'what everyone calls roofing sheets'],
    ['aluzinc', /Roofing/i, 'the trade name'],
    ['odum',    /Iroko/i,   'the Twi name for iroko'],
  ])('a local name finds the listing: "%s" (%s)', async (term, expected) => {
    const r = await search.search({ query: term as string });
    expect(r.hits.length).toBeGreaterThan(0);
    expect(titles(r).some((t) => (expected as RegExp).test(t))).toBe(true);
  });

  test('nonsense returns nothing, and offers a suggestion', async () => {
    const r = await search.search({ query: 'xyzzy quantum bicycle' });
    expect(r.hits).toHaveLength(0);       // junk must NOT match

    const near = await search.search({ query: 'cemnnnt' });
    if (near.hits.length === 0) {
      expect(near.didYouMean).toBeTruthy();   // a dead end offers a way out
    }
  });

  // ─── Distance ─────────────────────────────────────────────────────────────

  test('a nearby seller outranks an identical distant one', async () => {
    // Two identical cement listings: one in Kumasi, one in Accra (200km away).
    const r = await search.search({
      query: 'cement', lat: KUMASI.lat, lng: KUMASI.lng,
    });

    const kumasi = r.hits.find((h) => h.id === cementId);
    const accra = r.hits.find((h) => h.id === accraCementId);
    expect(kumasi).toBeTruthy();
    expect(accra).toBeTruthy();

    expect(kumasi!.distanceKm).toBeLessThan(5);
    expect(accra!.distanceKm).toBeGreaterThan(150);

    // Same title, same price — so proximity is the tiebreaker, as it should be.
    expect(kumasi!.relevance).toBeGreaterThan(accra!.relevance);
    expect(r.hits.findIndex((h) => h.id === cementId))
      .toBeLessThan(r.hits.findIndex((h) => h.id === accraCementId));
  });

  test('a radius genuinely excludes what is outside it', async () => {
    const within = await search.search({
      query: 'cement', lat: KUMASI.lat, lng: KUMASI.lng, radiusKm: 20,
    });
    expect(within.hits.find((h) => h.id === cementId)).toBeTruthy();
    expect(within.hits.find((h) => h.id === accraCementId)).toBeUndefined();  // 200km away

    const wide = await search.search({
      query: 'cement', lat: KUMASI.lat, lng: KUMASI.lng, radiusKm: 300,
    });
    expect(wide.hits.find((h) => h.id === accraCementId)).toBeTruthy();
  });

  test('sorting by distance puts the closest first', async () => {
    const r = await search.search({
      lat: KUMASI.lat, lng: KUMASI.lng, sort: 'distance', category: 'building_materials',
    });
    const distances = r.hits.map((h) => h.distanceKm).filter((d): d is number => d != null);
    const sorted = [...distances].sort((a, b) => a - b);
    expect(distances).toEqual(sorted);
  });

  test('distance is computed correctly (Kumasi → Accra ≈ 200km)', async () => {
    const r = await search.search({ query: 'cement', lat: KUMASI.lat, lng: KUMASI.lng });
    const accra = r.hits.find((h) => h.id === accraCementId);
    // The real great-circle distance is about 200km.
    expect(accra!.distanceKm).toBeGreaterThan(180);
    expect(accra!.distanceKm).toBeLessThan(220);
  });

  // ─── Filters and sorts ────────────────────────────────────────────────────

  test('filters narrow the result set', async () => {
    const byCategory = await search.search({ category: 'timber' });
    expect(byCategory.hits.every((h) => h.category === 'timber')).toBe(true);

    const byPrice = await search.search({ minPrice: 100, maxPrice: 200 });
    expect(byPrice.hits.every((h) => h.pricePerUnit >= 100 && h.pricePerUnit <= 200)).toBe(true);

    const byRegion = await search.search({ region: 'Greater Accra' });
    expect(byRegion.hits.every((h) => h.region === 'Greater Accra')).toBe(true);
  });

  test('a sold-out listing still shows, and inStock hides it', async () => {
    const all = await search.search({ query: 'cement mixer' });

    // The buyer deserves to know this shop stocks it, even if it is out today —
    // they can ask for a restock. Hiding it just looks like the shop has nothing.
    const mixer = all.hits.find((h) => /Mixer/i.test(h.title));
    expect(mixer).toBeTruthy();
    expect(mixer!.inStock).toBe(false);
    expect(mixer!.availableQuantity).toBe(0);

    // But a buyer who only wants what they can have today can say so.
    const only = await search.search({ query: 'cement mixer', inStock: true });
    expect(only.hits.every((h) => h.inStock)).toBe(true);
    expect(only.hits.some((h) => /Mixer/i.test(h.title))).toBe(false);
  });

  test('between EQUALLY relevant listings, the one in stock wins', async () => {
    // Two identical products — same title, same shop, same place. The only
    // difference is that one is sold out. (Comparing a sold-out exact match
    // against an unrelated in-stock item would prove nothing: an exact match
    // SHOULD win, otherwise searching "cement mixer" shows you cement bags.)
    const title = `Wheelbarrow Steel ${uniq()}`;

    const available = await products.createProduct({
      sellerId, storeId: nearStore, title, description: 'Heavy duty barrow',
      category: 'building_materials', pricePerUnit: 250, availableQuantity: 10,
      lat: KUMASI.lat, lng: KUMASI.lng,
    });
    await products.approveProduct(available.id);

    const soldOut = await products.createProduct({
      sellerId, storeId: nearStore, title, description: 'Heavy duty barrow',
      category: 'building_materials', pricePerUnit: 250, availableQuantity: 1,
      lat: KUMASI.lat, lng: KUMASI.lng,
    });
    await products.approveProduct(soldOut.id);
    await products.reserveStock(soldOut.id, 1);        // now sold out

    const r = await search.search({ query: title });

    const inStockHit = r.hits.find((h) => h.id === available.id);
    const soldOutHit = r.hits.find((h) => h.id === soldOut.id);
    expect(inStockHit).toBeTruthy();
    expect(soldOutHit).toBeTruthy();

    // Same relevance in every respect except stock — so stock decides.
    expect(inStockHit!.relevance).toBeGreaterThan(soldOutHit!.relevance);
    expect(r.hits.findIndex((h) => h.id === available.id))
      .toBeLessThan(r.hits.findIndex((h) => h.id === soldOut.id));
  });

  test('price sorting works both ways', async () => {
    const asc = await search.search({ category: 'building_materials', sort: 'price_asc' });
    const prices = asc.hits.map((h) => h.pricePerUnit);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));

    const desc = await search.search({ category: 'building_materials', sort: 'price_desc' });
    const dPrices = desc.hits.map((h) => h.pricePerUnit);
    expect(dPrices).toEqual([...dPrices].sort((a, b) => b - a));
  });

  test('asking to sort by distance without a location does not crash', async () => {
    const r = await search.search({ query: 'cement', sort: 'distance' });
    expect(r.hits.length).toBeGreaterThan(0);       // falls back to relevance
    expect(r.hits[0].distanceKm).toBeNull();
  });

  // ─── Autocomplete ─────────────────────────────────────────────────────────

  test('autocomplete works from a prefix — and from a typo', async () => {
    const prefix = await search.suggest('cem');
    expect(prefix.length).toBeGreaterThan(0);
    expect(prefix.some((s) => /cement/i.test(s.suggestion))).toBe(true);

    const typo = await search.suggest('roofin');
    expect(typo.some((s) => /roofing/i.test(s.suggestion))).toBe(true);

    expect(await search.suggest('')).toEqual([]);
  });

  // ─── Nearby shops ─────────────────────────────────────────────────────────

  test('nearby shops come back closest-first, and far ones are excluded', async () => {
    const near = await search.storesNear(KUMASI.lat, KUMASI.lng, 30);
    expect(near.length).toBeGreaterThan(0);
    expect(near[0].distanceKm).toBeLessThan(30);

    const distances = near.map((s) => s.distanceKm);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));

    // The Accra shop is 200km away, so a 30km radius must not include it.
    expect(near.find((s) => s.id === farStore)).toBeUndefined();

    // Widen the radius and it appears. (A generous limit, because storesNear
    // returns the closest N — and on a shared test database plenty of other
    // shops sit at 0km.)
    const wide = await search.storesNear(KUMASI.lat, KUMASI.lng, 300, 500);
    const accra = wide.find((s) => s.id === farStore);
    expect(accra).toBeTruthy();
    expect(accra!.distanceKm).toBeGreaterThan(180);
  });

  // ─── Unmet demand: the money-making report ────────────────────────────────

  test('searches that find nothing are captured as unmet demand', async () => {
    // Three people look for something nobody sells.
    for (let i = 0; i < 3; i++) {
      await search.search({ query: 'solar inverter test', region: 'Ashanti' });
    }
    await new Promise((r) => setTimeout(r, 250));   // the log write is fire-and-forget

    const demand = await search.unmetDemand(30, 50);
    const row = demand.find((d) => d.query === 'solar inverter test');

    expect(row).toBeTruthy();
    expect(row!.searches).toBeGreaterThanOrEqual(3);
    expect(row!.regions).toContain('Ashanti');
  });

  test('successful searches feed the trending list', async () => {
    for (let i = 0; i < 3; i++) await search.search({ query: 'cement' });
    await new Promise((r) => setTimeout(r, 250));

    const hot = await search.trending(7, 20);
    expect(hot.some((t) => t.query === 'cement')).toBe(true);
  });

  // ─── Teaching it new words ────────────────────────────────────────────────

  test('a new local name can be taught, and immediately works', async () => {
    // A word the search has certainly never seen. (Unique per run — an earlier
    // run's alias persists in the database, which would make this pass for the
    // wrong reason.)
    const madeUpWord = `zzk${uniq().slice(-6)}`;

    const before = await search.search({ query: madeUpWord });
    expect(before.hits.some((h) => h.id === timberId)).toBe(false);   // unknown word

    await search.addAlias(madeUpWord, 'iroko hardwood');

    const after = await search.search({ query: madeUpWord });
    expect(after.hits.some((h) => h.id === timberId)).toBe(true);     // it learnt
    expect(after.hits.find((h) => h.id === timberId)!.matchedBy).toBe('local_name');
  });
});
