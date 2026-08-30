import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as del from '../repos/deliveryRepo';
import { notify, notifyMany } from '../repos/notificationRepo';
import { q } from '../db/pg';

/** POST /api/deliveries/from-order/:orderId — buyer or seller requests a rider/driver. */
export const createForOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vehicleType, parcelWeightKg } = req.body;
    const delivery = await del.createForOrder({
      orderId: req.params.orderId,
      vehicleType: vehicleType === 'driver' ? 'driver' : 'rider',
      parcelWeightKg: Number(parcelWeightKg) || 0,
      actorId: req.user.id,
      actorRole: req.user.role,
    });

    // Ask the AI dispatcher for the nearest available partner and offer them the job.
    const candidates = await del.recommendRider(delivery.id);
    if (candidates.length) {
      await del.assignRider(delivery.id, candidates[0].id);
      await notify({
        userId: candidates[0].id,
        type: 'rider_assigned',
        title: `New job · ${delivery.tracking_number}`,
        message: `Pickup in ${delivery.pickup_district || 'your area'} · GHS ${Number(delivery.fee)}. Accept or decline in your office.`,
        link: '/rider/office',
      });
    }

    res.status(201).json({ delivery: del.publicDelivery(delivery), assigned: candidates.length > 0 });
  } catch (err: any) {
    const code = err.code === 'ALREADY_EXISTS' ? 409 : 400;
    res.status(code).json({ error: err.message });
  }
};

/** GET /api/deliveries/mine — a rider's jobs and earnings. */
export const myDeliveries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { deliveries, summary } = await del.myDeliveries(req.user.id);
    res.json({ deliveries: deliveries.map(del.publicDelivery), summary });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/**
 * POST /api/deliveries/:id/status
 * The rider advances the job. On 'delivered' this releases the seller's escrow
 * and charges the rider's commission in one transaction. On 'failed' a reason
 * is required, and the buyer is told what it was.
 */
export const updateStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, note } = req.body;
    const delivery = await del.setStatus(req.params.id, req.user.id, status, note);

    const ref = delivery.tracking_number;
    const message = status === 'failed'
      ? `Delivery could not be completed. Reason: ${delivery.failure_reason}. Please contact support or request another rider.`
      : {
          accepted: 'A rider has accepted your delivery.',
          picked_up: 'Your item has been collected and is on its way.',
          in_transit: 'Your parcel is in transit.',
          delivered: 'Your parcel has been delivered. Thank you for using NationMart.',
        }[status as string] || `Delivery status: ${status}.`;

    await notifyMany([delivery.buyer_id, delivery.seller_id], {
      type: 'delivery_update',
      title: status === 'failed' ? `⚠️ Delivery failed · ${ref}` : `Delivery update · ${ref}`,
      message,
      link: '/dashboard',
    });

    res.json({ delivery: del.publicDelivery(delivery) });
  } catch (err: any) {
    const code = err.code === 'NOT_YOURS' ? 403 : 400;
    res.status(code).json({ error: err.message });
  }
};

/** POST /api/deliveries/:id/ping — rider shares live location. */
export const ping = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { lat, lng, locationText } = req.body;
    const ok = await del.ping(req.params.id, req.user.id, { lat, lng, locationText });
    if (!ok) { res.status(403).json({ error: 'This job is not yours.' }); return; }
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/deliveries/by-order/:orderId — the tracker the buyer watches. */
export const byOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const delivery = await del.byOrder(req.params.orderId);
    if (!delivery) { res.json({ delivery: null, events: [] }); return; }
    const events = await del.getEvents(delivery.id);
    res.json({ delivery: del.publicDelivery(delivery), events });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/deliveries/:id/recommend — the AI's suggested riders. */
export const recommend = async (req: AuthRequest, res: Response): Promise<void> => {
  try { res.json({ riders: await del.recommendRider(req.params.id) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** POST /api/deliveries/:id/assign — an officer assigns a specific rider. */
export const assign = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const delivery = await del.assignRider(req.params.id, req.body.riderId);
    if (!delivery) { res.status(409).json({ error: 'This job is no longer awaiting assignment.' }); return; }
    await notify({
      userId: req.body.riderId, type: 'rider_assigned',
      title: `New job · ${delivery.tracking_number}`,
      message: `GHS ${Number(delivery.fee)} · accept it in your office.`,
      link: '/rider/office',
    });
    res.json({ delivery: del.publicDelivery(delivery) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/deliveries/stats */
export const stats = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [row] = await q<any>(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE status IN ('accepted','picked_up','in_transit')) AS active,
              count(*) FILTER (WHERE status = 'pending_assignment') AS unassigned
         FROM deliveries`,
    );
    res.json({ total: Number(row.total), active: Number(row.active), unassigned: Number(row.unassigned), counts: {} });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const quote = async (req: AuthRequest, res: Response): Promise<void> => {
  const { distanceKm, vehicleType, parcelWeightKg } = req.query;
  res.json(del.deliveryQuote(
    Number(distanceKm) || 0,
    vehicleType === 'driver' ? 'driver' : 'rider',
    Number(parcelWeightKg) || 0,
  ));
};
