import { Router } from 'express';
import { Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { q } from '../db/pg';

const router = Router();
router.use(authenticate);

/** GET /api/licenses/mine — my subscription and when it runs out. */
router.get('/mine', async (req: AuthRequest, res: Response) => {
  try {
    const [sub] = await q<any>(
      `SELECT status, plan, amount, trial_ends_at, current_period_end, last_paid_at
         FROM subscriptions WHERE user_id = $1::uuid`,
      [req.user.id],
    );
    if (!sub) { res.json({ subscription: null }); return; }

    const endsAt = sub.current_period_end ?? sub.trial_ends_at;
    const daysLeft = endsAt
      ? Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000)
      : null;

    res.json({
      subscription: {
        status: sub.status,
        plan: sub.plan,
        amount: Number(sub.amount),
        trialEndsAt: sub.trial_ends_at,
        currentPeriodEnd: sub.current_period_end,
        lastPaidAt: sub.last_paid_at,
        daysLeft,
        // Everyone's first year is free.
        inFreeYear: sub.status === 'trial',
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

/** Officer view: who is about to lapse. */
router.get('/expiring', async (req: AuthRequest, res: Response) => {
  try {
    if (['buyer', 'seller', 'rider', 'driver'].includes(req.user.role)) {
      res.status(403).json({ error: 'Officer access only.' }); return;
    }
    const rows = await q<any>(
      `SELECT u.full_name, u.email, u.phone, u.role, u.region,
              s.status, s.amount, s.current_period_end
         FROM subscriptions s JOIN users u ON u.id = s.user_id
        WHERE s.current_period_end IS NOT NULL
          AND s.current_period_end < now() + INTERVAL '30 days'
        ORDER BY s.current_period_end ASC LIMIT 100`,
    );
    res.json({ expiring: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
