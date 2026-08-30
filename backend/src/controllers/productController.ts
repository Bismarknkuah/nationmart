import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as prod from '../repos/productRepo';
import * as search from '../repos/searchRepo';

/**
 * GET /api/products — the storefront listing.
 *
 * Routed through the same typo-tolerant, distance-aware search as /api/search,
 * so a buyer browsing gets the same quality of results as one searching. Pass
 * lat/lng and nearby sellers rank first.
 */
export const listProducts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
    const result = await search.search({
      query: req.query.q as string | undefined,
      category: req.query.category as string | undefined,
      region: req.query.region as string | undefined,
      district: req.query.district as string | undefined,
      minPrice: n(req.query.minPrice),
      maxPrice: n(req.query.maxPrice),
      lat: n(req.query.lat),
      lng: n(req.query.lng),
      radiusKm: n(req.query.radiusKm),
      inStock: req.query.inStock === 'true',
      sort: req.query.sort as any,
      limit: n(req.query.limit) ?? 40,
      offset: n(req.query.offset) ?? 0,
      userId: req.user?.id,
    });
    res.json({
      products: result.hits,
      total: result.total,
      didYouMean: result.didYouMean,
      corrected: result.corrected,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/products/:id */
export const getProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const product = await prod.getWithStore(req.params.id);
    if (!product) { res.status(404).json({ error: 'Product not found.' }); return; }
    res.json({ product: prod.publicProduct(product) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** POST /api/products — new listings start in review. */
export const createProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const product = await prod.createProduct({
      sellerId: req.user.id,
      storeId: req.body.store || req.body.storeId,
      title: req.body.title,
      description: req.body.description,
      category: req.body.category,
      tags: req.body.tags,
      pricePerUnit: Number(req.body.pricePerUnit),
      unit: req.body.unit,
      discountPercent: Number(req.body.discountPercent) || 0,
      promoLabel: req.body.promoLabel,
      minimumOrder: Number(req.body.minimumOrder) || 1,
      availableQuantity: Number(req.body.availableQuantity) || 0,
      images: req.body.images,
      region: req.body.region ?? req.user.region,
      district: req.body.district ?? req.user.district,
      town: req.body.town,
      lat: req.body.lat, lng: req.body.lng,
      marketScope: req.body.marketScope,
      origin: req.body.origin,
      actorRole: req.user.role,
    });
    res.status(201).json({ product: prod.publicProduct(product) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

/** GET /api/products/mine */
export const myProducts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const products = await prod.myProducts(req.user.id);
    res.json({ products: products.map(prod.publicProduct) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** PATCH /api/products/:id — owner only. */
export const updateProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const product = await prod.updateProduct(req.params.id, req.user.id, req.body);
    if (!product) { res.status(404).json({ error: 'Product not found, or not yours.' }); return; }
    res.json({ product: prod.publicProduct(product) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

/** POST /api/products/:id/approve — officer publishes a pending listing. */
export const approveProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!/admin|officer|commerce|ceo|coo/i.test(req.user.role)) {
      res.status(403).json({ error: 'Officer access only.' }); return;
    }
    const product = await prod.approveProduct(req.params.id);
    if (!product) { res.status(404).json({ error: 'Nothing pending with that id.' }); return; }
    res.json({ product: prod.publicProduct(product) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

/** GET /api/products/low-stock */
export const lowStock = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const products = await prod.lowStock(req.user.id, Number(req.query.threshold) || 5);
    res.json({ products: products.map(prod.publicProduct) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** POST /api/products/:id/trace */
export const addTrace = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const product = await prod.addTraceability(req.params.id, {
      ...req.body, actor: req.user.id, actorRole: req.user.role,
    });
    if (!product) { res.status(404).json({ error: 'Product not found.' }); return; }
    res.json({ product: prod.publicProduct(product) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const deleteProduct = updateProduct;
export const duplicateProduct = createProduct;

// ─── Extras ──────────────────────────────────────────────────────────────────
export const getProducts = listProducts;
export const getProductById = getProduct;
export const getMyProducts = myProducts;
export const addTraceabilityEvent = addTrace;

/** GET /api/products/passport/:passportId — scan a product's passport. */
export const getByPassportId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const product = await prod.findByPassportId(req.params.passportId);
    if (!product) { res.status(404).json({ error: 'No product with that passport.' }); return; }
    res.json({ product: prod.publicProduct(product) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** POST /api/products/bulk — a seller imports many listings at once. */
export const bulkCreateProducts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const list = Array.isArray(req.body.products) ? req.body.products : [];
    if (!list.length) { res.status(400).json({ error: 'No products supplied.' }); return; }

    const created: any[] = [];
    const failed: any[] = [];
    for (const p of list) {
      try {
        const product = await prod.createProduct({
          sellerId: req.user.id,
          storeId: p.store || p.storeId,
          title: p.title,
          description: p.description,
          category: p.category,
          pricePerUnit: Number(p.pricePerUnit),
          unit: p.unit,
          availableQuantity: Number(p.availableQuantity) || 0,
          minimumOrder: Number(p.minimumOrder) || 1,
          images: p.images,
          region: p.region ?? req.user.region,
          district: p.district ?? req.user.district,
          origin: p.origin,
          actorRole: req.user.role,
        });
        created.push(prod.publicProduct(product));
      } catch (e: any) {
        failed.push({ title: p.title, error: e.message });
      }
    }
    res.status(201).json({ created: created.length, failed, products: created });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};
