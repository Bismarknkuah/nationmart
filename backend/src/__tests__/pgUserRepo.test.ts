/**
 * User repository tests — against a REAL PostgreSQL database.
 *
 * Auth is the foundation everything else stands on, so these check the things
 * that actually protect the business: passwords are never stored in the clear,
 * one Ghana Card cannot open two accounts, riders land in review rather than
 * live, and a user cannot escalate their own role via the profile endpoint.
 */
import { q, closePool } from '../db/pg';
import {
  createUser, findByEmail, findById, verifyPassword, changePassword,
  updateProfile, publicUser, emailExists, ghanaCardExists,
  isSellerRole, isPartnerRole,
} from '../repos/userRepo';

const URL = process.env.TEST_DATABASE_URL;
const describeIfDb = URL ? describe : describe.skip;

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describeIfDb('User repository (PostgreSQL)', () => {
  beforeAll(() => { process.env.DATABASE_URL = URL; });
  afterAll(async () => {
    await q(`DELETE FROM users WHERE email LIKE '%@authtest.gh'`).catch(() => {});
    await closePool();
  });

  test('passwords are hashed with bcrypt, never stored in the clear', async () => {
    const email = `kofi-${uniq()}@authtest.gh`;
    const user = await createUser({
      fullName: 'Kofi Mensah', email, phone: '0244000001',
      password: 'CorrectHorse123', role: 'seller', address: 'Adum, Kumasi',
      region: 'Ashanti', district: 'Kumasi Metropolitan',
      ghanaCardNumber: `GHA-${uniq()}-1`,
    });

    const row = await findByEmail(email);
    expect(row).not.toBeNull();
    expect(row!.password_hash).not.toBe('CorrectHorse123');   // never plaintext
    expect(row!.password_hash.startsWith('$2')).toBe(true);   // a real bcrypt hash

    expect(await verifyPassword('CorrectHorse123', row!.password_hash)).toBe(true);
    expect(await verifyPassword('wrong-password', row!.password_hash)).toBe(false);

    // And it never leaves the repo.
    expect(JSON.stringify(publicUser(user))).not.toContain('password');
  });

  test('email is normalised and unique', async () => {
    const email = `AMA-${uniq()}@AuthTest.GH`;
    await createUser({
      fullName: 'Ama Owusu', email, phone: '0244000002',
      password: 'pw', role: 'buyer', address: 'Accra',
      ghanaCardNumber: `GHA-${uniq()}-2`,
    });
    expect(await emailExists(email.toLowerCase())).toBe(true);
    expect(await emailExists(email.toUpperCase())).toBe(true);   // case-insensitive

    await expect(createUser({
      fullName: 'Impostor', email: email.toLowerCase(), phone: '0244000003',
      password: 'pw', role: 'buyer', address: 'Accra',
    })).rejects.toThrow();
  });

  test('one Ghana Card cannot open two accounts', async () => {
    const card = `GHA-${uniq()}-9`;
    await createUser({
      fullName: 'Real Person', email: `real-${uniq()}@authtest.gh`, phone: '0244000004',
      password: 'pw', role: 'buyer', address: 'Accra', ghanaCardNumber: card,
    });
    expect(await ghanaCardExists(card)).toBe(true);

    // The database refuses a second account on the same card.
    await expect(createUser({
      fullName: 'Fraudster', email: `fraud-${uniq()}@authtest.gh`, phone: '0244000005',
      password: 'pw', role: 'seller', address: 'Accra', ghanaCardNumber: card,
    })).rejects.toThrow();
  });

  test('buyers go live immediately; riders wait for approval', async () => {
    const buyer = await createUser({
      fullName: 'Efua Buyer', email: `buyer-${uniq()}@authtest.gh`, phone: '0244000006',
      password: 'pw', role: 'buyer', address: 'Accra', ghanaCardNumber: `GHA-${uniq()}-3`,
    });
    expect(buyer.is_approved).toBe(true);
    expect(buyer.account_status).toBe('active');

    const rider = await createUser({
      fullName: 'Kojo Rider', email: `rider-${uniq()}@authtest.gh`, phone: '0244000007',
      password: 'pw', role: 'rider', address: 'Kumasi', ghanaCardNumber: `GHA-${uniq()}-4`,
      vehicleLicense: 'DL-9932',
    });
    expect(rider.is_approved).toBe(false);
    expect(rider.account_status).toBe('pending_review');
    expect(rider.pending_reason).toMatch(/logistics/i);
  });

  test('seller and subscription are created atomically', async () => {
    const seller = await createUser({
      fullName: 'Yaa Trader', email: `yaa-${uniq()}@authtest.gh`, phone: '0244000008',
      password: 'pw', role: 'seller', address: 'Kumasi', ghanaCardNumber: `GHA-${uniq()}-5`,
      subscription: { status: 'trial', plan: 'yearly', amount: 200 },
    });
    const [sub] = await q<any>(
      `SELECT status, plan, amount FROM subscriptions WHERE user_id = $1::uuid`, [seller.id]);
    expect(sub.plan).toBe('yearly');
    expect(Number(sub.amount)).toBe(200);
    expect(sub.status).toBe('trial');
  });

  test('a user cannot escalate their own role or approval via profile update', async () => {
    const user = await createUser({
      fullName: 'Normal User', email: `normal-${uniq()}@authtest.gh`, phone: '0244000009',
      password: 'pw', role: 'buyer', address: 'Accra', ghanaCardNumber: `GHA-${uniq()}-6`,
    });

    // A malicious payload trying to become an admin.
    const updated = await updateProfile(user.id, {
      fullName: 'Normal User Updated',
      role: 'admin',              // must be ignored
      isApproved: true,           // must be ignored
      accountStatus: 'active',    // must be ignored
      password_hash: 'pwned',     // must be ignored
    });

    expect(updated!.full_name).toBe('Normal User Updated');   // allowed field applied
    expect(updated!.role).toBe('buyer');                      // escalation refused
    expect(updated!.password_hash).toBe(user.password_hash);  // hash untouched
  });

  test('changing a password invalidates the old one', async () => {
    const email = `pw-${uniq()}@authtest.gh`;
    const user = await createUser({
      fullName: 'Pass Changer', email, phone: '0244000010',
      password: 'OldPassword1', role: 'buyer', address: 'Accra',
      ghanaCardNumber: `GHA-${uniq()}-7`,
    });

    await changePassword(user.id, 'BrandNewPassword2');
    const after = await findById(user.id);

    expect(await verifyPassword('OldPassword1', after!.password_hash)).toBe(false);
    expect(await verifyPassword('BrandNewPassword2', after!.password_hash)).toBe(true);
  });

  test('role helpers classify sellers and partners', () => {
    expect(isSellerRole('wholesaler')).toBe(true);
    expect(isSellerRole('buyer')).toBe(false);
    expect(isPartnerRole('driver')).toBe(true);
    expect(isPartnerRole('seller')).toBe(false);
  });
});
