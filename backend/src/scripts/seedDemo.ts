/**
 * Seed the demo accounts used by the "Quick demo login" panel on /auth/login.
 *
 *   DATABASE_URL=... npx ts-node src/scripts/seedDemo.ts
 *   # or, once wired into package.json:
 *   DATABASE_URL=... npm run seed:demo
 *
 * SAFE TO RE-RUN. Every account is upserted on email — existing rows are updated
 * in place (role/status/password refreshed), never duplicated, and nothing else
 * in the database is touched or wiped. This is a demo convenience, not a reset.
 *
 * The emails and passwords here MUST match DEMO_GROUPS in
 * frontend/src/app/auth/login/page.tsx, or the quick-login buttons will fail.
 */
import { q, closePool } from '../db/pg';
import { hashPassword, generateUsername } from '../repos/userRepo';

type Demo = {
  email: string;
  password: string;
  fullName: string;
  role: string;
  region?: string;
  district?: string;
  company?: string;
  /** subscription state for sellers/partners; officers/admins are 'exempt' */
  sub?: 'trial' | 'active' | 'past_due' | 'exempt';
  country?: string;
};

const DEMOS: Demo[] = [
  // ── Executive & administration ──
  { email: 'ceo@nationmart.gh',       password: 'Officer@1234',  fullName: 'Nana Mensah',      role: 'ceo',           sub: 'exempt' },
  { email: 'admin@nationmart.gh',     password: 'Admin@1234',    fullName: 'Platform Admin',   role: 'super_admin',   sub: 'exempt' },
  { email: 'district@nationmart.gh',  password: 'District@1234', fullName: 'Kwesi District',   role: 'district_admin', region: 'Ashanti', district: 'Kumasi Metropolitan', sub: 'exempt' },

  // ── Finance / HR ──
  { email: 'finance@nationmart.gh',   password: 'Officer@1234',  fullName: 'Abena Finance',    role: 'national_finance_director', sub: 'exempt' },
  { email: 'hr@nationmart.gh',        password: 'Officer@1234',  fullName: 'Kojo HR',          role: 'national_hr_director',      sub: 'exempt' },

  // ── Officers ──
  { email: 'compliance@nationmart.gh',password: 'Officer@1234',  fullName: 'Adjoa Compliance', role: 'national_compliance_director', sub: 'exempt' },
  { email: 'logistics@nationmart.gh', password: 'Officer@1234',  fullName: 'Kwame Logistics',  role: 'regional_logistics_officer', region: 'Ashanti', sub: 'exempt' },
  { email: 'commerce@nationmart.gh',  password: 'Officer@1234',  fullName: 'Yaa Commerce',     role: 'district_commerce_officer', region: 'Ashanti', district: 'Kumasi Metropolitan', sub: 'exempt' },
  { email: 'dlo@nationmart.gh',       password: 'Officer@1234',  fullName: 'Kofi Dispatch',    role: 'district_logistics_officer', region: 'Ashanti', district: 'Kumasi Metropolitan', sub: 'exempt' },

  // ── Sellers ──
  { email: 'kofi@ashantiforest.gh',   password: 'Seller@1234',   fullName: 'Kofi Ashanti',     role: 'seller',       company: 'Ashanti Forest Timber', region: 'Ashanti', district: 'Kumasi Metropolitan', sub: 'trial' },
  { email: 'ama@kumasaw.gh',          password: 'Seller@1234',   fullName: 'Ama Kumasaw',      role: 'seller',       company: 'Kumasaw Boutique',      region: 'Ashanti', district: 'Kumasi Metropolitan', sub: 'active' },
  { email: 'yaw@accrabuild.gh',       password: 'Seller@1234',   fullName: 'Yaw Accra',        role: 'manufacturer', company: 'Accra Build Co.',       region: 'Greater Accra', district: 'Accra Metropolitan', sub: 'past_due' },

  // ── Buyers ──
  { email: 'buyer@timberusa.com',     password: 'Buyer@1234',    fullName: 'John Timber',      role: 'buyer',        country: 'United States', region: '', district: '' },
  { email: 'efua@buyer.gh',           password: 'Buyer@1234',    fullName: 'Efua Buyer',       role: 'buyer',        region: 'Ashanti', district: 'Kumasi Metropolitan' },

  // ── Logistics partners ──
  { email: 'rider@nationmart.gh',     password: 'Rider@1234',    fullName: 'Kwabena Rider',    role: 'rider',        region: 'Ashanti', district: 'Kumasi Metropolitan', sub: 'trial' },
  { email: 'driver@nationmart.gh',    password: 'Driver@1234',   fullName: 'Musah Driver',     role: 'driver',       region: 'Greater Accra', district: 'Accra Metropolitan', sub: 'trial' },
];

