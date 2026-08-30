import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as po from '../repos/payoutRepo';
import { getBalance } from '../db/pg';
import { notify } from '../repos/notificationRepo';
import {
  listBanks, resolveAccount, createTransferRecipient, initiateTransfer,
} from '../services/paystackService';

const status = (err: any): number => ({
  NO_METHOD: 404,
  BAD_AMOUNT: 400, BAD_NETWORK: 400, BAD_PHONE: 400,
  BELOW_MINIMUM: 422, INSUFFICIENT_FUNDS: 422,
  NOT_PAYABLE: 422, UNVERIFIED: 422,
  LAST_PAYOUT_METHOD: 409,
}[err?.code as string] ?? 400);

// ─── Saved methods ───────────────────────────────────────────────────────────

/** GET /api/payment-methods — what this person can pay with, and be paid to. */
export const listMethods = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const methods = await po.listMethods(req.user.id);
    res.json({ methods: methods.map(po.publicMethod) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** POST /api/payment-methods/momo — { phone, network } */
export const addMomo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const method = await po.saveMomo(req.user.id, req.body.phone, req.body.network);
    res.status(201).json({ method: po.publicMethod(method) });
  } catch (err: any) { res.status(status(err)).json({ error: err.message }); }
};

/**
 * GET /api/payment-methods/banks
 * The banks and MoMo networks we can pay out to in Ghana.
 */
export const banks = async (_req: AuthRequest, res: Response): Promise<void> => {
  try { res.json({ banks: await listBanks() }); }
  catch (err: any) { res.status(502).json({ error: err.message }); }
};

/**
 * POST /api/payment-methods/bank/resolve — { accountNumber, bankCode }
 *
 * Ask the bank whose account this is BEFORE any money is sent. The user then
 * confirms the name the bank returned. We never trust the name they typed —
 * this check is what stops a mistyped digit becoming a stranger's windfall.
 */
export const resolveBankAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountNumber, bankCode } = req.body;
    if (!accountNumber || !bankCode) {
      res.status(400).json({ error: 'An account number and bank are required.' });
      return;
    }
    const result = await resolveAccount(String(accountNumber), String(bankCode));
    if (!result.ok) {
      res.status(422).json({
        error: result.message || 'That account could not be verified. Check the number.',
      });
      return;
    }
    res.json({
      accountName: result.accountName,
      confirm: `Money will be sent to ${result.accountName}. Is that right?`,
    });
  } catch (err: any) { res.status(502).json({ error: err.message }); }
};

/** POST /api/payment-methods/bank — { accountNumber, bankCode, bankName } */
export const addBankAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountNumber, bankCode, bankName } = req.body;
    if (!accountNumber || !bankCode) {
      res.status(400).json({ error: 'An account number and bank are required.' });
      return;
    }

    // Re-resolve server-side. A client could otherwise post any name it liked.
    const resolved = await resolveAccount(String(accountNumber), String(bankCode));
    if (!resolved.ok || !resolved.accountName) {
      res.status(422).json({
        error: resolved.message || 'That account could not be verified with the bank.',
      });
      return;
    }

    const method = await po.saveBankAccount(req.user.id, {
      accountNumber: String(accountNumber),
      bankCode: String(bankCode),
      bankName: String(bankName || 'Bank'),
      accountName: resolved.accountName,
    });
    res.status(201).json({ method: po.publicMethod(method) });
  } catch (err: any) { res.status(status(err)).json({ error: err.message }); }
};

export const setDefaultMethod = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const method = await po.setDefault(req.params.id, req.user.id);
    if (!method) { res.status(404).json({ error: 'Payment method not found.' }); return; }
    res.json({ method: po.publicMethod(method) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const removeMethod = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ok = await po.removeMethod(req.params.id, req.user.id, req.user.role);
    if (!ok) { res.status(404).json({ error: 'Payment method not found.' }); return; }
    res.json({ message: 'Removed.' });
  } catch (err: any) { res.status(status(err)).json({ error: err.message }); }
};

