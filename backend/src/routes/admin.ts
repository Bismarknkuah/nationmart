import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { listUsers, setAccountStatus, trustScore } from '../controllers/userController';
import { approveUser, platformStats, officeStats } from '../repos/managementRepo';
import { AuthRequest } from '../middleware/auth';
import { Response } from 'express';
import { q } from '../db/pg';

const router = Router();
router.use(authenticate);

const officerOnly = (req: AuthRequest, res: Response, next: any) => {
  if (['buyer', 'seller', 'rider', 'driver'].includes(req.user.role)) {
    res.status(403).json({ error: 'Officer access only.' });
    return;
  }
  next();
};
router.use(officerOnly as any);

/** Riders and drivers awaiting approval. */
router.get('/pending-users', async (req: AuthRequest, res: Response) => {
  try {
    const users = await q<any>(
      `SELECT id, full_name, email, phone, role, region, district,
              vehicle_license, ghana_card_status, pending_reason, created_at
         FROM users
        WHERE is_approved = FALSE AND account_status = 'pending_review'
        ORDER BY created_at ASC LIMIT 100`,
    );
    res.json({ users });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/users/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const user = await approveUser(req.params.id);
    if (!user) { res.status(404).json({ error: 'User not found.' }); return; }
    await q(
      `INSERT INTO notifications (user_id, type, title, message, link)
       VALUES ($1::uuid, 'system', 'Account approved',
               'You are approved and can now accept jobs on NationMart.', '/rider/office')`,
      [req.params.id],
    ).catch(() => {});
    res.json({ message: `${user.full_name} approved.`, user });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/users', listUsers as any);
router.patch('/users/:id/status', setAccountStatus as any);
router.get('/users/:id/trust', trustScore as any);

/** Listings waiting for review. */
router.get('/pending-products', async (_req: AuthRequest, res: Response) => {
  try {
    const products = await q<any>(
      `SELECT p.id, p.title, p.price_per_unit, p.category, p.images, p.created_at,
              u.full_name AS seller, s.name AS store
         FROM products p
         JOIN users u ON u.id = p.seller_id
         LEFT JOIN stores s ON s.id = p.store_id
        WHERE p.status = 'pending_review'
        ORDER BY p.created_at ASC LIMIT 100`,
    );
    res.json({ products });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

/** The security desk: recent logins and account actions. */
router.get('/audit', async (req: AuthRequest, res: Response) => {
  try {
    const logs = await q<any>(
      `SELECT a.action, a.summary, a.actor_role, a.ip_address, a.created_at,
              u.full_name AS actor
         FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
        WHERE ($1::text IS NULL OR a.action = $1)
        ORDER BY a.created_at DESC LIMIT 200`,
      [req.query.action ?? null],
    );
    res.json({ logs });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try { res.json(await platformStats()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/office', async (_req: AuthRequest, res: Response) => {
  try { res.json(await officeStats()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
