import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../middleware/auth';
import { q } from '../db/pg';
import {
  createUser, findByEmail, findById, verifyPassword, changePassword as setPassword,
  updateProfile as patchProfile, touchLastLogin, publicUser, emailExists, ghanaCardExists,
  isSellerRole, isPartnerRole, SELF_SIGNUP_ROLES, UserRow,
} from '../repos/userRepo';
import * as po from '../repos/payoutRepo';
import { validateGhanaCardFormat, normalizeGhanaCard } from '../services/ghanaCardService';

// Pricing. First year is free for everyone; the fee applies from year two.
const TRIAL_DAYS = Number(process.env.SUBSCRIPTION_TRIAL_DAYS) || 365;
const SUBSCRIPTION_FEE = Number(process.env.SUBSCRIPTION_FEE_GHS) || 200;   // seller, 1 store
const PARTNER_FEE = Number(process.env.PARTNER_FEE_GHS) || 300;            // rider / driver

const generateToken = (id: string, role: string): string =>
  jwt.sign({ id, role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '30d' });

/** Fire-and-forget audit entry. Never allowed to break the request. */
function audit(entry: {
  actorId?: string | null; actorRole?: string; action: string;
  summary?: string; metadata?: any; ip?: string; userAgent?: string;
}): void {
  q(
    `INSERT INTO audit_logs (actor_id, actor_role, action, summary, metadata, ip_address, user_agent)
     VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6::inet, $7)`,
    [
      entry.actorId ?? null, entry.actorRole ?? 'unknown', entry.action,
      entry.summary ?? '', JSON.stringify(entry.metadata ?? {}),
      entry.ip ?? null, entry.userAgent ?? null,
    ],
  ).catch(() => { /* auditing must never take the site down */ });
}

function notify(userId: string, title: string, message: string): void {
  q(
    `INSERT INTO notifications (user_id, type, title, message)
     VALUES ($1::uuid, 'system', $2, $3)`,
    [userId, title, message],
  ).catch(() => {});
}

