/**
 * Auth end-to-end — real Express routes, real PostgreSQL, real bcrypt, real JWT.
 *
 * This is the batch-1 acceptance test: if these pass, registration, login and
 * the protected-route guard genuinely work on Postgres with no MongoDB involved.
 */
import express from 'express';
import request from 'supertest';
import { q, closePool } from '../db/pg';
import { register, login, getMe, updateProfile, changePassword } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const URL = process.env.TEST_DATABASE_URL;
const describeIfDb = URL ? describe : describe.skip;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.post('/api/auth/register', register);
  app.post('/api/auth/login', login);
  app.get('/api/auth/me', authenticate as any, getMe as any);
  app.patch('/api/auth/profile', authenticate as any, updateProfile as any);
  app.post('/api/auth/change-password', authenticate as any, changePassword as any);
  return app;
}

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

/**
 * Audit writes are deliberately fire-and-forget — auditing must never be able to
 * fail a login. So in tests we poll briefly rather than assume it has landed.
 */
async function waitForAudit(action: string, timeoutMs = 2000): Promise<number> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const rows = await q<any>(`SELECT count(*)::int AS n FROM audit_logs WHERE action = $1`, [action]);
    if (rows[0].n > 0) return rows[0].n;
    await new Promise((r) => setTimeout(r, 50));
  }
  return 0;
}

// A structurally valid Ghana Card: GHA-XXXXXXXXX-X (9 digits + check digit).
let cardSeq = 0;
const ghanaCard = () => {
  const nine = String(Date.now() % 1e9).padStart(9, '0').slice(0, 9);
  const check = (cardSeq++) % 10;
  return `GHA-${nine.slice(0, 8)}${cardSeq % 10}-${check}`;
};

