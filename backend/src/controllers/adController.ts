import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as ads from '../repos/adRepo';
import { levelOf } from '../services/roleAuthority';

const st = (err: any): number => ({
  NO_TITLE: 400, NO_SUBJECT: 400, BAD_BUDGET: 400,
  INSUFFICIENT_FUNDS: 422, NOT_FOUND: 404, NOT_OWNER: 403, CANNOT_RESUME: 409,
}[err?.code as string] ?? 400);

/** POST /api/ads — a seller funds and launches a campaign. */
export const create = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ad = await ads.createAd({ advertiserId: req.user.id, ...req.body });
    res.status(201).json({ ad, message: 'Your ad is live.' });
  } catch (err: any) { res.status(st(err)).json({ error: err.message }); }
};

/** GET /api/ads/mine — the advertiser's campaigns. */
export const mine = async (req: AuthRequest, res: Response): Promise<void> => {
  try { res.json({ ads: await ads.myAds(req.user.id) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const pause = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const r = await ads.stopAd(req.params.id, req.user.id, 'paused');
    res.json({ ...r, message: 'Ad paused.' });
  } catch (err: any) { res.status(st(err)).json({ error: err.message }); }
};

export const cancel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const r = await ads.stopAd(req.params.id, req.user.id, 'cancelled');
    res.json({ ...r, message: r.refunded > 0 ? `Cancelled. ₵${r.refunded} refunded to your wallet.` : 'Cancelled.' });
  } catch (err: any) { res.status(st(err)).json({ error: err.message }); }
};

export const resume = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ad = await ads.resumeAd(req.params.id, req.user.id);
    res.json({ ad, message: 'Ad resumed.' });
  } catch (err: any) { res.status(st(err)).json({ error: err.message }); }
};

/**
 * GET /api/ads/serve?placement=search&category=... — public.
 * Returns sponsored items to show, and records an impression for each.
 */
export const serve = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const placement = (req.query.placement as ads.AdPlacement) || 'search';
    const served = await ads.serveAds({
      placement,
      category: req.query.category as string | undefined,
      region: req.query.region as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    // Bill an impression per served ad (fire-and-forget; must not slow the page).
    served.forEach((a) => { ads.recordImpression(a.id).catch(() => {}); });
    res.json({ ads: served });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** POST /api/ads/:id/click — record a click (billed for per_click ads). */
export const click = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ads.recordClick(req.params.id);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/ads/admin/overview — platform-wide ad console. Admins only. */
export const adminOverview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (levelOf(req.user.role) > 4) { res.status(403).json({ error: 'Administrators only.' }); return; }
    res.json(await ads.adminOverview());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};
