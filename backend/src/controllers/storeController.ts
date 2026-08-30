import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as st from '../repos/storeRepo';

/** POST /api/stores — a seller may hold at most 2 (enforced by the database). */
export const createStore = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const store = await st.createStore({
      ownerId: req.user.id,
      name: req.body.name,
      type: req.body.type,
      description: req.body.description,
      country: req.body.country ?? req.user.country,
      region: req.body.region ?? req.user.region,
      district: req.body.district ?? req.user.district,
      address: req.body.address,
      lat: req.body.lat, lng: req.body.lng,
      logoUrl: req.body.logoUrl ?? req.body.theme?.logoUrl,
      bannerUrl: req.body.bannerUrl ?? req.body.theme?.bannerUrl,
      theme: req.body.theme,
      marketScope: req.body.marketScope,
    });
    res.status(201).json({ store: st.publicStore(store) });
  } catch (err: any) {
    const isLimit = /STORE_LIMIT/.test(err.message);
    res.status(isLimit ? 409 : 400).json({
      error: isLimit ? `You may own at most ${st.MAX_STORES} stores.` : err.message,
    });
  }
};

/** GET /api/stores/mine */
export const myStores = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stores = await st.myStores(req.user.id);
    res.json({ stores: stores.map(st.publicStore), max: st.MAX_STORES });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/stores — public browse. */
export const listStores = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stores = await st.browseStores({
      region: req.query.region as string | undefined,
      district: req.query.district as string | undefined,
      type: req.query.type as string | undefined,
      query: req.query.q as string | undefined,
      limit: Number(req.query.limit) || 40,
    });
    res.json({ stores: stores.map(st.publicStore) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/stores/:slug — the storefront, with its live listings. */
export const getStorefront = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const front = await st.storefront(req.params.slug);
    if (!front) { res.status(404).json({ error: 'Store not found.' }); return; }
    res.json({ store: st.publicStore(front.store), products: front.products });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** PATCH /api/stores/:id — owner only. */
export const updateStore = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const store = await st.updateStore(req.params.id, req.user.id, req.body);
    if (!store) { res.status(404).json({ error: 'Store not found, or not yours.' }); return; }
    res.json({ store: st.publicStore(store) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

/** Officer creates a store on behalf of a seller who cannot do it themselves. */
export const createStoreFor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!/admin|officer|commerce|ceo|coo/i.test(req.user.role)) {
      res.status(403).json({ error: 'Officer access only.' }); return;
    }
    const { ownerId } = req.body;
    if (!ownerId) { res.status(400).json({ error: 'A seller is required.' }); return; }
    const store = await st.createStore({ ...req.body, ownerId });
    res.status(201).json({ store: st.publicStore(store) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const listStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await st.canManage(req.params.id, req.user.id))) {
      res.status(403).json({ error: 'Not your store.' }); return;
    }
    res.json({ staff: await st.listStaff(req.params.id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const addStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const store = await st.findById(req.params.id);
    if (!store || store.owner_id !== req.user.id) {
      res.status(403).json({ error: 'Only the owner can add staff.' }); return;
    }
    await st.addStaff(req.params.id, req.body.userId, req.body.role || 'staff', req.body.permissions || []);
    res.json({ staff: await st.listStaff(req.params.id) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const removeStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const store = await st.findById(req.params.id);
    if (!store || store.owner_id !== req.user.id) {
      res.status(403).json({ error: 'Only the owner can remove staff.' }); return;
    }
    await st.removeStaff(req.params.id, req.params.userId);
    res.json({ message: 'Removed' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

// ─── Extras ──────────────────────────────────────────────────────────────────
import { q } from '../db/pg';

export const browseStores = listStores;
export const updateStaff = addStaff;

/** The permissions a store owner can hand to their staff. */
export const listPermissions = (_req: AuthRequest, res: Response): void => {
  res.json({
    permissions: [
      { key: 'orders',     label: 'View and manage orders' },
      { key: 'inventory',  label: 'Add and edit listings' },
      { key: 'pricing',    label: 'Change prices and discounts' },
      { key: 'deliveries', label: 'Arrange deliveries' },
      { key: 'messages',   label: 'Reply to customers' },
      { key: 'finance',    label: 'See sales and payouts' },
    ],
  });
};

/** GET /api/stores/:id/analytics — how the shop is actually doing. */
export const storeAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await st.canManage(req.params.id, req.user.id))) {
      res.status(403).json({ error: 'Not your store.' }); return;
    }

    const [stats] = await q<any>(
      `SELECT
         (SELECT count(*) FROM products p WHERE p.store_id = $1::uuid
            AND p.status = 'active')                                        AS live_listings,
         (SELECT count(*) FROM orders o WHERE o.store_id = $1::uuid)        AS orders,
         (SELECT count(*) FROM orders o WHERE o.store_id = $1::uuid
            AND o.payment_status = 'paid')                                  AS paid_orders,
         (SELECT COALESCE(SUM(o.total_amount),0) FROM orders o
           WHERE o.store_id = $1::uuid AND o.payment_status = 'paid')       AS revenue,
         (SELECT COALESCE(SUM(p.view_count),0) FROM products p
           WHERE p.store_id = $1::uuid)                                     AS views`,
      [req.params.id],
    );

    const best = await q<any>(
      `SELECT p.title, count(i.id) AS sold,
              COALESCE(SUM(i.subtotal),0) AS revenue
         FROM products p
         LEFT JOIN order_items i ON i.product_id = p.id
        WHERE p.store_id = $1::uuid
        GROUP BY p.id, p.title
        ORDER BY sold DESC, revenue DESC
        LIMIT 5`,
      [req.params.id],
    );

    const orders = Number(stats.orders);
    const views = Number(stats.views);

    res.json({
      liveListings: Number(stats.live_listings),
      orders,
      paidOrders: Number(stats.paid_orders),
      revenue: Number(stats.revenue),
      views,
      // A rough read on how well the storefront converts lookers into buyers.
      conversionPercent: views > 0 ? Number(((orders / views) * 100).toFixed(2)) : 0,
      bestSellers: best.map((b) => ({
        title: b.title, sold: Number(b.sold), revenue: Number(b.revenue),
      })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** POST /api/stores/:id/bulk-upload — CSV/JSON import of listings. */
export const bulkUpload = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await st.canManage(req.params.id, req.user.id))) {
      res.status(403).json({ error: 'Not your store.' }); return;
    }
    res.json({
      message: 'Send the listings to POST /api/products/bulk with { products: [...] }.',
      storeId: req.params.id,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};
