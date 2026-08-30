import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getWallet, findWalletDrift, walletOverview, postWalletTxn, userIdFromMongo } from '../db/pg';

const isFinance = (r: string) =>
  /finance|account|cfo|ceo|coo/i.test(r) || r === 'admin';

/** GET /api/wallet/mine */
export const myWallet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { wallet, transactions } = await getWallet(req.user.id, 50);
    res.json({ wallet, transactions });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/wallet/overview — finance: who we owe, who owes us. */
export const walletOverviewHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isFinance(req.user.role)) { res.status(403).json({ error: 'Finance access required.' }); return; }
    res.json(await walletOverview());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/**
 * GET /api/wallet/integrity — prove the books balance.
 * Any row returned means a wallet disagrees with its ledger. Must always be empty.
 */
export const walletIntegrity = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isFinance(req.user.role)) { res.status(403).json({ error: 'Finance access required.' }); return; }
    const drift = await findWalletDrift();
    res.json({ ok: drift.length === 0, driftCount: drift.length, drift });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** POST /api/wallet/settle — finance pays a user out, or writes off what they owe. */
export const settleWallet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isFinance(req.user.role)) { res.status(403).json({ error: 'Finance access required.' }); return; }
    const { userId, amount, note } = req.body;
    const value = Number(amount);
    if (!userId || !value || value <= 0) {
      res.status(400).json({ error: 'A user and a positive amount are required.' }); return;
    }
    const balance = await postWalletTxn({
      userId, type: 'debit', category: 'payout',
      amount: value, description: note || 'Settled by finance',
    });
    res.json({ message: 'Settled', balance });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export { walletOverviewHandler as walletOverview };
