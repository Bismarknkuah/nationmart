// Distance + delivery-fee helpers.

/** Great-circle distance between two lat/lng points, in kilometres. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Fee model (GHS). Riders (motorbikes) are cheaper and capped; drivers (cars/vans)
// cost more and scale with the parcel load — no upper cap for heavy hauls.
export const RIDER_PER_KM = Number(process.env.RIDER_PER_KM || 7);     // motorbike, per km
export const RIDER_MIN_FEE = Number(process.env.RIDER_MIN_FEE || 20);  // floor per trip
export const RIDER_MAX_FEE = Number(process.env.RIDER_MAX_FEE || 100); // cap per trip
export const DRIVER_PER_KM = Number(process.env.DRIVER_PER_KM || 15);  // car/van, per km
export const DRIVER_MIN_FEE = Number(process.env.DRIVER_MIN_FEE || 30);// floor per trip
export const DRIVER_PER_KG = Number(process.env.DRIVER_PER_KG || 2);   // load surcharge per kg

// Legacy exports kept for any old imports.
export const DELIVERY_PER_KM = RIDER_PER_KM;
export const DELIVERY_MIN_FEE = RIDER_MIN_FEE;
export const DELIVERY_MAX_FEE = RIDER_MAX_FEE;

export type VehicleKind = 'rider' | 'driver';

/**
 * A delivery quote from a distance estimate (km) and optional parcel weight (kg).
 *  - rider:  GHS 7/km, clamped to [20, 100].
 *  - driver: GHS 15/km + GHS 2/kg load, floor 30, no cap (heavy/bulky loads cost more).
 */
export function deliveryQuote(distanceKm: number, vehicle: VehicleKind = 'rider', weightKg = 0): { distanceKm: number; etaMinutes: number; fee: number; vehicle: VehicleKind } {
  const km = Math.max(0, Math.round(distanceKm * 10) / 10);
  const kg = Math.max(0, weightKg || 0);
  let fee: number;
  if (vehicle === 'driver') {
    const raw = Math.round(DRIVER_PER_KM * km + DRIVER_PER_KG * kg);
    fee = Math.max(DRIVER_MIN_FEE, raw);
  } else {
    const raw = Math.round(RIDER_PER_KM * km);
    fee = Math.min(RIDER_MAX_FEE, Math.max(RIDER_MIN_FEE, raw));
  }
  const etaMinutes = Math.max(10, Math.round(km * 3) + 10);
  return { distanceKm: km, etaMinutes, fee, vehicle };
}
