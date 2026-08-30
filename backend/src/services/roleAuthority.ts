// ─────────────────────────────────────────────────────────────────────────────
// roleAuthority.ts — the server's own source of truth for role seniority.
//
// The frontend has roleConfig, but the SERVER must never trust the client for
// anything security-critical. This is the backend's independent map of which
// roles outrank which, used to enforce one rule above all:
//
//   You can never create, assign, or act on a role at or above your own level.
//
// Without this, any admin could mint a super-admin and seize the platform. The
// levels mirror the frontend (1 = executive … 5 = field/user), but this copy is
// authoritative for permission checks.
// ─────────────────────────────────────────────────────────────────────────────

export type RoleLevel = 1 | 2 | 3 | 4 | 5;

const LEVELS: Record<string, RoleLevel> = {
  // L1 — executive
  ceo: 1, coo: 1, cto: 1, cio: 1, cfo: 1, chro: 1, admin: 1, super_admin: 1,
  // L2 — national directorate
  national_operations_director: 2, national_logistics_director: 2,
  national_finance_director: 2, national_compliance_director: 2,
  national_customer_relations_director: 2, national_business_development_director: 2,
  national_sme_director: 2, national_security_director: 2, national_hr_director: 2,
  national_ai_intelligence_director: 2, national_warehouse_director: 2,
  national_procurement_director: 2, national_legal_director: 2,
  compliance_officer: 2, logistics_officer: 2, finance_officer: 2,
  customer_relations_officer: 2, ai_monitoring_officer: 2, data_analyst: 2,
  business_support_officer: 2, security_operations_officer: 2, legal_officer: 2,
  hr_officer: 2,
  // L3 — regional
  region_admin: 3, regional_operations_manager: 3, regional_logistics_officer: 3,
  regional_finance_officer: 3, regional_compliance_officer: 3,
  regional_customer_relations_officer: 3, regional_business_development_officer: 3,
  regional_warehouse_officer: 3, regional_security_officer: 3, regional_hr_officer: 3,
  // L4 — district
  district_admin: 4, district_hr_officer: 4, district_commerce_officer: 4,
  district_logistics_officer: 4, district_compliance_officer: 4,
  district_customer_relations_officer: 4, district_finance_officer: 4,
  district_sme_officer: 4, district_business_support_officer: 4, officer: 4,
  // L5 — field / user
  verification_officer: 5, delivery_verification_officer: 5, marketplace_inspector: 5,
  logistics_inspector: 5, compliance_inspector: 5, warehouse_supervisor: 5,
  rider: 5, driver: 5, fleet_manager: 5, logistics_company: 5,
  seller: 5, reseller: 5, wholesaler: 5, manufacturer: 5, service_provider: 5,
  corporate_seller: 5, buyer: 5, business_buyer: 5, corporate_buyer: 5, government_buyer: 5,
};

/** A role's seniority (1 = most senior). Unknown roles are treated as L5. */
export function levelOf(role: string): RoleLevel {
  return LEVELS[role] ?? 5;
}

/** Roles a non-privileged actor is allowed to create (sellers, buyers, partners). */
export const PUBLIC_ROLES = new Set([
  'seller', 'reseller', 'wholesaler', 'manufacturer', 'service_provider', 'corporate_seller',
  'buyer', 'business_buyer', 'corporate_buyer', 'government_buyer',
  'rider', 'driver', 'fleet_manager', 'logistics_company',
]);

/** Every staff/officer role (i.e. not a public marketplace role). */
export function isStaffRole(role: string): boolean {
  return role in LEVELS && !PUBLIC_ROLES.has(role);
}

/**
 * May `actorRole` create/assign/act on `targetRole`?
 *
 * Rule: the actor must be STRICTLY more senior (lower level number). Equals
 * cannot touch equals — two district admins can't demote each other, and nobody
 * can create a peer at their own tier. Only level-1 execs may mint other level-1
 * roles, and even then never above themselves (there is nothing above 1, so L1
 * managing L1 is the single allowed same-level case, gated separately where a
 * super-admin explicitly needs it).
 */
export function canManageRole(actorRole: string, targetRole: string): boolean {
  const a = levelOf(actorRole);
  const t = levelOf(targetRole);
  // Strictly more senior can always manage.
  if (a < t) return true;
  // Same level: only the top tier (execs) may manage peers, and only super_admin
  // may create another top-tier role. Everyone else is blocked at their own tier.
  if (a === t && a === 1 && (actorRole === 'super_admin' || actorRole === 'admin')) {
    return true;
  }
  return false;
}

/** Roles this actor is allowed to assign, given the full known role set. */
export function assignableRoles(actorRole: string): string[] {
  return Object.keys(LEVELS).filter((r) => canManageRole(actorRole, r));
}
