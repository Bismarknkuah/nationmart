/**
 * User management — with the privilege guardrail under test.
 *
 * The rule that must hold no matter what: you can only create, edit, reassign,
 * or suspend a user BELOW your own level. A district admin cannot mint a CEO; a
 * regional officer cannot suspend a national director; nobody can grab a peer.
 * These tests exist because a hole here is a platform takeover, not a bug.
 */
import { q, closePool } from '../db/pg';
import { createUser } from '../repos/userRepo';
import * as um from '../repos/userMgmtRepo';
import { canManageRole, levelOf } from '../services/roleAuthority';

const URL = process.env.TEST_DATABASE_URL;
const describeIfDb = URL ? describe : describe.skip;
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describe('roleAuthority (pure)', () => {
  test('seniority is enforced strictly', () => {
    expect(levelOf('ceo')).toBe(1);
    expect(levelOf('district_admin')).toBe(4);
    expect(levelOf('seller')).toBe(5);
    expect(levelOf('totally_unknown_role')).toBe(5);   // fail safe: lowest

    // A super admin can manage anyone below, and (as top tier) peers.
    expect(canManageRole('super_admin', 'district_admin')).toBe(true);
    expect(canManageRole('super_admin', 'seller')).toBe(true);
    expect(canManageRole('super_admin', 'ceo')).toBe(true);

    // A district admin can manage field/user roles…
    expect(canManageRole('district_admin', 'seller')).toBe(true);
    expect(canManageRole('district_admin', 'rider')).toBe(true);
    // …but NOT peers or anyone above.
    expect(canManageRole('district_admin', 'district_admin')).toBe(false);
    expect(canManageRole('district_admin', 'region_admin')).toBe(false);
    expect(canManageRole('district_admin', 'ceo')).toBe(false);

    // A regional officer cannot touch a national director.
    expect(canManageRole('regional_finance_officer', 'national_finance_director')).toBe(false);

    // A seller can manage nobody.
    expect(canManageRole('seller', 'buyer')).toBe(false);
  });
});