let phoneSeq = 200000000; // 0244... range, unique per demo account
function nextPhone(): string {
  phoneSeq += 1;
  return `0${phoneSeq}`.slice(0, 10);
}

async function upsert(d: Demo) {
  const email = d.email.toLowerCase();
  const existing = await q<any>(`SELECT id FROM users WHERE email = $1`, [email]);
  const hash = await hashPassword(d.password);

  // Riders/drivers are normally gated on approval; demo accounts are pre-approved
  // so they are immediately usable.
  const approved = true;
  const status = 'active';

  if (existing.length) {
    await q(
      `UPDATE users
          SET role = $2, password_hash = $3, is_approved = $4,
              account_status = $5, full_name = $6,
              region = COALESCE(NULLIF($7,''), region),
              district = COALESCE(NULLIF($8,''), district),
              company = COALESCE($9, company),
              country = COALESCE($10, country)
        WHERE id = $1::uuid`,
      [existing[0].id, d.role, hash, approved, status, d.fullName,
       d.region ?? '', d.district ?? '', d.company ?? null, d.country ?? 'Ghana'],
    );
    console.log(`  updated  ${email.padEnd(30)} → ${d.role}`);
    return existing[0].id as string;
  }

  const rows = await q<any>(
    `INSERT INTO users (
       full_name, email, phone, username, password_hash, role, company,
       country, region, district, address,
       is_approved, account_status, accepted_terms, terms_accepted_at, terms_version
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,
       $8,$9,$10,$11,
       $12,$13, TRUE, now(), 'v2'
     ) RETURNING id`,
    [
      d.fullName, email, nextPhone(), await generateUsername(d.fullName), hash, d.role, d.company ?? null,
      d.country ?? 'Ghana', d.region ?? 'Greater Accra', d.district ?? 'Accra Metropolitan',
      'NationMart demo', approved, status,
    ],
  );
  const id = rows[0].id as string;

  // A wallet, so balances/withdrawals work in the demo.
  await q(
    `INSERT INTO wallets (user_id, balance) VALUES ($1::uuid, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [id],
  );

  // Subscription: buyers are exempt; everyone else gets the state we asked for.
  // Only create one if the user doesn't already have a subscription (the table
  // has no unique constraint on user_id, so we guard explicitly).
  const subState = d.role === 'buyer' ? 'exempt' : (d.sub ?? 'trial');
  const amount = d.role === 'buyer' ? 0
    : d.role === 'rider' || d.role === 'driver' ? 300 : 200;
  const hasSub = await q<any>(`SELECT 1 FROM subscriptions WHERE user_id = $1::uuid LIMIT 1`, [id]);
  if (!hasSub.length) {
    await q(
      `INSERT INTO subscriptions (user_id, status, plan, amount)
       VALUES ($1::uuid, $2::subscription_status, 'yearly', $3)`,
      [id, subState, amount],
    ).catch(() => { /* subscription is non-critical for demo login */ });
  }

  console.log(`  created  ${email.padEnd(30)} → ${d.role}`);
  return id;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  console.log('Seeding demo accounts (idempotent — safe to re-run):\n');
  for (const d of DEMOS) {
    try {
      await upsert(d);
    } catch (err: any) {
      console.error(`  FAILED   ${d.email}: ${err.message}`);
    }
  }
  console.log(`\nDone. ${DEMOS.length} demo accounts ready.`);
  console.log('Log in from /auth/login → "Quick demo login".');
  await closePool();
}

main().catch(async (e) => {
  console.error('Seed failed:', e.message);
  await closePool().catch(() => {});
  process.exit(1);
});
