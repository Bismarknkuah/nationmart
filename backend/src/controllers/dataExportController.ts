import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { q } from '../db/pg';

/** CSV data exports for finance and officers. Plain SQL — one indexed query each. */

function toCsv(rows: any[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}

function send(res: Response, filename: string, rows: any[]): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(rows));
}

const isOfficer = (r: string) =>
  !['buyer', 'seller', 'rider', 'driver', 'reseller', 'wholesaler', 'manufacturer'].includes(r);

export const exportOrdersCsv = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const officer = isOfficer(req.user.role);
    const rows = await q<any>(
      `SELECT o.order_number, o.created_at, o.status, o.payment_status,
              o.total_amount, o.currency, b.full_name AS buyer,
              s.full_name AS seller, st.name AS store, st.region, st.district
         FROM orders o
         JOIN users b ON b.id = o.buyer_id
         JOIN users s ON s.id = o.seller_id
         LEFT JOIN stores st ON st.id = o.store_id
        WHERE ($1::boolean = TRUE OR o.seller_id = $2::uuid)
        ORDER BY o.created_at DESC LIMIT 5000`,
      [officer, req.user.id],
    );
    send(res, 'orders.csv', rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** The full ledger. Finance only. */
export const exportWalletCsv = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!/finance|account|cfo|ceo|coo|admin/i.test(req.user.role)) {
      res.status(403).json({ error: 'Finance access required.' }); return;
    }
    const rows = await q<any>(
      `SELECT t.created_at, u.full_name AS user_name, u.role,
              t.type, t.category, t.amount, t.balance_after, t.description, t.ref
         FROM wallet_transactions t JOIN users u ON u.id = t.user_id
        ORDER BY t.created_at DESC LIMIT 10000`,
    );
    send(res, 'wallet-ledger.csv', rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const exportDeliveriesCsv = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const rows = await q<any>(
      `SELECT d.tracking_number, d.created_at, d.status, d.vehicle_type,
              d.distance_km, d.parcel_weight_kg, d.fee,
              d.dropoff_region, d.dropoff_district, d.failure_reason,
              r.full_name AS rider, o.order_number
         FROM deliveries d
         LEFT JOIN users r ON r.id = d.rider_id
         JOIN orders o ON o.id = d.order_id
        ORDER BY d.created_at DESC LIMIT 5000`,
    );
    send(res, 'deliveries.csv', rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};
