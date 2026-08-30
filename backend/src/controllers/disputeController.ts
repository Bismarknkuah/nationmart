import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as dsp from '../repos/disputeRepo';

const isOfficer = (r: string) =>
  !['buyer', 'seller', 'rider', 'driver', 'reseller', 'wholesaler', 'manufacturer'].includes(r);

const status = (err: any): number => ({
  NO_ORDER: 404, NOT_FOUND: 404,
  NOT_BUYER: 403, NOT_PARTY: 403,
  ALREADY_OPEN: 409, ALREADY_CLOSED: 409, CLOSED: 409,
  WINDOW_CLOSED: 422, NOT_PAID: 422,
}[err?.code as string] ?? 400);

/** POST /api/disputes — the buyer contests an order. This freezes the seller's money. */
export const raiseDispute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const dispute = await dsp.raise({
      orderId: req.body.orderId,
      raisedBy: req.user.id,
      reason: req.body.reason,
      details: req.body.details,
      claimAmount: req.body.claimAmount,
    });
    res.status(201).json({
      dispute: dsp.publicDispute(dispute),
      message: "The seller's payment is now held until this is settled.",
    });
  } catch (err: any) { res.status(status(err)).json({ error: err.message }); }
};

/** GET /api/disputes/mine */
export const myDisputes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const list = await dsp.mine(req.user.id);
    res.json({ disputes: list.map(dsp.publicDispute) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/disputes/:id — the full case file. Parties and officers only. */
export const getDispute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const dispute = await dsp.findById(req.params.id);
    if (!dispute) { res.status(404).json({ error: 'Dispute not found.' }); return; }

    const isParty = dispute.raised_by === req.user.id || dispute.against_user === req.user.id;
    if (!isParty && !isOfficer(req.user.role)) {
      res.status(403).json({ error: 'You are not part of this dispute.' }); return;
    }

    res.json({
      dispute: dsp.publicDispute(dispute),
      evidence: await dsp.getEvidence(dispute.id),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** POST /api/disputes/:id/evidence */
export const addEvidence = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const item = await dsp.addEvidence(
      req.params.id, req.user.id, req.user.role,
      req.body.body, req.body.attachmentUrl,
    );
    res.status(201).json({ evidence: item });
  } catch (err: any) { res.status(status(err)).json({ error: err.message }); }
};

/** POST /api/disputes/:id/withdraw — the buyer drops it; the freeze lifts. */
export const withdrawDispute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const dispute = await dsp.withdraw(req.params.id, req.user.id);
    if (!dispute) { res.status(404).json({ error: 'Dispute not found, or already closed.' }); return; }
    res.json({ dispute: dsp.publicDispute(dispute) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

// ─── Officer ─────────────────────────────────────────────────────────────────

/** GET /api/disputes/queue — overdue cases first. */
export const disputeQueue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const list = await dsp.queue(req.query.status as string | undefined);
    res.json({ disputes: list.map(dsp.publicDispute) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const claimDispute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const dispute = await dsp.claimForReview(req.params.id, req.user.id);
    if (!dispute) { res.status(409).json({ error: 'This case is no longer open.' }); return; }
    res.json({ dispute: dsp.publicDispute(dispute) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

/**
 * POST /api/disputes/:id/resolve
 * Refund the buyer (reversing the ledger) or find for the seller (releasing escrow).
 * A written reason is mandatory — nobody loses money to an anonymous verdict.
 */
export const resolveDispute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }

    const { outcome, refundAmount, resolution } = req.body;
    if (!['refund_buyer', 'favour_seller'].includes(outcome)) {
      res.status(400).json({ error: 'Outcome must be refund_buyer or favour_seller.' });
      return;
    }

    const dispute = await dsp.resolve({
      disputeId: req.params.id,
      officerId: req.user.id,
      outcome,
      refundAmount: refundAmount != null ? Number(refundAmount) : undefined,
      resolution,
    });

    res.json({
      dispute: dsp.publicDispute(dispute),
      message: outcome === 'refund_buyer'
        ? `Refunded GHS ${Number(dispute.refund_amount).toLocaleString()} to the buyer.`
        : "Found for the seller. Their payment has been released.",
    });
  } catch (err: any) { res.status(status(err)).json({ error: err.message }); }
};

/** GET /api/disputes/record/:sellerId — a shop's dispute history. Public. */
export const sellerRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try { res.json({ record: await dsp.sellerRecord(req.params.sellerId) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/disputes/overdue — the SLA breach report. */
export const overdueDisputes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    res.json({ overdue: await dsp.overdue() });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};
