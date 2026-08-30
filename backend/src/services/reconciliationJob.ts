import cron from 'node-cron';
import { findWalletDrift } from '../db/pg';

/**
 * Nightly proof that the books balance.
 *
 * Every wallet's balance must equal the sum of its ledger entries. The
 * wallet_drift view returns any that disagree — it must always be empty. If it
 * ever isn't, that is a money bug, and it gets shouted about immediately.
 */
export function startReconciliationJob(): void {
  if (process.env.DISABLE_CRON === 'true') return;

  cron.schedule('15 2 * * *', async () => {
    try {
      const drift = await findWalletDrift();
      if (drift.length === 0) {
        console.log('[reconciliation] ✅ all wallets balance');
        return;
      }
      console.error(
        `[reconciliation] 🚨 ${drift.length} wallet(s) disagree with the ledger:`,
        JSON.stringify(drift, null, 2),
      );
    } catch (err: any) {
      console.error('[reconciliation] job failed:', err?.message);
    }
  });
}

export default startReconciliationJob;
