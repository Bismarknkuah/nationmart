import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { reports } from '../repos/platformRepo';

const isOfficer = (r: string) =>
  !['buyer', 'seller', 'rider', 'driver', 'reseller', 'wholesaler', 'manufacturer'].includes(r);

export const fileReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const report = await reports.file({ reporterId: req.user.id, ...req.body });
    res.status(201).json({ report });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const listReports = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    res.json({ reports: await reports.list(req.query.status as string | undefined) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const resolveReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const { status, resolution } = req.body;
    const report = await reports.resolve(req.params.id, req.user.id, status, resolution || '');
    if (!report) { res.status(404).json({ error: 'Report not found, or already closed.' }); return; }
    res.json({ report });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const myReports = async (req: AuthRequest, res: Response): Promise<void> => {
  try { res.json({ reports: await reports.list() }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
};

// ─── Extras ──────────────────────────────────────────────────────────────────
import { q } from '../db/pg';

export const createReport = fileReport;
export const reportUser = fileReport;
export const reviewReport = resolveReport;

/** Reports filed against me — everyone has a right to know. */
export const reportsAgainstMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await q<any>(
      `SELECT id, category, status, created_at, resolution, resolved_at
         FROM reports WHERE reported_user = $1::uuid
        ORDER BY created_at DESC LIMIT 50`,
      [req.user.id],
    );
    res.json({ reports: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** Escalate a report to a more senior officer. */
export const forwardReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const rows = await q<any>(
      `UPDATE reports SET status = 'investigating', resolution = $2
        WHERE id = $1::uuid AND status = 'open'
        RETURNING *`,
      [req.params.id, `Escalated by ${req.user.fullName}: ${req.body.note || ''}`.trim()],
    );
    if (!rows[0]) { res.status(404).json({ error: 'Report not found, or already closed.' }); return; }
    res.json({ report: rows[0] });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};
