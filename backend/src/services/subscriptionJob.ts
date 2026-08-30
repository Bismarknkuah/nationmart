import cron from 'node-cron';
import { q } from '../db/pg';
import { notify } from '../repos/notificationRepo';

/**
 * Nightly subscription housekeeping.
 *
 * Everyone's first year is free (TRIAL_DAYS=365). When a trial ends, the account
 * moves to 'past_due' rather than being cut off instantly — sellers get a
 * warning and a chance to pay before their listings go dark.
 */
export function startSubscriptionJob(): void {
  if (process.env.DISABLE_CRON === 'true') return;

  cron.schedule('30 1 * * *', async () => {
    try {
      // Trials that have now run out.
      const lapsed = await q<any>(
        `UPDATE subscriptions s
            SET status = 'past_due'
          WHERE s.status = 'trial'
            AND s.trial_ends_at IS NOT NULL
            AND s.trial_ends_at < now()
          RETURNING s.user_id, s.amount`,
      );

      for (const row of lapsed) {
        await notify({
          userId: row.user_id,
          type: 'subscription_due',
          title: 'Your free year has ended',
          message: `Your first year on NationMart is up. A yearly subscription of GHS ${Number(row.amount)} keeps your listings live. You can pay from your dashboard.`,
          link: '/seller/dues',
        });
      }

      // Paid subscriptions whose period has elapsed.
      const expired = await q<any>(
        `UPDATE subscriptions
            SET status = 'past_due'
          WHERE status = 'active'
            AND current_period_end IS NOT NULL
            AND current_period_end < now()
          RETURNING user_id`,
      );

      if (lapsed.length || expired.length) {
        console.log(`[subscriptions] ${lapsed.length} trial(s) ended, ${expired.length} lapsed`);
      }
    } catch (err: any) {
      console.error('[subscriptions] job failed:', err?.message);
    }
  });
}

export default startSubscriptionJob;
