import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { financeOverview } from '../repos/managementRepo';
import { findWalletDrift, postWalletTxn } from '../db/pg';

const isFinance = (r: string) => /finance|account|cfo|ceo|coo|admin/i.test(r);

export const overview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isFinance(req.user.role)) { res.status(403).json({ error: 'Finance access required.' }); return; }
    res.json(await financeOverview());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** The books must balance. Any drift here means a wallet disagrees with its ledger. */
export const integrity = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isFinance(req.user.role)) { res.status(403).json({ error: 'Finance access required.' }); return; }
    const drift = await findWalletDrift();
    res.json({ ok: drift.length === 0, driftCount: drift.length, drift });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const payout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isFinance(req.user.role)) { res.status(403).json({ error: 'Finance access required.' }); return; }
    const { userId, amount, note } = req.body;
    const value = Number(amount);
    if (!userId || !value || value <= 0) {
      res.status(400).json({ error: 'A user and a positive amount are required.' }); return;
    }
    const balance = await postWalletTxn({
      userId, type: 'debit', category: 'payout',
      amount: value, description: note || 'Payout',
    });
    res.json({ message: 'Paid out', balance });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

// ─── Payment management console ──────────────────────────────────────────────
import { paymentOverview, recentTransactions } from '../repos/paymentRepo';
import { inFlight as payoutsInFlight } from '../repos/payoutRepo';

/** GET /api/finance/payments/overview — the money dashboard. */
export const paymentsOverview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isFinance(req.user.role)) { res.status(403).json({ error: 'Finance access required.' }); return; }
    const [overview, inFlight] = await Promise.all([paymentOverview(), payoutsInFlight()]);
    res.json({ ...overview, inFlight });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/finance/payments/transactions — the recent-payments feed. */
export const paymentsFeed = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isFinance(req.user.role)) { res.status(403).json({ error: 'Finance access required.' }); return; }
    const txns = await recentTransactions({
      status: req.query.status as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ transactions: txns });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export {
  listSalaryStructure, upsertSalaryStructure, payOfficer,
  listSalaryPayments, bulkPayOfficers,
} from './hrController';
export { financeOverview as financialSummary, aiMonthlyAnalysis } from './managementController';
