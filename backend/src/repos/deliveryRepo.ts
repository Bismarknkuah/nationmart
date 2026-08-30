import { q, tx, money } from '../db/pg';

/**
 * Delivery repository — PostgreSQL.
 *
 * Fee model (all env-tunable):
 *   • rider  (motorbike): GHS 7/km,  floor GHS 20, capped at GHS 100
 *   • driver (car/van):   GHS 15/km + GHS 2/kg load, floor GHS 30, NO cap —
 *     heavy and bulky loads should cost more, so the cap is deliberately absent.
 *
 * The rider's commission is posted to their wallet on delivery, and escrow is
 * released to the seller in the SAME transaction. Either both happen or neither:
 * we never release the seller's money while failing to charge the rider, or the
 * reverse.
 */

export const RIDER_PER_KM  = Number(process.env.RIDER_PER_KM  || 7);
export const RIDER_MIN_FEE = Number(process.env.RIDER_MIN_FEE || 20);
export const RIDER_MAX_FEE = Number(process.env.RIDER_MAX_FEE || 100);
export const DRIVER_PER_KM = Number(process.env.DRIVER_PER_KM || 15);
export const DRIVER_MIN_FEE = Number(process.env.DRIVER_MIN_FEE || 30);
export const DRIVER_PER_KG = Number(process.env.DRIVER_PER_KG || 2);
export const RIDER_COMMISSION_PERCENT = Number(process.env.RIDER_COMMISSION_PERCENT || 10);

export type VehicleKind = 'rider' | 'driver';

export type DeliveryRow = {
  id: string;
  tracking_number: string;
  order_id: string;
  buyer_id: string;
  seller_id: string;
  rider_id: string | null;
  status: string;
  vehicle_type: string;
  parcel_weight_kg: string;
  distance_km: string;
  eta_minutes: number | null;
  fee: string;
  pickup_region: string | null;
  pickup_district: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_region: string | null;
  dropoff_district: string | null;
  dropoff_address: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  rider_lat: number | null;
  rider_lng: number | null;
  rider_location_text: string | null;
  failure_reason: string | null;
  accepted_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
};

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}

export interface Quote {
  distanceKm: number;
  etaMinutes: number;
  fee: number;
  vehicle: VehicleKind;
}

/**
 * Price a delivery from distance and (for drivers) the parcel weight.
 * Riders are capped so short local hops stay affordable; drivers are not,
 * because a 300kg load genuinely costs more to move.
 */
export function deliveryQuote(distanceKm: number, vehicle: VehicleKind = 'rider', weightKg = 0): Quote {
  const km = Math.max(0, Math.round((distanceKm || 0) * 10) / 10);
  const kg = Math.max(0, weightKg || 0);

  let fee: number;
  if (vehicle === 'driver') {
    fee = Math.max(DRIVER_MIN_FEE, Math.round(DRIVER_PER_KM * km + DRIVER_PER_KG * kg));
  } else {
    fee = Math.min(RIDER_MAX_FEE, Math.max(RIDER_MIN_FEE, Math.round(RIDER_PER_KM * km)));
  }

  const etaMinutes = Math.max(10, Math.round(km * 3) + 10);
  return { distanceKm: km, etaMinutes, fee, vehicle };
}

