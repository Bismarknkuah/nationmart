import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as hr from '../repos/hrRepo';

const isHR = (r: string) => /hr|chro|human|admin|ceo|coo/i.test(r);

export const submitLeave = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { kind, startDate, endDate, reason } = req.body;
    if (!startDate || !endDate) { res.status(400).json({ error: 'Start and end dates are required.' }); return; }
    const leave = await hr.submitLeave({ staffId: req.user.id, kind, startDate, endDate, reason });
    res.status(201).json({ leave });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const myLeave = async (req: AuthRequest, res: Response): Promise<void> => {
  try { res.json({ leave: await hr.myLeave(req.user.id) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const cancelLeave = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const leave = await hr.cancelLeave(req.params.id, req.user.id);
    if (!leave) { res.status(404).json({ error: 'Not found, or no longer pending.' }); return; }
    res.json({ leave });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const listLeave = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isHR(req.user.role)) { res.status(403).json({ error: 'HR access required.' }); return; }
    res.json({ leave: await hr.listLeave(req.query.status as string | undefined) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const decideLeave = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isHR(req.user.role)) { res.status(403).json({ error: 'HR access required.' }); return; }
    const { approve, note } = req.body;
    const leave = await hr.decideLeave(req.params.id, req.user.id, !!approve, note || '');
    if (!leave) { res.status(404).json({ error: 'Not found, or already decided.' }); return; }
    res.json({ leave });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const listOnboarding = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isHR(req.user.role)) { res.status(403).json({ error: 'HR access required.' }); return; }
    res.json({ onboarding: await hr.listOnboarding() });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const startOnboarding = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isHR(req.user.role)) { res.status(403).json({ error: 'HR access required.' }); return; }
    const { staffId, tasks } = req.body;
    if (!staffId) { res.status(400).json({ error: 'A staff member is required.' }); return; }
    const id = await hr.startOnboarding(staffId, tasks);
    res.status(201).json({ onboardingId: id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const toggleOnboardingTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isHR(req.user.role)) { res.status(403).json({ error: 'HR access required.' }); return; }
    const result = await hr.toggleTask(req.params.taskId, !!req.body.done);
    if (!result) { res.status(404).json({ error: 'Task not found.' }); return; }
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const listPayroll = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isHR(req.user.role)) { res.status(403).json({ error: 'HR access required.' }); return; }
    res.json({ payroll: await hr.listPayroll(req.query.period as string | undefined) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const addPayslip = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isHR(req.user.role)) { res.status(403).json({ error: 'HR access required.' }); return; }
    const { staffId, period, gross, deductions } = req.body;
    const slip = await hr.addPayslip(staffId, period, Number(gross), Number(deductions) || 0);
    res.status(201).json({ payslip: slip });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

// ─── Salary structures + officer payroll ─────────────────────────────────────
import { q } from '../db/pg';

export const listSalaryStructure = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isHR(req.user.role)) { res.status(403).json({ error: 'HR access required.' }); return; }
    const rows = await q<any>(
      `SELECT role, department, count(*) AS headcount,
              COALESCE(AVG(p.gross), 0) AS average_gross
         FROM users u
         LEFT JOIN payroll p ON p.staff_id = u.id
        WHERE u.department IS NOT NULL
        GROUP BY role, department
        ORDER BY department, role`,
    );
    res.json({ structure: rows.map((r) => ({
      role: r.role, department: r.department,
      headcount: Number(r.headcount), averageGross: Number(r.average_gross),
    })) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const upsertSalaryStructure = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isHR(req.user.role)) { res.status(403).json({ error: 'HR access required.' }); return; }
    res.json({ message: 'Salaries are set per payslip. Use POST /api/hr/payroll to record one.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const listSalaryPayments = listPayroll;

export const payOfficer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isHR(req.user.role)) { res.status(403).json({ error: 'HR access required.' }); return; }
    const paid = await hr.markPayrollPaid(req.params.id);
    if (!paid) { res.status(404).json({ error: 'Payslip not found, or already paid.' }); return; }
    res.json({ payslip: paid });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

/** Pay everyone outstanding for a period, in one action. */
export const bulkPayOfficers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isHR(req.user.role)) { res.status(403).json({ error: 'HR access required.' }); return; }
    const rows = await q<any>(
      `UPDATE payroll SET paid = TRUE, paid_at = now()
        WHERE paid = FALSE
          AND ($1::date IS NULL OR period = date_trunc('month', $1::date))
        RETURNING id, staff_id, net`,
      [req.body.period ?? null],
    );
    const total = rows.reduce((sum, r) => sum + Number(r.net), 0);
    res.json({ paid: rows.length, total });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const decide = decideLeave;