describeIfDb('User management (PostgreSQL)', () => {
  let superAdmin: any, districtAdmin: any, seller: any, regionAdmin: any;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    superAdmin = await createUser({
      fullName: 'Super Admin', email: `sa-${uniq()}@um.gh`, phone: '0244000801',
      password: 'pw', role: 'super_admin', address: 'Accra', region: 'Greater Accra',
    });
    regionAdmin = await createUser({
      fullName: 'Region Admin', email: `ra-${uniq()}@um.gh`, phone: '0244000802',
      password: 'pw', role: 'region_admin', address: 'Kumasi', region: 'Ashanti',
    });
    districtAdmin = await createUser({
      fullName: 'District Admin', email: `da-${uniq()}@um.gh`, phone: '0244000803',
      password: 'pw', role: 'district_admin', address: 'Kumasi', region: 'Ashanti', district: 'Kumasi Metropolitan',
    });
    seller = await createUser({
      fullName: 'Just Seller', email: `se-${uniq()}@um.gh`, phone: '0244000804',
      password: 'pw', role: 'seller', address: 'Kumasi', region: 'Ashanti',
    });
  });

  afterAll(async () => {
    await q(`DELETE FROM users WHERE email LIKE '%@um.gh'`).catch(() => {});
    await closePool();
  });

  const asSuper = () => ({ id: superAdmin.id, role: 'super_admin' });
  const asDistrict = () => ({ id: districtAdmin.id, role: 'district_admin' });

  // ─── Create ────────────────────────────────────────────────────────────────

  test('a super admin can create a seller', async () => {
    const created = await um.createManagedUser(asSuper(), {
      fullName: 'New Seller', email: `new-${uniq()}@um.gh`, phone: '0244111000',
      password: 'password1', role: 'seller', region: 'Ashanti',
    });
    expect(created.role).toBe('seller');
    expect(created.level).toBe(5);
  });

  test('a super admin can create an officer', async () => {
    const created = await um.createManagedUser(asSuper(), {
      fullName: 'New Officer', email: `newoff-${uniq()}@um.gh`, phone: '0244111001',
      password: 'password1', role: 'district_compliance_officer', region: 'Ashanti', district: 'Kumasi Metropolitan',
    });
    expect(created.role).toBe('district_compliance_officer');
  });

  test('a district admin CANNOT create a peer or anyone above them', async () => {
    await expect(um.createManagedUser(asDistrict(), {
      fullName: 'Sneaky Admin', email: `x-${uniq()}@um.gh`, phone: '0244111002',
      password: 'password1', role: 'district_admin',
    })).rejects.toThrow(/authority/i);

    await expect(um.createManagedUser(asDistrict(), {
      fullName: 'Sneaky CEO', email: `x2-${uniq()}@um.gh`, phone: '0244111003',
      password: 'password1', role: 'ceo',
    })).rejects.toThrow(/authority/i);
  });

  test('a district admin CAN create a seller', async () => {
    const created = await um.createManagedUser(asDistrict(), {
      fullName: 'District Seller', email: `ds-${uniq()}@um.gh`, phone: '0244111004',
      password: 'password1', role: 'seller', region: 'Ashanti',
    });
    expect(created.role).toBe('seller');
  });

  // ─── Role change ─────────────────────────────────────────────────────────

  test('a super admin can promote a seller to an officer', async () => {
    const updated = await um.changeUserRole(asSuper(), seller.id, 'district_logistics_officer');
    expect(updated.role).toBe('district_logistics_officer');
    // put it back
    await um.changeUserRole(asSuper(), seller.id, 'seller');
  });

  test('a district admin CANNOT promote someone into a tier above itself', async () => {
    await expect(um.changeUserRole(asDistrict(), seller.id, 'region_admin'))
      .rejects.toThrow(/authority/i);
  });

  test('nobody can change their own role', async () => {
    await expect(um.changeUserRole(asSuper(), superAdmin.id, 'seller'))
      .rejects.toThrow(/your own role/i);
  });

  test('a district admin cannot reassign a role it does not outrank', async () => {
    // regionAdmin outranks districtAdmin, so districtAdmin can't touch them.
    await expect(um.changeUserRole(asDistrict(), regionAdmin.id, 'seller'))
      .rejects.toThrow(/authority/i);
  });

  // ─── Status (soft delete) ──────────────────────────────────────────────────

  test('a super admin can suspend and reactivate a user', async () => {
    const suspended = await um.setUserStatus(asSuper(), seller.id, 'suspended');
    expect(suspended.status).toBe('suspended');

    const active = await um.setUserStatus(asSuper(), seller.id, 'active');
    expect(active.status).toBe('active');
  });

  test('a district admin cannot suspend someone above them', async () => {
    await expect(um.setUserStatus(asDistrict(), regionAdmin.id, 'suspended'))
      .rejects.toThrow(/authority/i);
  });

  test('nobody can suspend themselves', async () => {
    await expect(um.setUserStatus(asSuper(), superAdmin.id, 'suspended'))
      .rejects.toThrow(/your own/i);
  });

  // ─── Listing ────────────────────────────────────────────────────────────

  test('listing supports filters and pagination', async () => {
    const all = await um.listUsers({ limit: 5 });
    expect(all.users.length).toBeLessThanOrEqual(5);
    expect(all.total).toBeGreaterThan(0);

    const sellers = await um.listUsers({ role: 'seller', limit: 50 });
    expect(sellers.users.every((u) => u.role === 'seller')).toBe(true);

    const search = await um.listUsers({ search: 'district admin' });
    expect(search.users.some((u) => /district admin/i.test(u.fullName))).toBe(true);
  });

  test('the assignable-roles list reflects the actor’s authority', async () => {
    const superCan = um.rolesActorCanAssign('super_admin');
    expect(superCan).toContain('seller');
    expect(superCan).toContain('district_admin');

    const districtCan = um.rolesActorCanAssign('district_admin');
    expect(districtCan).toContain('seller');
    expect(districtCan).not.toContain('district_admin');
    expect(districtCan).not.toContain('ceo');
  });
});