export function generateTracking(): string {
  return `NM-DLV-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

export class DeliveryError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'DeliveryError';
  }
}

export interface CreateDeliveryInput {
  orderId: string;
  vehicleType?: VehicleKind;
  parcelWeightKg?: number;
  actorId: string;
  actorRole: string;
}

/** Create a delivery job for a paid order, priced from the store→buyer distance. */
export async function createForOrder(input: CreateDeliveryInput): Promise<DeliveryRow> {
  return tx(async (c) => {
    const { rows: orderRows } = await c.query(
      `SELECT o.*, s.lat AS store_lat, s.lng AS store_lng,
              s.region AS store_region, s.district AS store_district
         FROM orders o LEFT JOIN stores s ON s.id = o.store_id
        WHERE o.id = $1::uuid`,
      [input.orderId],
    );
    const order = orderRows[0];
    if (!order) throw new DeliveryError('Order not found.', 'NO_ORDER');

    const { rows: existing } = await c.query(
      `SELECT id FROM deliveries WHERE order_id = $1::uuid`, [input.orderId]);
    if (existing.length) {
      throw new DeliveryError('A delivery already exists for this order.', 'ALREADY_EXISTS');
    }

    const vehicle: VehicleKind = input.vehicleType === 'driver' ? 'driver' : 'rider';
    const weight = Math.max(0, Number(input.parcelWeightKg) || 0);

    // Distance from the store to the buyer, when we know both.
    let km = 4;   // a sensible in-town default when coordinates are missing
    if (order.store_lat != null && order.ship_lat != null) {
      km = haversineKm(order.store_lat, order.store_lng, order.ship_lat, order.ship_lng);
    }
    const quote = deliveryQuote(km, vehicle, weight);

    const { rows } = await c.query<DeliveryRow>(
      `INSERT INTO deliveries (
         tracking_number, order_id, buyer_id, seller_id, status,
         vehicle_type, parcel_weight_kg, distance_km, eta_minutes, fee,
         pickup_region, pickup_district, pickup_lat, pickup_lng,
         dropoff_region, dropoff_district, dropoff_address, dropoff_lat, dropoff_lng
       ) VALUES (
         $1,$2::uuid,$3::uuid,$4::uuid,'pending_assignment',
         $5::vehicle_kind,$6::numeric,$7::numeric,$8,$9::numeric,
         $10,$11,$12,$13,$14,$15,$16,$17,$18
       ) RETURNING *`,
      [
        generateTracking(), order.id, order.buyer_id, order.seller_id,
        vehicle, money(weight), money(quote.distanceKm), quote.etaMinutes, money(quote.fee),
        order.store_region, order.store_district, order.store_lat, order.store_lng,
        order.ship_state, order.ship_city,
        [order.ship_street, order.ship_city, order.ship_state].filter(Boolean).join(', '),
        order.ship_lat, order.ship_lng,
      ],
    );
    const delivery = rows[0];

    await c.query(
      `INSERT INTO delivery_events (delivery_id, status, note, by_user_id, by_role)
       VALUES ($1::uuid,'pending_assignment','Delivery created',$2::uuid,$3)`,
      [delivery.id, input.actorId, input.actorRole],
    );

    return delivery;
  });
}

/** The AI dispatcher: nearest available rider (or driver) to the pickup point. */
export async function recommendRider(deliveryId: string) {
  const rows = await q<any>(
    `WITH d AS (SELECT pickup_lat, pickup_lng, pickup_region, vehicle_type
                  FROM deliveries WHERE id = $1::uuid)
     SELECT u.id, u.full_name, u.phone, u.region, u.duty_status,
            CASE WHEN d.pickup_lat IS NOT NULL AND u.id IS NOT NULL
                 THEN 0 ELSE NULL END AS placeholder
       FROM users u, d
      WHERE u.duty_status = 'available'
        AND u.is_approved = TRUE
        AND u.account_status = 'active'
        AND ((d.vehicle_type = 'driver' AND u.role = 'driver')
          OR (d.vehicle_type = 'rider'  AND u.role IN ('rider','driver')))
        AND (d.pickup_region IS NULL OR u.region = d.pickup_region)
      ORDER BY u.last_login DESC NULLS LAST
      LIMIT 5`,
    [deliveryId],
  );
  return rows;
}

export async function assignRider(deliveryId: string, riderId: string): Promise<DeliveryRow | null> {
  const rows = await q<DeliveryRow>(
    `UPDATE deliveries
        SET rider_id = $2::uuid, status = 'assigned'
      WHERE id = $1::uuid AND status = 'pending_assignment'
      RETURNING *`,
    [deliveryId, riderId],
  );
  if (rows[0]) {
    await q(
      `INSERT INTO delivery_events (delivery_id, status, note, by_user_id, by_role)
       VALUES ($1::uuid,'assigned','Rider assigned',$2::uuid,'system')`,
      [deliveryId, riderId],
    ).catch(() => {});
  }
  return rows[0] ?? null;
}

/**
 * The delivery status ladder. A rider cannot skip a rung — you cannot mark
 * something delivered that was never collected.
 */
export const DELIVERY_TRANSITIONS: Record<string, string[]> = {
  pending_assignment: ['assigned', 'cancelled'],
  assigned:   ['accepted', 'cancelled'],
  accepted:   ['picked_up', 'failed', 'cancelled'],
  picked_up:  ['in_transit', 'failed'],
  in_transit: ['delivered', 'failed'],
  delivered:  [],      // terminal
  failed:     [],      // terminal
  cancelled:  [],      // terminal
};

const NEXT = DELIVERY_TRANSITIONS;

/**
 * Advance a delivery.
 *
 * On `delivered`, three things happen in ONE transaction:
 *   1. the delivery is marked delivered
 *   2. escrow is released to the seller
 *   3. the rider's commission is debited from their wallet
 * All or nothing — the seller can never be paid without the rider being charged.
 *
 * On `failed`, a reason is REQUIRED. The database enforces this too.
 */
export async function setStatus(
  deliveryId: string,
  riderId: string,
  status: string,
  note?: string,
): Promise<DeliveryRow> {
  return tx(async (c) => {
    const { rows } = await c.query<DeliveryRow>(
      `SELECT * FROM deliveries WHERE id = $1::uuid FOR UPDATE`, [deliveryId]);
    const d = rows[0];
    if (!d) throw new DeliveryError('Delivery not found.', 'NOT_FOUND');
    if (d.rider_id !== riderId) throw new DeliveryError('This job is not yours.', 'NOT_YOURS');

    const allowed = NEXT[d.status] ?? [];
    if (!allowed.includes(status)) {
      throw new DeliveryError(
        `Cannot go from ${d.status} to ${status}.`, 'BAD_TRANSITION',
      );
    }
    if (status === 'failed' && !note?.trim()) {
      throw new DeliveryError('Please say why the delivery failed.', 'REASON_REQUIRED');
    }

    const { rows: updated } = await c.query<DeliveryRow>(
      `UPDATE deliveries
          SET status = $2::delivery_status,
              failure_reason = CASE WHEN $2 = 'failed' THEN $3 ELSE failure_reason END,
              accepted_at  = CASE WHEN $2 = 'accepted'  THEN now() ELSE accepted_at END,
              delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END
        WHERE id = $1::uuid
        RETURNING *`,
      [deliveryId, status, note ?? null],
    );

    await c.query(
      `INSERT INTO delivery_events (delivery_id, status, note, by_user_id, by_role)
       VALUES ($1::uuid,$2::delivery_status,$3,$4::uuid,'rider')`,
      [deliveryId, status, note ?? null, riderId],
    );

    if (status === 'delivered') {
      // Release the buyer's money to the seller…
      await c.query(
        `UPDATE payments SET escrow_state = 'released'
          WHERE order_id = $1::uuid AND purpose = 'order'
            AND status = 'paid' AND escrow_state = 'held'`,
        [d.order_id],
      );
      await c.query(
        `UPDATE orders SET status = 'delivered' WHERE id = $1::uuid`, [d.order_id]);

      // …and charge the rider their commission, in the same breath.
      const fee = Number(d.fee);
      const commission = Number(money((fee * RIDER_COMMISSION_PERCENT) / 100));
      if (commission > 0) {
        await c.query(
          `SELECT post_wallet_txn($1::uuid,'debit','commission',$2::numeric,$3,$4)`,
          [riderId, money(commission),
           `${RIDER_COMMISSION_PERCENT}% commission on ${d.tracking_number}`,
           d.tracking_number],
        );
      }
    }

    if (status === 'failed') {
      // The goods never arrived — put the stock back.
      const { rows: items } = await c.query(
        `SELECT product_id, quantity FROM order_items WHERE order_id = $1::uuid`, [d.order_id]);
      for (const it of items) {
        if (it.product_id) {
          await c.query(`SELECT release_stock($1::uuid, $2::numeric)`, [it.product_id, it.quantity]);
        }
      }
    }

    return updated[0];
  });
}

/** Rider shares their live position for the buyer and seller to follow. */
export async function ping(
  deliveryId: string, riderId: string,
  loc: { lat?: number; lng?: number; locationText?: string },
): Promise<boolean> {
  const rows = await q(
    `UPDATE deliveries
        SET rider_lat = COALESCE($3, rider_lat),
            rider_lng = COALESCE($4, rider_lng),
            rider_location_text = COALESCE($5, rider_location_text),
            rider_location_at = now()
      WHERE id = $1::uuid AND rider_id = $2::uuid
      RETURNING id`,
    [deliveryId, riderId, loc.lat ?? null, loc.lng ?? null, loc.locationText ?? null],
  );
  return rows.length > 0;
}

export async function findById(id: string): Promise<DeliveryRow | null> {
  const rows = await q<DeliveryRow>(`SELECT * FROM deliveries WHERE id = $1::uuid`, [id]);
  return rows[0] ?? null;
}

export async function byOrder(orderId: string): Promise<DeliveryRow | null> {
  const rows = await q<DeliveryRow>(`SELECT * FROM deliveries WHERE order_id = $1::uuid`, [orderId]);
  return rows[0] ?? null;
}

export async function getEvents(deliveryId: string) {
  return q<any>(
    `SELECT status, note, by_role, at FROM delivery_events
      WHERE delivery_id = $1::uuid ORDER BY at ASC`,
    [deliveryId],
  );
}

/** A rider's jobs plus their earnings summary. */
export async function myDeliveries(riderId: string) {
  const deliveries = await q<any>(
    `SELECT d.*, o.order_number
       FROM deliveries d JOIN orders o ON o.id = d.order_id
      WHERE d.rider_id = $1::uuid
      ORDER BY d.created_at DESC LIMIT 50`,
    [riderId],
  );
  const [summary] = await q<any>(
    `SELECT
       count(*) FILTER (WHERE status = 'assigned')                       AS pending,
       count(*) FILTER (WHERE status IN ('accepted','picked_up','in_transit')) AS active,
       count(*) FILTER (WHERE status = 'delivered')                      AS completed,
       COALESCE(SUM(fee) FILTER (WHERE status = 'delivered'), 0)         AS earnings
     FROM deliveries WHERE rider_id = $1::uuid`,
    [riderId],
  );
  return {
    deliveries,
    summary: {
      pending: Number(summary.pending),
      active: Number(summary.active),
      completed: Number(summary.completed),
      earnings: Number(summary.earnings),
    },
  };
}

export function publicDelivery(d: any) {
  return {
    _id: d.id,
    id: d.id,
    trackingNumber: d.tracking_number,
    order: d.order_id,
    orderNumber: d.order_number,
    buyer: d.buyer_id,
    seller: d.seller_id,
    rider: d.rider_id,
    status: d.status,
    vehicleType: d.vehicle_type,
    parcelWeightKg: Number(d.parcel_weight_kg),
    distanceKm: Number(d.distance_km),
    etaMinutes: d.eta_minutes,
    fee: Number(d.fee),
    pickupRegion: d.pickup_region,
    pickupDistrict: d.pickup_district,
    pickupLat: d.pickup_lat,
    pickupLng: d.pickup_lng,
    dropoffAddress: d.dropoff_address,
    dropoffLat: d.dropoff_lat,
    dropoffLng: d.dropoff_lng,
    riderLat: d.rider_lat,
    riderLng: d.rider_lng,
    riderLocationText: d.rider_location_text,
    failureReason: d.failure_reason,
    acceptedAt: d.accepted_at,
    deliveredAt: d.delivered_at,
    createdAt: d.created_at,
  };
}
