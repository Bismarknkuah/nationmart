import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { officerComms } from '../repos/platformRepo';

/** Officer seniority: 1 = executive … 5 = district. */
function levelOf(role: string): number {
  const r = (role || '').toLowerCase();
  if (/^(ceo|coo|cfo|cto|cio|admin|super_admin)$/.test(r)) return 1;
  if (/^national_/.test(r)) return 2;
  if (/^region(al)?_/.test(r)) return 3;
  if (/^district_/.test(r)) return 4;
  return 5;
}

const isOfficer = (r: string) =>
  !['buyer', 'seller', 'rider', 'driver', 'reseller', 'wholesaler', 'manufacturer'].includes(r);

export const listChannels = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    res.json({ channels: await officerComms.channels(levelOf(req.user.role)) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const getChannelMessages = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    res.json({ messages: await officerComms.messages(req.params.channelId) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const sendMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isOfficer(req.user.role)) { res.status(403).json({ error: 'Officer access only.' }); return; }
    const message = await officerComms.send(
      req.params.channelId, req.user.id, req.body.body, !!req.body.urgent);
    res.status(201).json({ message });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const markRead = async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({ message: 'Marked read' });
};

// ─── Extras ──────────────────────────────────────────────────────────────────

/** Install the standard officer channels. Safe to re-run. */
export const seedOfficerChannels = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!/admin|ceo|coo/i.test(req.user.role)) { res.status(403).json({ error: 'Not authorized.' }); return; }
    const channels = [
      { slug: 'executive',   name: 'Executive',            level: 1, broadcast: false },
      { slug: 'national',    name: 'National officers',    level: 2, broadcast: false },
      { slug: 'regional',    name: 'Regional officers',    level: 3, broadcast: false },
      { slug: 'district',    name: 'District officers',    level: 4, broadcast: false },
      { slug: 'all-staff',   name: 'All staff',            level: 5, broadcast: true },
      { slug: 'logistics',   name: 'Logistics desk',       level: 5, broadcast: false },
      { slug: 'security',    name: 'Security & fraud',     level: 3, broadcast: false },
    ];
    const made = [];
    for (const c of channels) {
      made.push(await officerComms.ensureChannel(c.slug, c.name, c.level, c.broadcast));
    }
    res.json({ installed: made.length, channels: made });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const inbox = listChannels;
export const myInbox = listChannels;
