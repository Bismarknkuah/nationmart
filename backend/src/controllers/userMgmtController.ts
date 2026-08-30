import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as um from '../repos/userMgmtRepo';

/**
 * User management endpoints for executives & admins.
 *
 * Access is gated two ways: the route requires an officer/exec (middleware), and
 * every mutation re-checks the role guardrail in the repo against the ACTOR, so
 * even a compromised officer account can't exceed its level.
 */

const status = (err: any): number => err?.status || ({
  FORBIDDEN_ROLE: 403, SELF: 403, NOT_FOUND: 404, EMAIL_TAKEN: 409,
  MISSING_FIELDS: 400, BAD_STATUS: 400, WEAK: 400,
}[err?.code as string] ?? 400);

const actor = (req: AuthRequest) => ({ id: req.user.id, role: req.user.role });

export const list = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await um.listUsers({
      role: req.query.role as string,
      status: req.query.status as string,
      region: req.query.region as string,
      district: req.query.district as string,
      search: req.query.search as string,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    // Tell the UI which roles this actor may assign, so the dropdown is correct.
    res.json({ ...result, assignableRoles: um.rolesActorCanAssign(req.user.role) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const create = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await um.createManagedUser(actor(req), req.body);
    res.status(201).json({ user, message: `${user.fullName} created as ${user.role.replace(/_/g, ' ')}.` });
  } catch (err: any) { res.status(status(err)).json({ error: err.message }); }
};

export const update = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await um.updateManagedUser(actor(req), req.params.id, req.body);
    res.json({ user });
  } catch (err: any) { res.status(status(err)).json({ error: err.message }); }
};

export const changeRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.body.role) { res.status(400).json({ error: 'A new role is required.' }); return; }
    const user = await um.changeUserRole(actor(req), req.params.id, req.body.role);
    res.json({ user, message: `Role changed to ${user.role.replace(/_/g, ' ')}.` });
  } catch (err: any) { res.status(status(err)).json({ error: err.message }); }
};

export const setStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await um.setUserStatus(actor(req), req.params.id, req.body.status);
    res.json({ user, message: `Account ${user.status}.` });
  } catch (err: any) { res.status(status(err)).json({ error: err.message }); }
};

export const resetPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await um.resetUserPassword(actor(req), req.params.id, req.body.password);
    res.json({ message: 'Password reset.' });
  } catch (err: any) { res.status(status(err)).json({ error: err.message }); }
};