const clientIp = (req: Request): string | undefined =>
  (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket?.remoteAddress;

// ─── POST /api/auth/register ────────────────────────────────────────────────
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      fullName, email, phone, password, role, company, region, district, address,
      ghanaCardNumber, momoNumber, momoNetwork, businessRegNumber, taxIdNumber,
      country, idType, idNumber, paymentMethods,
    } = req.body;

    if (!fullName || !email || !phone || !password || !address) {
      res.status(400).json({ error: 'Please fill in all required fields.' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const signupCountry = String(country || 'Ghana').trim();
    const isGhana = /^gh(ana)?$/i.test(signupCountry);

    // Officer and admin roles are granted by a super admin, never self-assigned.
    const requestedRole: string =
      (SELF_SIGNUP_ROLES as readonly string[]).includes(role) ? role : 'buyer';

    // Identity: Ghana uses the Ghana Card; elsewhere, a national ID or passport.
    let normalizedCard: string | undefined;
    if (isGhana) {
      const fmt = validateGhanaCardFormat(ghanaCardNumber || '');
      if (!fmt.valid) { res.status(400).json({ error: fmt.message }); return; }
      normalizedCard = normalizeGhanaCard(ghanaCardNumber);

      if (await ghanaCardExists(normalizedCard!)) {
        res.status(409).json({ error: 'An account already exists for this Ghana Card.' });
        return;
      }
    } else if (!idNumber || String(idNumber).trim().length < 4) {
      res.status(400).json({ error: 'Please provide a valid national ID or passport number for your country.' });
      return;
    }

    if (await emailExists(email)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const seller = isSellerRole(requestedRole);
    const partner = isPartnerRole(requestedRole);

    // Everyone's first year is free. Buyers are exempt from fees entirely.
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
    const subscription = seller
      ? { status: 'trial', plan: 'yearly', amount: SUBSCRIPTION_FEE, trialEndsAt }
      : partner
        ? { status: 'trial', plan: 'yearly', amount: PARTNER_FEE, trialEndsAt }
        : { status: 'exempt', plan: 'yearly', amount: 0 };

    const partnerCode = partner
      ? `NM-${requestedRole.slice(0, 1).toUpperCase()}${Date.now().toString(36).toUpperCase().slice(-6)}`
      : undefined;

    const user = await createUser({
      fullName, email, phone, password, role: requestedRole, company,
      country: signupCountry, region, district, address,
      idType: isGhana ? 'ghana_card' : (idType || 'national_id'),
      idNumber: isGhana ? '' : String(idNumber || '').trim(),
      ghanaCardNumber: normalizedCard,
      ghanaCardStatus: 'unverified',
      paymentMethods: Array.isArray(paymentMethods) ? paymentMethods : [],
      momoNumber, momoNetwork, businessRegNumber, taxIdNumber,
      partnerCode,
      vehicleLicense: req.body.vehicleLicense,
      termsVersion: req.body.termsVersion || 'v1',
      subscription,
    });

    /**
     * A seller, rider or driver needs somewhere to be paid.
     *
     * If they gave a mobile-money number at signup, that becomes their payout
     * destination straight away — one less thing standing between them and their
     * first sale. If they did not, the account is still created, but
     * requirePayoutMethod will stop them listing until they add one. We do not
     * block registration itself: losing a seller at the sign-up form to a field
     * they can fill in two minutes later is a worse trade than letting them in.
     */
    if (po.needsPayoutMethod(user.role) && momoNumber && momoNetwork) {
      try {
        await po.saveMomo(user.id, String(momoNumber), String(momoNetwork));
      } catch (err: any) {
        console.error('[register] could not save payout method:', err?.message);
      }
    }

    notify(
      user.id,
      'Welcome to NationMart',
      seller
        ? 'Your account is active. Your first year is completely free — after that, a yearly subscription (GHS 200 for one store, GHS 300 for two or more) keeps your listings live.'
        : 'Your account is active. Browse the catalog and start trading with verified suppliers.',
    );

    audit({
      actorId: user.id, actorRole: user.role, action: 'user.register',
      summary: `${user.full_name} registered as ${user.role}`,
      ip: clientIp(req), userAgent: req.headers['user-agent'],
    });

    // Tell the app straight away whether it needs to walk them through adding a
    // payout method before they can list anything.
    const needsPayout = po.needsPayoutMethod(user.role)
      && !(await po.hasPayoutMethod(user.id));

    res.status(201).json({
      message: 'Registration successful',
      token: generateToken(user.id, user.role),
      ghanaCard: { status: user.ghana_card_status, message: '' },
      user: publicUser(user),
      payoutMethodRequired: needsPayout,
      ...(needsPayout ? {
        nextStep: 'Add a payout method — mobile money or a bank account — before you list anything.',
      } : {}),
    });
  } catch (err: any) {
    // Unique-violation from the database is a duplicate account, not a 500.
    if (err?.code === '23505') {
      res.status(409).json({ error: 'An account with those details already exists.' });
      return;
    }
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /api/auth/login ───────────────────────────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, phone, identifier, password } = req.body;

    // Accept email, phone, or username in one field.
    const id = String(identifier || email || phone || '').trim();
    const normalizedPhone = id.replace(/[^\d+]/g, '');
    const ip = clientIp(req);
    const userAgent = req.headers['user-agent'];

    const rows = await q<UserRow>(
      `SELECT * FROM users
        WHERE email = $1
           OR username = $1
           OR phone = $2
           OR phone = $3
        LIMIT 1`,
      [id.toLowerCase(), id, normalizedPhone],
    );
    const user = rows[0];

    if (!user || !password || !(await verifyPassword(String(password), user.password_hash))) {
      audit({
        actorId: user?.id, actorRole: user?.role || 'unknown', action: 'login.fail',
        summary: `Failed login for "${id}"${user ? '' : ' (no matching account)'}`,
        metadata: { identifier: id, reason: user ? 'bad_password' : 'no_account' },
        ip, userAgent,
      });
      // Deliberately vague: never reveal whether the account exists.
      res.status(401).json({ error: 'Invalid login or password' });
      return;
    }

    if (user.account_status === 'suspended') {
      audit({
        actorId: user.id, actorRole: user.role, action: 'login.blocked',
        summary: `Suspended account login attempt: ${user.full_name}`, ip, userAgent,
      });
      res.status(403).json({ error: 'Account suspended. Please contact support.' });
      return;
    }

    await touchLastLogin(user.id);
    audit({
      actorId: user.id, actorRole: user.role, action: 'login.success',
      summary: `${user.full_name} signed in`, ip, userAgent,
    });

    res.json({
      message: 'Login successful',
      token: generateToken(user.id, user.role),
      user: publicUser(user),
      ...(user.account_status === 'pending_review'
        ? { warning: 'Your account is awaiting approval by an administrator.' }
        : {}),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /api/auth/me ───────────────────────────────────────────────────────
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await findById(req.user.id);
    if (!user) { res.status(404).json({ error: 'User not found.' }); return; }

    const [sub] = await q<any>(
      `SELECT status, plan, amount, trial_ends_at, current_period_end
         FROM subscriptions WHERE user_id = $1::uuid`,
      [user.id],
    );

    res.json({
      user: publicUser(user),
      subscription: sub
        ? {
            status: sub.status,
            plan: sub.plan,
            amount: Number(sub.amount),
            trialEndsAt: sub.trial_ends_at,
            currentPeriodEnd: sub.current_period_end,
          }
        : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── PATCH /api/auth/profile ────────────────────────────────────────────────
// Only self-editable fields are honoured; role/approval/password are ignored
// here by design, so this endpoint can never be used to escalate privileges.
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await patchProfile(req.user.id, req.body);
    if (!user) { res.status(404).json({ error: 'User not found.' }); return; }
    res.json({ message: 'Profile updated', user: publicUser(user) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /api/auth/change-password ─────────────────────────────────────────
export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }

    const user = await findById(req.user.id);
    if (!user) { res.status(404).json({ error: 'User not found.' }); return; }

    if (!(await verifyPassword(String(currentPassword || ''), user.password_hash))) {
      audit({
        actorId: user.id, actorRole: user.role, action: 'password.change_failed',
        summary: 'Wrong current password supplied', ip: clientIp(req),
      });
      res.status(401).json({ error: 'Your current password is incorrect.' });
      return;
    }

    await setPassword(user.id, String(newPassword));
    audit({
      actorId: user.id, actorRole: user.role, action: 'password.changed',
      summary: `${user.full_name} changed their password`, ip: clientIp(req),
    });

    res.json({ message: 'Password changed successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
