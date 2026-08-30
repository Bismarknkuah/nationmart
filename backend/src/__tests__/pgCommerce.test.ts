/**
 * Commerce core tests — run against a REAL PostgreSQL database.
 *
 * The headline test is `never oversells under concurrent buyers`. The current
 * MongoDB code reads stock, then decrements it a moment later; two buyers racing
 * through that gap both pass the check and stock goes negative. These tests prove
 * the Postgres design makes that impossible.
 *
 * Skipped when TEST_DATABASE_URL is unset, so the normal suite runs without a DB.
 */
import { q, closePool, reserveStock, releaseStock, searchProducts } from '../db/pg';

const URL = process.env.TEST_DATABASE_URL;
const describeIfDb = URL ? describe : describe.skip;

describeIfDb('PostgreSQL commerce core', () => {
  let sellerId: string;
  let productId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    const [u] = await q<{ id: string }>(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Test Seller', $1, 'x', 'seller') RETURNING id`,
      [`seller-${Date.now()}@test.gh`],
    );
    sellerId = u.id;
  });

  afterAll(async () => {
    await q(`DELETE FROM users WHERE email LIKE '%@test.gh'`).catch(() => {});
    await closePool();
  });

  beforeEach(async () => {
    const [p] = await q<{ id: string }>(
      `INSERT INTO products (seller_id, title, description, category,
                             price_per_unit, available_quantity, region, district)
       VALUES ($1::uuid, 'Dangote Cement 50kg',
               'Strong cement for building foundations and walls',
               'building_materials', 75.00, 5, 'Ashanti', 'Kumasi Metropolitan')
       RETURNING id`,
      [sellerId],
    );
    productId = p.id;
  });

  // ─── The bug this migration exists to kill ────────────────────────────────
  test('never oversells under concurrent buyers', async () => {
    // 5 units in stock. 10 buyers all try to take 1 at the same instant.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => reserveStock(productId, 1)),
    );

    const sold = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;

    expect(sold).toBe(5);        // exactly the stock we had
    expect(rejected).toBe(5);    // the rest are turned away, not oversold

    const [p] = await q<any>(`SELECT available_quantity, status FROM products WHERE id = $1::uuid`, [productId]);
    expect(Number(p.available_quantity)).toBe(0);   // never negative
    expect(p.status).toBe('sold_out');              // flips itself
  });

  test('rejects a reservation larger than stock', async () => {
    await expect(reserveStock(productId, 6)).rejects.toThrow(/INSUFFICIENT_STOCK/);
    const [p] = await q<any>(`SELECT available_quantity FROM products WHERE id = $1::uuid`, [productId]);
    expect(Number(p.available_quantity)).toBe(5);   // untouched
  });

  test('rejects zero and negative quantities', async () => {
    await expect(reserveStock(productId, 0)).rejects.toThrow();
    await expect(reserveStock(productId, -3)).rejects.toThrow();
  });

  test('cancelling an order returns stock and reopens the listing', async () => {
    await reserveStock(productId, 5);
    let [p] = await q<any>(`SELECT available_quantity, status FROM products WHERE id=$1::uuid`, [productId]);
    expect(p.status).toBe('sold_out');

    await releaseStock(productId, 2);
    [p] = await q<any>(`SELECT available_quantity, status FROM products WHERE id=$1::uuid`, [productId]);
    expect(Number(p.available_quantity)).toBe(2);
    expect(p.status).toBe('active');   // back on sale
  });

  test('stock can never go negative, even by direct write', async () => {
    await expect(
      q(`UPDATE products SET available_quantity = -1 WHERE id = $1::uuid`, [productId]),
    ).rejects.toThrow();
  });

  // ─── Search ───────────────────────────────────────────────────────────────
  test('full-text search understands natural language', async () => {
    const hits = await searchProducts({ query: 'cement for building' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].title).toContain('Cement');
    expect(hits[0].rank).toBeGreaterThan(0);   // genuinely ranked, not a scan
  });

  test('search filters by category and region', async () => {
    const hits = await searchProducts({ category: 'building_materials', region: 'Ashanti' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.region === 'Ashanti')).toBe(true);

    const none = await searchProducts({ category: 'building_materials', region: 'Northern' });
    expect(none).toHaveLength(0);
  });

  test('search filters by price range', async () => {
    const cheap = await searchProducts({ maxPrice: 50 });
    expect(cheap.every((h) => Number(h.pricePerUnit) <= 50)).toBe(true);
  });

  // ─── Ratings ──────────────────────────────────────────────────────────────
  test('ratings are maintained by the database and cannot drift', async () => {
    const [b1] = await q<{ id: string }>(
      `INSERT INTO users (full_name,email,password_hash,role)
       VALUES ('B1',$1,'x','buyer') RETURNING id`, [`b1-${Date.now()}@test.gh`]);
    const [b2] = await q<{ id: string }>(
      `INSERT INTO users (full_name,email,password_hash,role)
       VALUES ('B2',$1,'x','buyer') RETURNING id`, [`b2-${Date.now()}@test.gh`]);

    await q(`INSERT INTO product_reviews (product_id,buyer_id,rating,comment)
             VALUES ($1::uuid,$2::uuid,5,'Excellent')`, [productId, b1.id]);
    await q(`INSERT INTO product_reviews (product_id,buyer_id,rating,comment)
             VALUES ($1::uuid,$2::uuid,4,'Good')`, [productId, b2.id]);

    let [p] = await q<any>(`SELECT rating_average, rating_count FROM products WHERE id=$1::uuid`, [productId]);
    expect(Number(p.rating_average)).toBe(4.5);
    expect(Number(p.rating_count)).toBe(2);

    // One buyer, one review.
    await expect(
      q(`INSERT INTO product_reviews (product_id,buyer_id,rating) VALUES ($1::uuid,$2::uuid,1)`,
        [productId, b1.id]),
    ).rejects.toThrow();

    // Deleting a review self-corrects the average — it cannot go stale.
    await q(`DELETE FROM product_reviews WHERE product_id=$1::uuid AND rating=4`, [productId]);
    [p] = await q<any>(`SELECT rating_average, rating_count FROM products WHERE id=$1::uuid`, [productId]);
    expect(Number(p.rating_average)).toBe(5);
    expect(Number(p.rating_count)).toBe(1);
  });
});
