import cron from 'node-cron';
import { q } from '../db/pg';
import { notify } from '../repos/notificationRepo';

/**
 * Nightly: warn sellers and partners whose yearly subscription is nearly up.
 * Everyone's first year is free, so this mostly fires from year two onward.
 */
export function startLicenseExpiryJob(): void {
  if (process.env.DISABLE_CRON === 'true') return;

  cron.schedule('0 7 * * *', async () => {
    try {
      const due = await q<any>(
        `SELECT s.user_id, s.current_period_end, u.full_name
           FROM subscriptions s JOIN users u ON u.id = s.user_id
          WHERE s.status IN ('trial','active')
            AND s.current_period_end IS NOT NULL
            AND s.current_period_end BETWEEN now() AND now() + INTERVAL '14 days'`,
      );
      for (const row of due) {
        await notify({
          userId: row.user_id,
          type: 'subscription_due',
          title: 'Your subscription is due soon',
          message: `Your NationMart subscription ends on ${new Date(row.current_period_end).toDateString()}. Renew to keep your listings live.`,
          link: '/seller/dues',
        });
      }
      if (due.length) console.log(`[licenses] reminded ${due.length} account(s)`);
    } catch (err: any) {
      console.error('[licenses] job failed:', err?.message);
    }
  });
}

export default startLicenseExpiryJob;
