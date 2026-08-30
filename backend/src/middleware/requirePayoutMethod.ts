import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { hasPayoutMethod, needsPayoutMethod } from '../repos/payoutRepo';

/**
 * A seller must have somewhere to be paid before they can sell.
 *
 * Without this, a shop can list goods, take a buyer's money into escrow, deliver
 * them — and only then discover there is nowhere to send the proceeds. The money
 * sits in a wallet they cannot empty, and the first they hear of it is when they
 * try to withdraw. Better to stop them at the point of listing, when it costs
 * them two minutes instead of a month of sales.
 */
export async function requirePayoutMethod(
  req: AuthRequest, res: Response, next: NextFunction,
): Promise<void> {
  try {
    if (!req.user || !needsPayoutMethod(req.user.role)) { next(); return; }

    if (await hasPayoutMethod(req.user.id)) { next(); return; }

    res.status(403).json({
      error: 'Add a payout method before you start selling — mobile money or a bank account. We need somewhere to send your earnings.',
      code: 'NO_PAYOUT_METHOD',
      action: '/dashboard/payments',
    });
  } catch (err: any) {
    next(err);
  }
}

export default requirePayoutMethod;
