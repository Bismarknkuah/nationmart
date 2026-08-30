import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as search from '../repos/searchRepo';

const isOfficer = (r: string) =>
  !['buyer', 'seller', 'rider', 'driver', 'reseller', 'wholesaler', 'manufacturer'].includes(r);

const num = (v: any): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * GET /api/search
 * Typo-tolerant, local-name aware, distance-ranked product search.
 * Pass lat/lng to sort by proximity — a shop 2km away beats one 200km away.
 */
export const searchProducts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await search.search({
      query: req.query.q as string | undefined,
      category: req.query.category as string | undefined,
      region: req.query.region as string | undefined,
      district: req.query.district as string | undefined,
      minPrice: num(req.query.minPrice),
      maxPrice: num(req.query.maxPrice),
      lat: num(req.query.lat),
      lng: num(req.query.lng),
      radiusKm: num(req.query.radiusKm),
      inStock: req.query.inStock === 'true',
      sort: req.query.sort as any,
      limit: num(req.query.limit),
      offset: num(req.query.offset),
      userId: req.user?.id,
    });

    res.json({
      products: result.hits,
      total: result.total,
      didYouMean: result.didYouMean,
      // True when nothing matched exactly and we guessed at a misspelling —
      // the UI can say "showing results for cement".
      corrected: result.corrected,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/search/suggest?q=cem — autocomplete, typo-tolerant. */
export const suggest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const suggestions = await search.suggest(
      String(req.query.q || ''), num(req.query.limit) ?? 8);
    res.json({ suggestions });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/search/stores-near?lat=&lng=&radiusKm= */
export const storesNear = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lat = num(req.query.lat);
    const lng = num(req.query.lng);
    if (lat == null || lng == null) {
      res.status(400).json({ error: 'A latitude and longitude are required.' });
      return;
    }
    const shops = await search.storesNear(
      lat, lng, num(req.query.radiusKm) ?? 25, num(req.query.limit) ?? 20);
    res.json({ stores: shops });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/search/trending */
export const trending = async (req: AuthRequest, res: Response): Promise<void> => {
  try { res.json({ trending: await search.trending(num(req.query.days) ?? 7) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
};

/**
 * GET /api/search/unmet-demand
 *
 * Searches that returned NOTHING. This is the most commercially useful report on
 * the platform: a list of things people came here to buy and could not. Every
 * row is a gap a seller could fill — and a sale NationMart didn't make.
 */
export const unmetDemand = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const demand = await search.unmetDemand(num(req.query.days) ?? 30);
    res.json({
      unmetDemand: demand,
      note: 'People searched for these and found nothing. Each one is a supply gap.',
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** Teach the search a local name: "kokonte" → "cassava". */
export const addAlias = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const { alias, canonical } = req.body;
    if (!alias || !canonical) {
      res.status(400).json({ error: 'Both an alias and what it means are required.' });
      return;
    }
    const added = await search.addAlias(alias, canonical);
    res.status(201).json({ alias: added, message: `"${alias}" now finds "${canonical}".` });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const listAliases = async (_req: AuthRequest, res: Response): Promise<void> => {
  try { res.json({ aliases: await search.listAliases() }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
};
