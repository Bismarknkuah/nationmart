import bcrypt from 'bcryptjs';
import { q, tx } from '../db/pg';

/**
 * User repository — PostgreSQL.
 *
 * Replaces the Mongoose User model. Two behaviours that used to live in
 * Mongoose middleware now live here explicitly, which is honestly clearer:
 *   • password hashing (was a pre('save') hook)
 *   • username generation (was a pre('save') hook)
 * Hidden hooks that mutate data on save are exactly the kind of magic that
 * makes a money system hard to reason about.
 */

export type UserRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  username: string | null;
  password_hash: string;
  role: string;
  company: string | null;
  country: string;
  region: string;
  district: string;
  address: string;
  department: string | null;
  account_status: string;
  duty_status: string | null;
  id_type: string;
  id_number: string;
  ghana_card_number: string | null;
  ghana_card_status: string;
  ghana_card_verified_at: Date | null;
  payment_methods: string[];
  momo_number: string | null;
  momo_network: string | null;
  business_reg_number: string | null;
  tax_id_number: string | null;
  is_approved: boolean;
  pending_reason: string | null;
  partner_code: string | null;
  vehicle_license: string | null;
  accepted_terms: boolean;
  terms_version: string;
  last_login: Date | null;
  created_at: Date;
};

export const SELLER_ROLES = [
  'seller', 'reseller', 'manufacturer', 'wholesaler', 'service_provider', 'corporate_seller',
] as const;

export const PARTNER_ROLES = ['rider', 'driver', 'fleet_manager', 'logistics_company'] as const;

export const SELF_SIGNUP_ROLES = [
  'buyer', 'business_buyer', 'corporate_buyer', 'government_buyer',
  ...SELLER_ROLES, ...PARTNER_ROLES,
] as const;

export const isSellerRole = (r: string) => (SELLER_ROLES as readonly string[]).includes(r);
export const isPartnerRole = (r: string) => (PARTNER_ROLES as readonly string[]).includes(r);

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, await bcrypt.genSalt(SALT_ROUNDS));
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** A URL-safe, unique-ish handle derived from the person's name. */
export async function generateUsername(fullName: string): Promise<string> {
  const base = (fullName || 'user')
    .toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'user';
  for (let i = 0; i < 12; i++) {
    const candidate = i === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    const taken = await q(`SELECT 1 FROM users WHERE username = $1`, [candidate]);
    if (taken.length === 0) return candidate;
  }
  return `${base}${Date.now().toString().slice(-6)}`;
}

export async function findByEmail(email: string): Promise<UserRow | null> {
  const rows = await q<UserRow>(`SELECT * FROM users WHERE email = $1`, [String(email).toLowerCase()]);
  return rows[0] ?? null;
}

export async function findById(id: string): Promise<UserRow | null> {
  const rows = await q<UserRow>(`SELECT * FROM users WHERE id = $1::uuid`, [id]);
  return rows[0] ?? null;
}

export async function emailExists(email: string): Promise<boolean> {
  const rows = await q(`SELECT 1 FROM users WHERE email = $1`, [String(email).toLowerCase()]);
  return rows.length > 0;
}

export async function ghanaCardExists(card: string): Promise<boolean> {
  const rows = await q(`SELECT 1 FROM users WHERE ghana_card_number = $1`, [card]);
  return rows.length > 0;
}

export interface CreateUserInput {
  fullName: string;
  email: string;
  phone: string;
  password: string;              // plaintext; hashed here
  role: string;
  company?: string;
  country?: string;
  region?: string;
  district?: string;
  address: string;
  idType?: string;
  idNumber?: string;
  ghanaCardNumber?: string;
  ghanaCardStatus?: string;
  ghanaCardVerifiedAt?: Date | null;
  paymentMethods?: string[];
  momoNumber?: string;
  momoNetwork?: string;
  businessRegNumber?: string;
  taxIdNumber?: string;
  partnerCode?: string;
  vehicleLicense?: string;
  termsVersion?: string;
  // Subscription, created in the same transaction.
  subscription?: {
    status?: string;
    plan?: string;
    amount?: number;
    trialEndsAt?: Date | null;
    currentPeriodEnd?: Date | null;
  };
}

/**
 * Create a user and their subscription atomically.
 *
 * If the subscription insert fails, the user is rolled back too — we never end
 * up with a seller who exists but has no billing row, which is the sort of
 * half-written state that used to be possible without transactions.
 */
