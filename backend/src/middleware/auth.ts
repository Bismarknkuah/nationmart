import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { findById, UserRow } from '../repos/userRepo';

/**
 * JWT authentication — PostgreSQL.
 *
 * The token carries only the user id and role; everything else is read fresh
 * from the database on each request. That matters: if an officer is suspended
 * or demoted, it takes effect immediately rather than waiting out their 30-day
 * token.
 */
export interface AuthRequest extends Request {
  user?: any;
}

export const authenticate = async (
  req: AuthRequest, res: Response, next: NextFunction,
): Promise<void> => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) { res.status(401).json({ error: 'Not authorized. Please sign in.' }); return; }

    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    } catch {
      res.status(401).json({ error: 'Session expired. Please sign in again.' });
      return;
    }

    const user: UserRow | null = await findById(decoded.id);
    if (!user) { res.status(401).json({ error: 'Account no longer exists.' }); return; }

    // Checked live, not from the token — a suspension bites at once.
    if (user.account_status === 'suspended') {
      res.status(403).json({ error: 'Account suspended. Please contact support.' });
      return;
    }

    // The shape the existing controllers already expect.
    req.user = {
      _id: user.id,
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      region: user.region,
      district: user.district,
      country: user.country,
      department: user.department,
      accountStatus: user.account_status,
      dutyStatus: user.duty_status,
      isApproved: user.is_approved,
      pendingReason: user.pending_reason,
      partnerCode: user.partner_code,
    };
    next();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

/** Restrict a route to specific roles. */
export const authorize = (...roles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: 'Not authorized.' }); return; }
    if (roles.length && !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'You do not have access to this area.' });
      return;
    }
    next();
  };

/** Riders and drivers must be approved before they can take jobs. */
export const requireApproved = (
  req: AuthRequest, res: Response, next: NextFunction,
): void => {
  if (!req.user?.isApproved) {
    res.status(403).json({ error: req.user?.pendingReason || 'Your account is awaiting approval.' });
    return;
  }
  next();
};

/** Block riders/drivers whose account is still awaiting an officer's approval. */
export const requireNotPending = (
  req: AuthRequest, res: Response, next: NextFunction,
): void => {
  if (req.user?.accountStatus === 'pending_review') {
    res.status(403).json({
      error: req.user.pendingReason || 'Your account is awaiting approval.',
    });
    return;
  }
  next();
};

/**
 * Require a live subscription. Everyone's first year is free, so this only bites
 * from year two — and buyers are exempt entirely.
 */
export const requireActiveSubscription = async (
  req: AuthRequest, res: Response, next: NextFunction,
): Promise<void> => {
  try {
    const { q } = await import('../db/pg');
    const [sub] = await q<any>(
      `SELECT status, current_period_end, trial_ends_at
         FROM subscriptions WHERE user_id = $1::uuid`,
      [req.user.id],
    );

    // No row, or exempt (buyers) → let them through.
    if (!sub || sub.status === 'exempt') { next(); return; }

    const endsAt = sub.current_period_end ?? sub.trial_ends_at;
    const live = ['trial', 'active'].includes(sub.status)
      && (!endsAt || new Date(endsAt).getTime() > Date.now());

    if (!live) {
      res.status(402).json({
        error: 'Your subscription has lapsed. Renew it to continue selling on NationMart.',
        code: 'SUBSCRIPTION_REQUIRED',
      });
      return;
    }
    next();
  } catch {
    next();   // never let a billing check take the site down
  }
};
