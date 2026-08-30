import cron from 'node-cron';
import { q } from '../db/pg';
import { notify } from '../repos/notificationRepo';
import { workflows } from '../repos/platformRepo';

/**
 * Disputes must not rot.
 *
 * A dispute freezes a seller's money. If nobody decides it, the seller is out of
 * pocket indefinitely and the buyer gets no answer — the worst outcome for
 * everyone. So every morning we surface the ones that have blown their SLA and
 * raise a workflow task against them.
 */
export function startDisputeSlaJob(): void {
  if (process.env.DISABLE_CRON === 'true') return;

  cron.schedule('0 8 * * *', async () => {
    try {
      const overdue = await q<any>(
        `SELECT d.id, d.reference, d.order_id, d.raised_by, d.against_user,
                o.order_number, o.total_amount,
                EXTRACT(DAY FROM now() - d.due_at)::int AS days_late
           FROM disputes d JOIN orders o ON o.id = d.order_id
          WHERE d.status IN ('open','investigating')
            AND d.due_at < now()`,
      );

      for (const d of overdue) {
        await workflows.start({
          definitionKey: 'fraud_investigation',
          title: `Overdue dispute ${d.reference} (${d.days_late}d late) — GHS ${Number(d.total_amount)} held`,
          priority: d.days_late > 7 ? 1 : 2,
          payload: { disputeId: d.id, orderNumber: d.order_number },
        });

        // Both parties are told it's still being handled. Silence is corrosive.
        await notify({
          userId: d.raised_by, type: 'system',
          title: `Your dispute is still open · ${d.reference}`,
          message: 'Sorry for the delay. It has been escalated and an officer will decide shortly.',
          link: '/disputes',
        });
      }

      if (overdue.length) {
        console.error(`[disputes] 🚨 ${overdue.length} overdue — money is frozen and nobody has decided`);
      }
    } catch (err: any) {
      console.error('[disputes] SLA job failed:', err?.message);
    }
  });
}

export default startDisputeSlaJob;