describeIfDb('Auth flow (Express + PostgreSQL)', () => {
  const app = makeApp();
  process.env.JWT_SECRET = 'test-secret';

  beforeAll(() => { process.env.DATABASE_URL = URL; });
  afterAll(async () => {
    await q(`DELETE FROM users WHERE email LIKE '%@e2e.gh'`).catch(() => {});
    await closePool();
  });

  const seller = {
    fullName: 'Kwame Adjei',
    email: `kwame-${uniq()}@e2e.gh`,
    phone: '0244111222',
    password: 'StrongPass123',
    role: 'seller',
    address: 'Adum, Kumasi',
    region: 'Ashanti',
    district: 'Kumasi Metropolitan',
    ghanaCardNumber: ghanaCard(),
  };

  let token = '';

  test('registers a seller with a free first year', async () => {
    const res = await request(app).post('/api/auth/register').send(seller);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('seller');
    expect(res.body.user.fullName).toBe('Kwame Adjei');
    expect(res.body.user.username).toBeTruthy();       // auto-generated
    expect(res.body.user).not.toHaveProperty('password');
    expect(res.body.user).not.toHaveProperty('password_hash');

    // The trial subscription was written in the same transaction.
    const [sub] = await q<any>(
      `SELECT s.status, s.plan, s.amount FROM subscriptions s
       JOIN users u ON u.id = s.user_id WHERE u.email = $1`, [seller.email.toLowerCase()]);
    expect(sub.status).toBe('trial');
    expect(sub.plan).toBe('yearly');
    expect(Number(sub.amount)).toBe(200);

    // And a welcome notification landed.
    const notes = await q<any>(
      `SELECT n.title FROM notifications n JOIN users u ON u.id = n.user_id
        WHERE u.email = $1`, [seller.email.toLowerCase()]);
    expect(notes.length).toBe(1);
    expect(notes[0].title).toMatch(/welcome/i);
  });

  test('a seller who gives Mobile Money at signup has a payout method ready', async () => {
    const email = `payout-momo-${uniq()}@e2e.gh`;
    const res = await request(app).post('/api/auth/register').send({
      fullName: 'Akosua Payout', email, phone: '0244333444',
      password: 'StrongPass123', role: 'seller', address: 'Adum, Kumasi',
      region: 'Ashanti', district: 'Kumasi Metropolitan', ghanaCardNumber: ghanaCard(),
      momoNumber: '0244333444', momoNetwork: 'mtn',
    });

    expect(res.status).toBe(201);
    // They gave us somewhere to pay them, so the app should NOT gate them.
    expect(res.body.payoutMethodRequired).toBe(false);

    // The MoMo method was actually saved, and can receive payouts.
    const methods = await q<any>(
      `SELECT pm.kind, pm.momo_network FROM payment_methods pm
        JOIN users u ON u.id = pm.user_id WHERE u.email = $1`, [email.toLowerCase()]);
    expect(methods).toHaveLength(1);
    expect(methods[0].kind).toBe('mobile_money');
    expect(methods[0].momo_network).toBe('mtn');
  });

  test('a seller with NO payout method is flagged so the app can gate them', async () => {
    const email = `payout-none-${uniq()}@e2e.gh`;
    const res = await request(app).post('/api/auth/register').send({
      fullName: 'Yaw NoPayout', email, phone: '0244555666',
      password: 'StrongPass123', role: 'seller', address: 'Adum, Kumasi',
      region: 'Ashanti', district: 'Kumasi Metropolitan', ghanaCardNumber: ghanaCard(),
      // no momoNumber
    });

    expect(res.status).toBe(201);            // we let them IN…
    expect(res.body.payoutMethodRequired).toBe(true);   // …but flag the gate
    expect(res.body.nextStep).toMatch(/payout method/i);

    const methods = await q<any>(
      `SELECT count(*) AS n FROM payment_methods pm
        JOIN users u ON u.id = pm.user_id WHERE u.email = $1`, [email.toLowerCase()]);
    expect(Number(methods[0].n)).toBe(0);
  });

  test('a buyer is never asked for a payout method', async () => {
    const email = `payout-buyer-${uniq()}@e2e.gh`;
    const res = await request(app).post('/api/auth/register').send({
      fullName: 'Ama Buyer', email, phone: '0244777888',
      password: 'StrongPass123', role: 'buyer', address: 'Accra',
      region: 'Greater Accra', district: 'Accra Metropolitan', ghanaCardNumber: ghanaCard(),
    });

    expect(res.status).toBe(201);
    expect(res.body.payoutMethodRequired).toBe(false);   // buyers aren't owed money
  });

  test('rejects a duplicate email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      ...seller, ghanaCardNumber: ghanaCard(),
    });
    expect(res.status).toBe(409);
  });

  test('rejects a duplicate Ghana Card', async () => {
    const res = await request(app).post('/api/auth/register').send({
      ...seller, email: `other-${uniq()}@e2e.gh`,
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/ghana card/i);
  });

  test('rejects self-assigning an admin role', async () => {
    const res = await request(app).post('/api/auth/register').send({
      ...seller, email: `sneaky-${uniq()}@e2e.gh`, ghanaCardNumber: ghanaCard(),
      role: 'admin',                        // not a self-signup role
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('buyer');   // silently downgraded, never admin
  });

  test('logs in with email and returns a working token', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ identifier: seller.email, password: seller.password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    token = res.body.token;

    // The success was audited (fire-and-forget, so poll for it).
    expect(await waitForAudit('login.success')).toBeGreaterThan(0);
  });

  test('logs in with phone or username too', async () => {
    const byPhone = await request(app).post('/api/auth/login')
      .send({ identifier: seller.phone, password: seller.password });
    expect(byPhone.status).toBe(200);
  });

  test('rejects a wrong password and audits the failure', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ identifier: seller.email, password: 'not-the-password' });

    expect(res.status).toBe(401);
    // Never reveals whether the account exists.
    expect(res.body.error).toBe('Invalid login or password');

    expect(await waitForAudit('login.fail')).toBeGreaterThan(0);
  });

  test('a protected route rejects a missing or bad token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer rubbish')).status).toBe(401);
  });

  test('a protected route works with a valid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(seller.email.toLowerCase());
    expect(res.body.subscription.plan).toBe('yearly');
  });

  test('profile update cannot escalate role', async () => {
    const res = await request(app).patch('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Kwame A. Adjei', role: 'admin', isApproved: true });

    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe('Kwame A. Adjei');
    expect(res.body.user.role).toBe('seller');    // still a seller
  });

  test('password change requires the current password, then works', async () => {
    const wrong = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrong', newPassword: 'BrandNew456' });
    expect(wrong.status).toBe(401);

    const ok = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: seller.password, newPassword: 'BrandNew456' });
    expect(ok.status).toBe(200);

    // Old password no longer works; new one does.
    const oldPw = await request(app).post('/api/auth/login')
      .send({ identifier: seller.email, password: seller.password });
    expect(oldPw.status).toBe(401);

    const newPw = await request(app).post('/api/auth/login')
      .send({ identifier: seller.email, password: 'BrandNew456' });
    expect(newPw.status).toBe(200);
  });

  test('a suspended account cannot log in', async () => {
    await q(`UPDATE users SET account_status = 'suspended' WHERE email = $1`,
      [seller.email.toLowerCase()]);

    const res = await request(app).post('/api/auth/login')
      .send({ identifier: seller.email, password: 'BrandNew456' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/suspended/i);

    // And an existing token is refused immediately — no waiting for expiry.
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(403);
  });

  test('a rider registers into pending review, not live', async () => {
    const res = await request(app).post('/api/auth/register').send({
      fullName: 'Kojo Rider', email: `kojo-${uniq()}@e2e.gh`, phone: '0244999888',
      password: 'RiderPass1', role: 'rider', address: 'Asokwa, Kumasi',
      region: 'Ashanti', district: 'Kumasi Metropolitan',
      ghanaCardNumber: ghanaCard(), vehicleLicense: 'DL-4471',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('rider');
    expect(res.body.user.isApproved).toBe(false);
    expect(res.body.user.accountStatus).toBe('pending_review');
    expect(res.body.user.partnerCode).toMatch(/^NM-R/);   // partner code issued
  });
});
