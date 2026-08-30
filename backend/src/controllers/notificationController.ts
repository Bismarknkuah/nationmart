import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as notes from '../repos/notificationRepo';

export const listNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const list = await notes.list(req.user.id, Number(req.query.limit) || 30);
    res.json({ notifications: list.map(notes.publicNotification) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const unreadCount = async (req: AuthRequest, res: Response): Promise<void> => {
  try { res.json({ count: await notes.unreadCount(req.user.id) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const markRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ok = await notes.markRead(req.params.id, req.user.id);
    if (!ok) { res.status(404).json({ error: 'Notification not found.' }); return; }
    res.json({ message: 'Marked read' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const markAllRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try { res.json({ marked: await notes.markAllRead(req.user.id) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
};
