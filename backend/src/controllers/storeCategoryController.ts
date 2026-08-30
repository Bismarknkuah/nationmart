import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { storeCategories } from '../repos/platformRepo';

const canManage = (r: string) => /admin|ceo|coo|commerce|operations/i.test(r);

export const listCategories = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const all = req.query.all === 'true' && canManage(req.user?.role || '');
    res.json({ categories: await storeCategories.list(!all) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const upsertCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!canManage(req.user.role)) { res.status(403).json({ error: 'Not authorized.' }); return; }
    const { key, label, tagline, imageUrl, active, sortOrder } = req.body;
    if (!key || !label) { res.status(400).json({ error: 'A key and label are required.' }); return; }
    res.json({ category: await storeCategories.upsert({ key, label, tagline, imageUrl, active, sortOrder }) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const deleteCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!canManage(req.user.role)) { res.status(403).json({ error: 'Not authorized.' }); return; }
    const ok = await storeCategories.remove(req.params.key);
    if (!ok) { res.status(404).json({ error: 'Category not found.' }); return; }
    res.json({ message: 'Deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};