export async function createUser(input: CreateUserInput): Promise<UserRow> {
  const passwordHash = await hashPassword(input.password);
  const username = await generateUsername(input.fullName);

  // Buyers/admins are live immediately; riders and drivers await a logistics officer.
  const isApproved = ['buyer', 'admin', 'district_admin'].includes(input.role);
  const needsReview = input.role === 'rider' || input.role === 'driver';

  return tx(async (c) => {
    const { rows } = await c.query<UserRow>(
      `INSERT INTO users (
         full_name, email, phone, username, password_hash, role, company,
         country, region, district, address, id_type, id_number,
         ghana_card_number, ghana_card_status, ghana_card_verified_at,
         payment_methods, momo_number, momo_network, business_reg_number, tax_id_number,
         account_status, is_approved, pending_reason, partner_code, vehicle_license,
         accepted_terms, terms_accepted_at, terms_version
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,
         $8,$9,$10,$11,$12::id_kind,$13,
         $14,$15::ghana_card_state,$16,
         $17,$18,$19,$20,$21,
         $22::account_status,$23,$24,$25,$26,
         TRUE, now(), $27
       ) RETURNING *`,
      [
        input.fullName,
        String(input.email).toLowerCase(),
        input.phone,
        username,
        passwordHash,
        input.role,
        input.company ?? null,
        input.country ?? 'Ghana',
        input.region ?? '',
        input.district ?? '',
        input.address,
        input.idType ?? 'ghana_card',
        input.idNumber ?? '',
        input.ghanaCardNumber || null,
        input.ghanaCardStatus ?? 'unverified',
        input.ghanaCardVerifiedAt ?? null,
        input.paymentMethods ?? [],
        input.momoNumber ?? null,
        input.momoNetwork ?? null,
        input.businessRegNumber ?? null,
        input.taxIdNumber ?? null,
        needsReview ? 'pending_review' : 'active',
        isApproved,
        needsReview ? 'Awaiting logistics-officer approval' : null,
        input.partnerCode ?? null,
        input.vehicleLicense ?? null,
        input.termsVersion ?? 'v1',
      ],
    );
    const user = rows[0];

    const s = input.subscription;
    if (s) {
      await c.query(
        `INSERT INTO subscriptions (user_id, status, plan, amount, trial_ends_at, current_period_end)
         VALUES ($1::uuid, $2::subscription_status, $3::subscription_plan, $4::numeric, $5, $6)`,
        [
          user.id,
          s.status ?? 'trial',
          s.plan ?? 'yearly',
          (s.amount ?? 0).toFixed(2),
          s.trialEndsAt ?? null,
          s.currentPeriodEnd ?? null,
        ],
      );
    }
    return user;
  });
}

/** Fields a user is allowed to change about themselves. */
const SELF_EDITABLE = [
  'full_name', 'phone', 'company', 'region', 'district', 'address',
  'momo_number', 'momo_network', 'business_reg_number', 'tax_id_number',
  'duty_status',
] as const;

export async function updateProfile(
  userId: string,
  patch: Record<string, any>,
): Promise<UserRow | null> {
  const camelToSnake: Record<string, string> = {
    fullName: 'full_name', phone: 'phone', company: 'company', region: 'region',
    district: 'district', address: 'address', momoNumber: 'momo_number',
    momoNetwork: 'momo_network', businessRegNumber: 'business_reg_number',
    taxIdNumber: 'tax_id_number', dutyStatus: 'duty_status',
  };

  const sets: string[] = [];
  const values: any[] = [];
  let i = 1;

  for (const [key, value] of Object.entries(patch)) {
    const col = camelToSnake[key];
    if (!col || !(SELF_EDITABLE as readonly string[]).includes(col)) continue;   // ignore anything else
    if (col === 'duty_status') {
      sets.push(`duty_status = $${i++}::duty_status`);
    } else {
      sets.push(`${col} = $${i++}`);
    }
    values.push(value);
  }
  if (sets.length === 0) return findById(userId);

  values.push(userId);
  const rows = await q<UserRow>(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${i}::uuid RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function changePassword(userId: string, newPlain: string): Promise<void> {
  await q(`UPDATE users SET password_hash = $1 WHERE id = $2::uuid`,
    [await hashPassword(newPlain), userId]);
}

export async function touchLastLogin(userId: string): Promise<void> {
  await q(`UPDATE users SET last_login = now() WHERE id = $1::uuid`, [userId]);
}

/** The shape sent to the client. The password hash never leaves this file. */
export function publicUser(u: UserRow) {
  return {
    _id: u.id,
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    phone: u.phone,
    username: u.username,
    role: u.role,
    company: u.company,
    country: u.country,
    region: u.region,
    district: u.district,
    address: u.address,
    department: u.department,
    accountStatus: u.account_status,
    dutyStatus: u.duty_status,
    isApproved: u.is_approved,
    pendingReason: u.pending_reason,
    ghanaCardStatus: u.ghana_card_status,
    momoNumber: u.momo_number,
    momoNetwork: u.momo_network,
    partnerCode: u.partner_code,
    createdAt: u.created_at,
  };
}