// ─── Payouts ─────────────────────────────────────────────────────────────────

/** GET /api/payouts/mine — my withdrawals, and what I can withdraw. */
export const myPayouts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [payouts, balance] = await Promise.all([
      po.myPayouts(req.user.id),
      getBalance(req.user.id),
    ]);
    res.json({
      payouts: payouts.map(po.publicPayout),
      available: balance,
      minimum: po.MIN_PAYOUT_GHS,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/**
 * POST /api/payouts — { methodId, amount }
 *
 * A seller or rider withdraws their earnings to mobile money or a bank account.
 *
 * The wallet is debited FIRST, inside the same transaction that records the
 * payout. If Paystack then refuses the transfer, we put the money straight back.
 * The alternative — transfer first, debit after — loses money the moment the
 * process dies between the two steps.
 */
export const requestPayout = async (req: AuthRequest, res: Response): Promise<void> => {
  let payout: po.PayoutRow | null = null;

  try {
    const { methodId, amount } = req.body;

    payout = await po.requestPayout({
      userId: req.user.id,
      methodId,
      amount: Number(amount),
      requestedBy: req.user.id,
    });

    const method = await po.findMethod(methodId, req.user.id);

    // Register the destination with Paystack the first time we pay it.
    let recipientCode = method!.recipient_code;
    if (!recipientCode) {
      const recipient = await createTransferRecipient({
        type: method!.kind === 'mobile_money' ? 'mobile_money' : 'ghipss',
        name: method!.account_name || req.user.fullName,
        accountNumber: method!.kind === 'mobile_money'
          ? method!.momo_phone!
          : method!.account_number!,
        bankCode: method!.kind === 'mobile_money'
          ? ({ mtn: 'MTN', telecel: 'VOD', airteltigo: 'ATL' }[method!.momo_network!] || 'MTN')
          : method!.bank_code!,
      });

      if (!recipient.ok || !recipient.recipientCode) {
        await po.reversePayout(payout.reference, 'failed',
          recipient.message || 'The payout destination was rejected.');
        res.status(422).json({
          error: recipient.message || 'That payout destination was rejected. Your money is untouched.',
        });
        return;
      }
      recipientCode = recipient.recipientCode;
      await po.setRecipientCode(method!.id, recipientCode);
    }

    const transfer = await initiateTransfer({
      recipientCode,
      amount: Number(payout.amount),
      reference: payout.reference,
      reason: 'NationMart withdrawal',
    });

    if (!transfer.ok) {
      // Money never left. Give it back immediately — do not leave it in limbo.
      await po.reversePayout(payout.reference, 'failed', transfer.message);
      res.status(502).json({
        error: 'The withdrawal could not be sent. Your money is back in your wallet.',
        detail: transfer.message,
      });
      return;
    }

    await po.markProcessing(payout.reference, transfer.transferCode!, recipientCode);

    await notify({
      userId: req.user.id,
      type: 'system',
      title: `Withdrawal sent · GHS ${Number(payout.amount).toLocaleString()}`,
      message: `Your withdrawal to ${payout.destination} is on its way. We will confirm when it lands.`,
      link: '/wallet',
    });

    res.status(201).json({
      payout: { ...po.publicPayout(payout), status: 'processing' },
      message: 'Withdrawal sent. It usually lands within minutes.',
    });
  } catch (err: any) {
    // If the payout row exists, the wallet was already debited — return it.
    if (payout) {
      await po.reversePayout(payout.reference, 'failed', err.message)
        .catch(() => { /* the reconciliation job will catch anything left stranded */ });
    }
    res.status(status(err)).json({ error: err.message });
  }
};

/** GET /api/payouts/in-flight — finance: money out of the wallets, not yet landed. */
export const inFlight = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!/finance|account|cfo|ceo|coo|admin/i.test(req.user.role)) {
      res.status(403).json({ error: 'Finance access required.' });
      return;
    }
    res.json({ inFlight: await po.inFlight() });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};
