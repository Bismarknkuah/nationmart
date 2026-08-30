import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { platformStats, officeStats, scopeFor, regionalOverview } from '../repos/managementRepo';

const isOfficer = (r: string) =>
  !['buyer', 'seller', 'rider', 'driver', 'reseller', 'wholesaler', 'manufacturer'].includes(r);

export const platform = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    res.json(await platformStats());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const office = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    res.json(await officeStats());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const jurisdiction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    res.json(await regionalOverview(scopeFor(req.user)));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export { fileReport as createReport, forwardReport, resolveReport as reviewReport }
  from './reportController';
export { listChannels as inbox } from './officerCommsController';
export { aiMonthlyAnalysis as compileReports } from './managementController';
export { chat as aiAssist } from './aiController';
