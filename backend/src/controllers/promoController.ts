import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { promos } from '../repos/platformRepo';

export const createPromo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const promo = await promos.create({ ...req.body, storeId: req.body.storeId ?? null });
    res.status(201).json({ promo });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const listPromos = async (req: AuthRequest, res: Response): Promise<void> => {
  try { res.json({ promos: await promos.list(req.query.storeId as string | undefined) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** Check a code without spending it. */
export const validatePromo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const discount = await promos.claim(req.body.code, Number(req.body.orderTotal) || 0);
    res.json({ valid: true, discount });
  } catch {
    res.status(400).json({ valid: false, error: 'That code cannot be used on this order.' });
  }
};

export const deactivatePromo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ok = await promos.deactivate(req.params.code);
    if (!ok) { res.status(404).json({ error: 'Code not found.' }); return; }
    res.json({ message: 'Deactivated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const createPromotion = createPromo;
export const togglePromo = deactivatePromo;

export const listStorePromos = listPromos;

// ─── Admin/exec management console ───────────────────────────────────────────
import { levelOf } from '../services/roleAuthority';

const isManager = (role: string) => levelOf(role) <= 4;   // district admin & up

/** GET /api/promos/overview — every promo with usage & live status. */
export const promoOverview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isManager(req.user.role)) { res.status(403).json({ error: 'Administrators only.' }); return; }
    const platformOnly = req.query.scope !== 'all';   // default: platform campaigns
    res.json(await promos.overview({ platformOnly }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/**
 * POST /api/promos/campaign — create a PLATFORM-WIDE promo (store_id null).
 * Only admins/execs can run platform campaigns; sellers use the store promo route.
 */
export const createCampaign = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isManager(req.user.role)) { res.status(403).json({ error: 'Administrators only.' }); return; }
    const { code, discountPercent, discountAmount, minOrder, maxUses, expiresAt } = req.body;
    if (!code?.trim()) { res.status(400).json({ error: 'A code is required.' }); return; }
    if (!discountPercent && !discountAmount) {
      res.status(400).json({ error: 'Set either a percent or a fixed amount.' }); return;
    }
    if (discountPercent && discountAmount) {
      res.status(400).json({ error: 'Choose one discount type, not both.' }); return;
    }
    const promo = await promos.create({
      code: code.toUpperCase().trim(), storeId: null,
      discountPercent: discountPercent ? Number(discountPercent) : undefined,
      discountAmount: discountAmount ? Number(discountAmount) : undefined,
      minOrder: minOrder ? Number(minOrder) : 0,
      maxUses: maxUses ? Number(maxUses) : undefined,
      expiresAt: expiresAt || undefined,
    });
    res.status(201).json({ promo, message: `Campaign ${code.toUpperCase()} is live.` });
  } catch (err: any) {
    // Unique-violation = duplicate code.
    if (err?.code === '23505') { res.status(409).json({ error: 'That code already exists.' }); return; }
    res.status(400).json({ error: err.message });
  }
};

/** PATCH /api/promos/:code/active — pause or resume a campaign. */
export const setPromoActive = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isManager(req.user.role)) { res.status(403).json({ error: 'Administrators only.' }); return; }
    const promo = await promos.setActive(req.params.code, !!req.body.active);
    if (!promo) { res.status(404).json({ error: 'Code not found.' }); return; }
    res.json({ promo, message: req.body.active ? 'Resumed.' : 'Paused.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};
