import { q, tx } from '../db/pg';
import { createUser, hashPassword, publicUser, emailExists } from './userRepo';
import { canManageRole, levelOf, assignableRoles } from '../services/roleAuthority';
import { audit } from '../services/auditService';

/**
 * User management for executives & admins — with the guardrail baked in.
 *
 * Every mutation checks canManageRole(actor, target): you can only create, edit,
 * change the role of, or deactivate someone BELOW your own level. The server
 * enforces this itself; it never trusts the client's word on who may do what.
 * We soft-deactivate rather than hard-delete, because a user with orders, a
 * wallet, or a dispute history must not vanish from the ledger.
 */

export class UserMgmtError extends Error {
  constructor(message: string, public code: string, public status = 400) {
    super(message);
    this.name = 'UserMgmtError';
  }
}

export interface ListFilters {
  role?: string;
  status?: string;
  region?: string;
  district?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listUsers(filters: ListFilters = {}) {
  const limit = Math.min(Number(filters.limit) || 25, 100);
  const offset = ((Number(filters.page) || 1) - 1) * limit;
  const where: string[] = [];
  const params: any[] = [];

  if (filters.role) { params.push(filters.role); where.push(`u.role = $${params.length}`); }
  if (filters.status) { params.push(filters.status); where.push(`u.account_status = $${params.length}::account_status`); }
  if (filters.region) { params.push(filters.region); where.push(`u.region = $${params.length}`); }
  if (filters.district) { params.push(filters.district); where.push(`u.district = $${params.length}`); }
  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    where.push(`(lower(u.full_name) LIKE $${params.length} OR lower(u.email) LIKE $${params.length} OR u.phone LIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  params.push(limit); params.push(offset);
  const rows = await q<any>(
    `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.account_status,
            u.region, u.district, u.ghana_card_status, u.created_at, u.last_login
       FROM users u
       ${whereSql}
      ORDER BY u.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const [{ total }] = await q<any>(
    `SELECT count(*)::int AS total FROM users u ${whereSql}`,
    params.slice(0, params.length - 2),
  );

  return { users: rows.map(shape), total, page: Number(filters.page) || 1, limit };
}

function shape(u: any) {
  return {
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    level: levelOf(u.role),
    status: u.account_status,
    region: u.region,
    district: u.district,
    ghanaCardStatus: u.ghana_card_status,
    createdAt: u.created_at,
    lastLoginAt: u.last_login,
  };
}

/** Which roles this actor is allowed to assign — drives the UI dropdown. */
export function rolesActorCanAssign(actorRole: string): string[] {
  return assignableRoles(actorRole);
}

function guard(actorRole: string, targetRole: string, action: string) {
  if (!canManageRole(actorRole, targetRole)) {
    throw new UserMgmtError(
      `You don't have the authority to ${action} a ${targetRole.replace(/_/g, ' ')}. You can only manage roles below your own.`,
      'FORBIDDEN_ROLE', 403,
    );
  }
}

// ─── Create ──────────────────────────────────────────────────────────────────

export interface CreateInput {
  fullName: string; email: string; phone: string; password: string;
  role: string; region?: string; district?: string; address?: string;
  ghanaCardNumber?: string;
}

export async function createManagedUser(actor: { id: string; role: string }, input: CreateInput) {
  if (!input.fullName?.trim() || !input.email?.trim() || !input.password) {
    throw new UserMgmtError('Name, email and a password are required.', 'MISSING_FIELDS');
  }
  guard(actor.role, input.role, 'create');

  if (await emailExists(input.email.toLowerCase())) {
    throw new UserMgmtError('An account with that email already exists.', 'EMAIL_TAKEN', 409);
  }

  const user = await createUser({
    fullName: input.fullName.trim(),
    email: input.email.toLowerCase().trim(),
    phone: input.phone?.trim() || '',
    password: input.password,
    role: input.role as any,
    region: input.region,
    district: input.district,
    address: input.address || '',
    ghanaCardNumber: input.ghanaCardNumber,
  });

  await audit({
    actorId: actor.id, actorRole: actor.role, action: 'user.create',
    entityType: 'user', entityId: user.id,
    summary: `Created ${user.full_name} as ${user.role}`,
  });

  return shape(user);
}

// ─── Update profile / role / status ──────────────────────────────────────────

async function loadTarget(id: string) {
  const [u] = await q<any>(`SELECT * FROM users WHERE id = $1::uuid`, [id]);
  if (!u) throw new UserMgmtError('User not found.', 'NOT_FOUND', 404);
  return u;
}

export async function updateManagedUser(
  actor: { id: string; role: string },
  id: string,
  changes: { fullName?: string; phone?: string; region?: string; district?: string; address?: string },
) {
  const target = await loadTarget(id);
  guard(actor.role, target.role, 'edit');

  const fields: string[] = [];
  const params: any[] = [];
  const set = (col: string, val: any) => { params.push(val); fields.push(`${col} = $${params.length}`); };

  if (changes.fullName !== undefined) set('full_name', changes.fullName.trim());
  if (changes.phone !== undefined) set('phone', changes.phone.trim());
  if (changes.region !== undefined) set('region', changes.region);
  if (changes.district !== undefined) set('district', changes.district);
  if (changes.address !== undefined) set('address', changes.address);

  if (fields.length === 0) return shape(target);

  params.push(id);
  const [updated] = await q<any>(
    `UPDATE users SET ${fields.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
    params,
  );

  await audit({
    actorId: actor.id, actorRole: actor.role, action: 'user.update',
    entityType: 'user', entityId: id, summary: `Updated ${updated.full_name}`,
  });
  return shape(updated);
}

/**
 * Change a user's role.
 *
 * Guarded twice: the actor must outrank BOTH the current role and the new role.
 * You can't promote someone into a tier you couldn't create yourself, and you
 * can't grab someone who already outranks you.
 */
export async function changeUserRole(
  actor: { id: string; role: string }, id: string, newRole: string,
) {
  if (actor.id === id) {
    throw new UserMgmtError('You cannot change your own role.', 'SELF', 403);
  }
  const target = await loadTarget(id);
  guard(actor.role, target.role, 'reassign');
  guard(actor.role, newRole, 'assign');

  const [updated] = await q<any>(
    `UPDATE users SET role = $2, updated_at = now() WHERE id = $1::uuid RETURNING *`,
    [id, newRole],
  );

  await audit({
    actorId: actor.id, actorRole: actor.role, action: 'user.role_change',
    entityType: 'user', entityId: id,
    summary: `Changed ${updated.full_name} from ${target.role} to ${newRole}`,
  });
  return shape(updated);
}

/**
 * Set account status (active / suspended / flagged). This is our "remove" — we
 * suspend rather than delete, so a user's financial history stays intact and
 * auditable. Reactivation is the same call with 'active'.
 */
export async function setUserStatus(
  actor: { id: string; role: string }, id: string, status: 'active' | 'suspended' | 'flagged',
) {
  if (actor.id === id) {
    throw new UserMgmtError('You cannot change your own account status.', 'SELF', 403);
  }
  if (!['active', 'suspended', 'flagged'].includes(status)) {
    throw new UserMgmtError('Invalid status.', 'BAD_STATUS');
  }
  const target = await loadTarget(id);
  guard(actor.role, target.role, 'suspend');

  const [updated] = await q<any>(
    `UPDATE users SET account_status = $2::account_status, updated_at = now()
      WHERE id = $1::uuid RETURNING *`,
    [id, status],
  );

  await audit({
    actorId: actor.id, actorRole: actor.role, action: `user.${status}`,
    entityType: 'user', entityId: id,
    summary: `Set ${updated.full_name} to ${status}`,
  });
  return shape(updated);
}

export async function resetUserPassword(
  actor: { id: string; role: string }, id: string, newPassword: string,
) {
  if (!newPassword || newPassword.length < 6) {
    throw new UserMgmtError('The new password must be at least 6 characters.', 'WEAK');
  }
  const target = await loadTarget(id);
  guard(actor.role, target.role, 'reset the password of');

  const hash = await hashPassword(newPassword);
  await q(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1::uuid`, [id, hash]);

  await audit({
    actorId: actor.id, actorRole: actor.role, action: 'user.password_reset',
    entityType: 'user', entityId: id, summary: `Reset password for ${target.full_name}`,
  });
  return { ok: true };
}
