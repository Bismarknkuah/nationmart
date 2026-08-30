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
