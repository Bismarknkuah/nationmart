/**
 * Create the first super-admin.
 *
 *   DATABASE_URL=... npx ts-node src/scripts/createSuperAdmin.ts
 *
 * Safe to re-run: if the account already exists it is promoted rather than
 * duplicated. Deliberately does NOT wipe anything — unlike the old seed script.
 */
import { q, closePool } from '../db/pg';
import { hashPassword, generateUsername } from '../repos/userRepo';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const email = (process.env.ADMIN_EMAIL || 'admin@nationmart.gh').toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_NAME || 'Platform Administrator';

  if (!password || password.length < 8) {
    throw new Error('Set ADMIN_PASSWORD (at least 8 characters).');
  }

  const existing = await q<any>(`SELECT id, role FROM users WHERE email = $1`, [email]);

  if (existing.length) {
    await q(
      `UPDATE users SET role = 'admin', is_approved = TRUE, account_status = 'active'
        WHERE id = $1::uuid`,
      [existing[0].id],
    );
    console.log(`Promoted existing account ${email} to admin.`);
  } else {
    const rows = await q<any>(
      `INSERT INTO users (full_name, email, phone, username, password_hash, role,
                          country, region, district, address,
                          is_approved, account_status, accepted_terms, terms_accepted_at)
       VALUES ($1,$2,$3,$4,$5,'admin','Ghana','Greater Accra','Accra Metropolitan',
               'NationMart HQ', TRUE, 'active', TRUE, now())
       RETURNING id`,
      [fullName, email, process.env.ADMIN_PHONE || '0000000000',
       await generateUsername(fullName), await hashPassword(password)],
    );
    await q(
      `INSERT INTO subscriptions (user_id, status, plan, amount)
       VALUES ($1::uuid, 'exempt', 'yearly', 0)`,
      [rows[0].id],
    );
    console.log(`Created super-admin ${email}.`);
  }

  await closePool();
}

main().catch(async (e) => {
  console.error('Failed:', e.message);
  await closePool().catch(() => {});
  process.exit(1);
});
