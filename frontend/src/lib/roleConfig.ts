// ─────────────────────────────────────────────────────────────────────────────
// roleConfig.ts — the source of truth for every user type.
//
// Turns a user's `role` into:
//   • persona   — dashboard layout (buyer | seller | officer | partner)
//   • level     — RBAC level 1..5 (mirrors backend ROLE_ACCESS_LEVELS)
//   • department + theme (gold premium for executives & directors)
//   • mission   — one-line responsibility
//   • modules   — the named dashboard panels this role should see (from the spec)
//   • can / cannot — capability rules (display + governance reference)
//   • agents    — which AI agents are available to this role
//   • tools     — real, reachable links for this role
// ─────────────────────────────────────────────────────────────────────────────

export type Persona = 'buyer' | 'seller' | 'officer' | 'partner';

export type DepartmentId =
  | 'exec' | 'operations' | 'compliance' | 'logistics' | 'finance' | 'crm'
  | 'ai' | 'sme' | 'bizdev' | 'intl' | 'security' | 'legal' | 'warehouse'
  | 'hr'
  | 'procurement' | 'regional' | 'district' | 'field' | 'fleet'
  | 'commerce' | 'shopping';

export interface DepartmentTheme {
  label: string;
  glyph: string;
  headerGradient: string;
}

export const DEPARTMENTS: Record<DepartmentId, DepartmentTheme> = {
  exec:        { label: 'Executive Management',        glyph: '👑', headerGradient: 'from-slate-900 to-indigo-900' },
  operations:  { label: 'National Operations',         glyph: '🛰️', headerGradient: 'from-slate-800 to-blue-900' },
  compliance:  { label: 'Compliance & Regulatory',     glyph: '🛡️', headerGradient: 'from-emerald-700 to-teal-700' },
  logistics:   { label: 'Logistics & Delivery',        glyph: '🚚', headerGradient: 'from-orange-600 to-amber-600' },
  finance:     { label: 'Finance & Wallet',            glyph: '💰', headerGradient: 'from-yellow-600 to-amber-700' },
  crm:         { label: 'Customer Relations',          glyph: '🤝', headerGradient: 'from-sky-600 to-cyan-700' },
  ai:          { label: 'Data & AI Intelligence',      glyph: '🤖', headerGradient: 'from-violet-700 to-fuchsia-700' },
  sme:         { label: 'SME & Business Support',       glyph: '🏢', headerGradient: 'from-indigo-600 to-blue-700' },
  bizdev:      { label: 'Business Development',         glyph: '📈', headerGradient: 'from-indigo-700 to-violet-700' },
  intl:        { label: 'International Operations',     glyph: '🌍', headerGradient: 'from-teal-700 to-emerald-800' },
  security:    { label: 'Cybersecurity & Trust',       glyph: '🔐', headerGradient: 'from-red-700 to-rose-800' },
  hr:          { label: 'Human Resources',             glyph: '👥', headerGradient: 'from-sky-700 to-blue-800' },
  legal:       { label: 'Legal & Policy',              glyph: '⚖️', headerGradient: 'from-stone-700 to-zinc-800' },
  warehouse:   { label: 'Warehousing & Fulfilment',    glyph: '📦', headerGradient: 'from-amber-700 to-yellow-800' },
  procurement: { label: 'Procurement & Supply',        glyph: '🔗', headerGradient: 'from-cyan-700 to-teal-800' },
  regional:    { label: 'Regional Operations',         glyph: '🗺️', headerGradient: 'from-blue-700 to-indigo-700' },
  district:    { label: 'District Operations',         glyph: '🏛️', headerGradient: 'from-emerald-700 to-green-800' },
  field:       { label: 'Field Operations',            glyph: '🚨', headerGradient: 'from-amber-700 to-orange-800' },
  fleet:       { label: 'Logistics Partner',           glyph: '🛵', headerGradient: 'from-orange-700 to-red-700' },
  commerce:    { label: 'Business',                    glyph: '🏪', headerGradient: 'from-indigo-600 to-blue-500' },
  shopping:    { label: 'Marketplace',                 glyph: '🛍️', headerGradient: 'from-indigo-600 to-blue-500' },
};

// ─────────────────────────────────────────────────────────────────────────────
// AI INTELLIGENCE LAYER (Tier 1)
// ─────────────────────────────────────────────────────────────────────────────
export interface AiAgent {
  id: string;
  name: string;
  glyph: string;
  functions: string[];
  cannot: string[];
}

export const AI_AGENTS: Record<string, AiAgent> = {
  commerce: {
    id: 'commerce', name: 'AI Commerce Assistant', glyph: '🧠',
    functions: ['Product, supplier & customer recommendations', 'Demand & inventory forecasting', 'Pricing optimization', 'Business advice'],
    cannot: ['Approve payments', 'Approve licenses', 'Delete businesses', 'Release funds'],
  },
  fraud: {
    id: 'fraud', name: 'AI Fraud Detection Agent', glyph: '🕵️',
    functions: ['Detect fake stores & reviews', 'Flag suspicious transactions', 'Detect account abuse', 'Spot counterfeit products'],
    cannot: ['Suspend accounts by itself', 'Release or freeze funds'],
  },
  logistics: {
    id: 'logistics', name: 'AI Logistics Agent', glyph: '🛰️',
    functions: ['Route optimization', 'Driver assignment recommendations', 'ETA prediction', 'Delivery batching', 'Traffic prediction'],
    cannot: ['Dispatch without human confirmation'],
  },
  compliance: {
    id: 'compliance', name: 'AI Compliance Agent', glyph: '📋',
    functions: ['License validation', 'Compliance monitoring', 'Regulatory alerts', 'Risk scoring'],
    cannot: ['Approve or revoke licenses', 'Suspend businesses'],
  },
  economic: {
    id: 'economic', name: 'AI Economic Intelligence Agent', glyph: '📊',
    functions: ['Inflation analysis', 'Commerce trends', 'Supply-chain intelligence', 'National demand forecasting'],
    cannot: ['Set national policy', 'Alter financial records'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Persona classification
// ─────────────────────────────────────────────────────────────────────────────
const SELLER_ROLES = ['seller', 'reseller', 'manufacturer', 'wholesaler', 'service_provider', 'corporate_seller'];
const BUYER_ROLES = ['buyer', 'business_buyer', 'corporate_buyer', 'government_buyer'];
const PARTNER_ROLES = ['rider', 'driver', 'fleet_manager', 'logistics_company'];

interface RoleEntry {
  level: 1 | 2 | 3 | 4 | 5;
  dept: DepartmentId;
  mission: string;
  modules: string[];
  can?: string[];
  cannot?: string[];
  agents?: string[];     // override; otherwise derived from dept
}

// Default AI agents by department.
const DEPT_AGENTS: Partial<Record<DepartmentId, string[]>> = {
  exec: ['commerce', 'fraud', 'logistics', 'compliance', 'economic'],
  operations: ['logistics', 'compliance', 'economic'],
  compliance: ['compliance', 'fraud'],
  logistics: ['logistics'],
  finance: ['fraud', 'economic'],
  crm: ['commerce'],
  ai: ['commerce', 'fraud', 'logistics', 'compliance', 'economic'],
  sme: ['commerce', 'economic'],
  bizdev: ['commerce', 'economic'],
  security: ['fraud'],
  legal: ['compliance'],
  warehouse: ['logistics', 'economic'],
  procurement: ['economic', 'logistics'],
  regional: ['logistics', 'compliance', 'economic'],
  district: ['commerce', 'logistics', 'compliance'],
  field: ['compliance'],
  fleet: ['logistics'],
  commerce: ['commerce', 'fraud', 'logistics'],
  shopping: ['commerce'],
  intl: ['economic', 'logistics'],
};

const ROLE_TABLE: Record<string, RoleEntry> = {
  // ══ TIER 2 — EXECUTIVE ════════════════════════════════════════════════════
  ceo: { level: 1, dept: 'exec', mission: 'Set national strategy, approve policy, and oversee the platform.',
    modules: ['National Revenue', 'Active Businesses', 'Active Orders', 'Active Deliveries', 'Regional Performance', 'Fraud Alerts', 'AI Intelligence Reports'],
    can: ['View all data', 'Appoint executives', 'Approve national policies', 'Override operational decisions'],
    cannot: ['Delete audit logs', 'Alter financial records directly'] },
  coo: { level: 1, dept: 'exec', mission: 'Coordinate national operations and clear escalations.',
    modules: ['National Operations', 'Logistics Performance', 'Service Quality', 'Escalated Issues'],
    can: ['Manage national operations', 'Manage directors', 'Approve escalations'], cannot: ['Alter financial ledgers'] },
  cto: { level: 1, dept: 'exec', mission: 'Own platform technology, security, and AI systems.',
    modules: ['Infrastructure Health', 'Security Dashboard', 'API Monitoring', 'AI Monitoring'],
    can: ['Manage platform technology', 'Manage cybersecurity'], cannot: ['Approve business licenses'] },
  cio: { level: 1, dept: 'exec', mission: 'Lead commerce intelligence and national economic insight.',
    modules: ['Commerce Intelligence', 'Analytics', 'AI Monitoring', 'Economic Insights'],
    can: ['Govern analytics', 'Direct AI strategy'], cannot: ['Approve settlements'] },
  cfo: { level: 1, dept: 'finance', mission: 'Govern wallets, escrow, settlements, and financial compliance.',
    modules: ['Wallet System', 'Escrow Accounts', 'Revenue Reports', 'Settlement Reports'],
    can: ['Manage finances', 'Approve settlements'], cannot: ['Approve stores'] },
  chro: { level: 1, dept: 'hr', mission: 'Lead recruitment, training, payroll, and staff governance.',
    modules: ['Employee Management', 'Recruitment', 'Training', 'Payroll'],
    can: ['Manage staff'], cannot: ['Access customer wallets'] },
  admin: { level: 1, dept: 'exec', mission: 'Full-platform super admin: governance, approvals, accountability.',
    modules: ['Full System Visibility', 'User Management', 'Approvals', 'Audit Logs'],
    can: ['Full system access', 'Executive override'], cannot: ['Delete audit logs'] },
  // Aliases used by the live DB / demo seeds
  super_admin: {
    level: 1,
    dept: 'exec',
    mission: 'Full-platform super admin: governance, approvals, accountability.',
    modules: ['Full System Visibility', 'User Management', 'Approvals', 'Audit Logs', 'Command Center'],
    can: ['Full system access', 'Executive override', 'Appoint officers by region and district'],
    cannot: ['Delete audit logs'],
  },
  // Generic officer (demo seeds + SQL promote). Prefer specific roles in production.
  officer: {
    level: 4,
    dept: 'district',
    mission: 'Operate within your assigned region and district: approvals, logistics, and local governance.',
    modules: ['District Overview', 'Task Inbox', 'Local Approvals', 'Rider Activity', 'Complaints'],
    can: ['Act within assigned region/district only'],
    cannot: ['Act outside assigned jurisdiction', 'Change national policy'],
  },

  // ══ TIER 3 — NATIONAL DIRECTORATE ═════════════════════════════════════════
  national_operations_director: { level: 2, dept: 'operations', mission: 'Run national operations across all regions.',
    modules: ['National KPIs', 'Regional Performance', 'Escalations'] },
  national_logistics_director: { level: 2, dept: 'logistics', mission: 'Manage logistics nationwide.',
    modules: ['Nationwide Delivery Map', 'Fleet Monitoring', 'Delivery Performance'], can: ['Manage logistics nationwide'] },
  national_finance_director: { level: 2, dept: 'finance', mission: 'Monitor national finance and transactions.',
    modules: ['Financial Monitoring', 'Transaction Monitoring', 'Settlements'] },
  national_compliance_director: { level: 2, dept: 'compliance', mission: 'Govern compliance for regulated businesses.',
    modules: ['Compliance Cases', 'Suspicious Businesses', 'Regulatory Alerts'], can: ['Suspend businesses'] },
  national_customer_relations_director: { level: 2, dept: 'crm', mission: 'Own national support quality.',
    modules: ['National Complaints', 'Service Metrics', 'Escalation Governance'] },
  national_business_development_director: { level: 2, dept: 'bizdev', mission: 'Drive seller growth and SME adoption nationwide.',
    modules: ['Seller Growth', 'SME Adoption', 'Business Analytics'] },
  national_sme_director: { level: 2, dept: 'sme', mission: 'Drive SME digitisation and rural commerce.',
    modules: ['SME Adoption', 'Seller Growth', 'Training Programs'] },
  national_security_director: { level: 2, dept: 'security', mission: 'Lead cybersecurity and fraud intelligence.',
    modules: ['Cybersecurity Alerts', 'Fraud Monitoring', 'Infrastructure Protection'] },
  national_hr_director: { level: 2, dept: 'hr', mission: 'Run national recruitment, postings, and staff records.',
    modules: ['Staff Directory', 'Recruitment', 'Postings', 'Training'], can: ['Add staff', 'Assign duties'] },
  hr_officer: { level: 2, dept: 'hr', mission: 'Support recruitment and staff administration.',
    modules: ['Staff Directory', 'Onboarding'] },
  national_ai_intelligence_director: { level: 2, dept: 'ai', mission: 'Govern AI models and commerce intelligence.',
    modules: ['AI Models', 'Commerce Intelligence', 'Analytics'] },
  national_warehouse_director: { level: 2, dept: 'warehouse', mission: 'Oversee warehouses and fulfilment centres.',
    modules: ['Warehouses', 'Fulfillment Centers', 'Stock Intelligence'] },
  national_procurement_director: { level: 2, dept: 'procurement', mission: 'Manage supplier networks and procurement.',
    modules: ['Supplier Networks', 'Procurement Activities'] },
  national_legal_director: { level: 2, dept: 'legal', mission: 'Oversee regulatory compliance and dispute governance.',
    modules: ['Policy Cases', 'Dispute Governance', 'Contract Validation'] },

  compliance_officer: { level: 2, dept: 'compliance', mission: 'Verify licenses and handle compliance escalations.',
    modules: ['License Verification', 'Inspection Approvals', 'Compliance Reviews'] },
  logistics_officer: { level: 2, dept: 'logistics', mission: 'Monitor fleets and coordinate dispatch.',
    modules: ['Fleet Monitoring', 'Route Oversight', 'Dispatch Coordination'] },
  finance_officer: { level: 2, dept: 'finance', mission: 'Audit transactions and supervise settlements.',
    modules: ['Transaction Audits', 'Refunds', 'Merchant Settlements'] },
  customer_relations_officer: { level: 2, dept: 'crm', mission: 'Resolve complaints and disputes.',
    modules: ['Complaints', 'Disputes', 'Customer Recovery'] },
  ai_monitoring_officer: { level: 2, dept: 'ai', mission: 'Monitor fraud, recommendation, and pricing models.',
    modules: ['Model Monitoring', 'Fraud Signals', 'Pricing AI'] },
  data_analyst: { level: 2, dept: 'ai', mission: 'Analyse commerce trends and economic movement.',
    modules: ['Commerce Trends', 'Inflation Indicators', 'District Performance'] },
  business_support_officer: { level: 2, dept: 'sme', mission: 'Educate sellers and run growth programmes.',
    modules: ['Seller Education', 'Onboarding Assistance', 'Training Programs'] },
  security_operations_officer: { level: 2, dept: 'security', mission: 'Watch for fraud and platform abuse.',
    modules: ['Suspicious Activity', 'Account Hijacking', 'Payment Fraud'] },
  legal_officer: { level: 2, dept: 'legal', mission: 'Run investigations and enforce policy.',
    modules: ['Compliance Investigations', 'Contract Validation', 'Policy Enforcement'] },

  // ══ TIER 4 — REGIONAL ═════════════════════════════════════════════════════
  region_admin: { level: 3, dept: 'regional', mission: 'Administer all operations across your region.',
    modules: ['Regional KPIs', 'District Performance', 'Approvals'], can: ['Supervise districts'] },
  regional_operations_manager: { level: 3, dept: 'regional', mission: 'Supervise district activity in your region.',
    modules: ['Regional KPIs', 'District Performance'], can: ['Supervise districts'] },
  regional_logistics_officer: { level: 3, dept: 'logistics', mission: 'Manage deliveries across your region.',
    modules: ['Live Logistics Map', 'Delivery Status', 'Fleet Status'], can: ['Manage deliveries in region'] },
  regional_finance_officer: { level: 3, dept: 'finance', mission: 'Handle regional revenue and settlements.',
    modules: ['Regional Revenue', 'Regional Settlements'] },
  regional_compliance_officer: { level: 3, dept: 'compliance', mission: 'Verify businesses and run investigations.',
    modules: ['Business Verification', 'Investigations'] },
  regional_customer_relations_officer: { level: 3, dept: 'crm', mission: 'Manage regional complaints and disputes.',
    modules: ['Complaints', 'Disputes'] },
  regional_business_development_officer: { level: 3, dept: 'bizdev', mission: 'Grow new businesses and SME adoption regionally.',
    modules: ['New Businesses', 'SME Adoption'] },
  regional_warehouse_officer: { level: 3, dept: 'warehouse', mission: 'Oversee regional warehouses and stock flow.',
    modules: ['Regional Warehouses', 'Stock Flow'] },
  regional_security_officer: { level: 3, dept: 'security', mission: 'Handle regional security alerts and fraud cases.',
    modules: ['Security Alerts', 'Fraud Cases'] },
  regional_hr_officer: { level: 3, dept: 'hr', mission: 'Manage staff and recruitment within a region.',
    modules: ['Regional Staff', 'Onboarding', 'Postings'] },

  // ══ TIER 5 — DISTRICT ═════════════════════════════════════════════════════
  district_hr_officer: { level: 4, dept: 'hr', mission: 'Support district staffing and onboarding.',
    modules: ['District Staff', 'Onboarding'] },
  district_admin: { level: 4, dept: 'district', mission: 'Administer your district: approvals and local governance.',
    modules: ['District Overview', 'Store Approvals', 'Local Activity', 'Pending Reviews'] },
  district_commerce_officer: { level: 4, dept: 'commerce', mission: 'Verify businesses and supervise local stores.',
    modules: ['New Stores', 'Store Approvals', 'Local Business Activity'], can: ['Verify businesses'], cannot: ['Approve regulated businesses'] },
  district_logistics_officer: { level: 4, dept: 'logistics', mission: 'Coordinate local deliveries and riders.',
    modules: ['Live District Map', 'Rider Activity', 'Parcel Tracking'], can: ['Assign riders', 'Monitor deliveries'] },
  district_compliance_officer: { level: 4, dept: 'compliance', mission: 'Verify inspections and monitor local businesses.',
    modules: ['Inspections', 'Violations'], can: ['Recommend action'], cannot: ['Suspend businesses'] },
  district_customer_relations_officer: { level: 4, dept: 'crm', mission: 'Handle local disputes and complaints.',
    modules: ['Complaints', 'Disputes'] },
  district_finance_officer: { level: 4, dept: 'finance', mission: 'Handle district transactions and refunds.',
    modules: ['District Transactions', 'Refund Requests'] },
  district_sme_officer: { level: 4, dept: 'sme', mission: 'Train local businesses and support sellers.',
    modules: ['SME Training', 'New Seller Support'] },
  district_business_support_officer: { level: 4, dept: 'sme', mission: 'Train local businesses and support new sellers.',
    modules: ['SME Training', 'New Seller Support'] },

  // ══ TIER 6 — FIELD OPERATIONS ═════════════════════════════════════════════
  verification_officer: { level: 5, dept: 'field', mission: 'Visit and verify businesses in the field.',
    modules: ['Assigned Visits', 'GPS Tracking', 'Verification Requests'], can: ['Verify businesses'], cannot: ['Approve businesses'] },
  delivery_verification_officer: { level: 5, dept: 'field', mission: 'Verify delivery authenticity and parcel disputes.',
    modules: ['Assigned Visits', 'Verification Requests', 'Parcel Disputes'] },
  marketplace_inspector: { level: 5, dept: 'field', mission: 'Inspect physical businesses and warehouses.',
    modules: ['Inspection Tasks', 'Investigation Reports'] },
  logistics_inspector: { level: 5, dept: 'field', mission: 'Audit deliveries and rider performance.',
    modules: ['Delivery Audits', 'Rider Performance'] },
  compliance_inspector: { level: 5, dept: 'field', mission: 'Run inspection tasks and investigations.',
    modules: ['Inspection Tasks', 'Investigation Reports'] },
  warehouse_supervisor: { level: 5, dept: 'warehouse', mission: 'Manage fulfilment centres and inventory.',
    modules: ['Inventory', 'Inbound Shipments', 'Outbound Shipments'] },

  // ══ TIER 7 — LOGISTICS PARTNERS (persona: partner) ════════════════════════
  rider: { level: 5, dept: 'fleet', mission: 'Pick up and deliver orders.',
    modules: ['Assigned Deliveries', 'Navigation', 'Earnings'], can: ['Pick up orders', 'Deliver orders'] },
  driver: { level: 5, dept: 'fleet', mission: 'Run delivery routes and manage vehicle status.',
    modules: ['Delivery Routes', 'Vehicle Status'] },
  fleet_manager: { level: 5, dept: 'fleet', mission: 'Manage vehicles, fuel, and maintenance.',
    modules: ['Vehicles', 'Fuel Usage', 'Maintenance'] },
  logistics_company: { level: 5, dept: 'fleet', mission: 'Manage fleet performance and drivers.',
    modules: ['Fleet Performance', 'Driver Management'] },

  // ══ TIER 8 — BUSINESS USERS (persona: seller) ════════════════════════════
  seller: { level: 5, dept: 'commerce', mission: 'List products, fulfil orders, and grow your store.',
    modules: ['Business Overview', 'Revenue', 'Orders', 'Trust Score', 'Product Management', 'Inventory & Low-stock Alerts', 'Delivery Tracking', 'Wallet & Settlements', 'AI Insights'],
    cannot: ['Access other stores'] },
  reseller: { level: 5, dept: 'commerce', mission: 'Resell products and fulfil orders.',
    modules: ['Business Overview', 'Revenue', 'Orders', 'Inventory', 'Delivery Tracking', 'Wallet & Settlements', 'AI Insights'],
    cannot: ['Access other stores'] },
  wholesaler: { level: 5, dept: 'commerce', mission: 'Supply at scale with distributor and territory management.',
    modules: ['Business Overview', 'Revenue', 'Orders', 'Distributor Management', 'Territory Management', 'Bulk Pricing', 'Supply Chain Analytics', 'AI Insights'],
    cannot: ['Access other stores'] },
  manufacturer: { level: 5, dept: 'commerce', mission: 'Produce, plan, and distribute with traceability.',
    modules: ['Business Overview', 'Revenue', 'Production Planning', 'Factory Management', 'Distributor Networks', 'Product Traceability', 'AI Insights'],
    cannot: ['Access other stores'] },
  service_provider: { level: 5, dept: 'commerce', mission: 'Offer services with bookings and tracking.',
    modules: ['Booking System', 'Service Tracking', 'Customer Ratings', 'Wallet & Settlements', 'AI Insights'],
    cannot: ['Access other providers'] },
  corporate_seller: { level: 5, dept: 'commerce', mission: 'Run multi-branch operations with approval workflows.',
    modules: ['Business Overview', 'Multiple Branches', 'Multiple Managers', 'Approval Workflows', 'Revenue', 'Orders', 'AI Insights'],
    cannot: ['Access other companies'] },

  // ══ TIER 9 — BUYERS (persona: buyer) ══════════════════════════════════════
  buyer: { level: 5, dept: 'shopping', mission: 'Discover products, place orders, and track deliveries.',
    modules: ['Search Products', 'Saved Products', 'Wishlist', 'Active Orders', 'Delivery Tracking', 'Wallet & Refunds', 'AI Assistant'] },
  business_buyer: { level: 5, dept: 'shopping', mission: 'Buy in bulk with RFQ and supplier evaluation.',
    modules: ['Bulk Ordering', 'RFQ System', 'Supplier Evaluation', 'Active Orders', 'Delivery Tracking', 'Wallet & Refunds', 'AI Assistant'] },
  corporate_buyer: { level: 5, dept: 'shopping', mission: 'Procure with budgets and approval chains.',
    modules: ['Procurement Workflow', 'Department Budgets', 'Approval Chains', 'Active Orders', 'Wallet & Refunds', 'AI Assistant'] },
  government_buyer: { level: 5, dept: 'shopping', mission: 'Manage tenders and approved supplier contracts.',
    modules: ['Tender Management', 'Approved Supplier Lists', 'Contract Tracking', 'Active Orders', 'AI Assistant'] },
};

export const LEVEL_LABELS: Record<number, string> = {
  1: 'L1 · Executive', 2: 'L2 · National', 3: 'L3 · Regional', 4: 'L4 · District', 5: 'L5 · Field / User',
};

export function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Map alternate DB role strings onto a ROLE_TABLE key. */
const ROLE_ALIASES: Record<string, string> = {
  super_admin: 'super_admin',
  superadmin: 'super_admin',
  // If you ever store "admin" vs "super_admin" interchangeably:
  // admin: 'admin',
};

export function resolveRoleKey(role: string): string {
  return ROLE_ALIASES[role] || role;
}

export function personaForRole(role: string): Persona {
  const key = resolveRoleKey(role);
  if (SELLER_ROLES.includes(key)) return 'seller';
  if (PARTNER_ROLES.includes(key)) return 'partner';
  if (BUYER_ROLES.includes(key)) return 'buyer';
  // Any role present in ROLE_TABLE (staff) → officer console
  if (ROLE_TABLE[key]) return 'officer';
  // Unknown staff-ish suffixes still get officer UI rather than buyer
  if (/_officer$|_admin$|_director$|^ceo$|^coo$|^cfo$|^chro$|^cto$|^cio$/.test(key)) {
    return 'officer';
  }
  return 'buyer';
}

export interface OfficerTool { id: string; label: string; desc: string; href: string; glyph: string; }

export function toolsForRole(role: string): OfficerTool[] {
  const ADMIN_TIER = ['admin', 'super_admin', 'district_admin', 'region_admin'];
  const COMMAND_TIER = [...ADMIN_TIER, 'ceo', 'coo', 'cto', 'cio', 'cfo', 'chro'];
  const persona = personaForRole(role);
  const entry = ROLE_TABLE[role];
  const dept = entry?.dept;

  if (persona === 'partner') {
    return [
      { id: 'inbox', label: 'My Tasks', desc: 'Assignments routed to you.', href: '/admin/inbox', glyph: '📥' },
      { id: 'messages', label: 'Messages', desc: 'Chat with dispatch and support.', href: '/messages', glyph: '💬' },
      { id: 'catalog', label: 'Marketplace', desc: 'Browse the marketplace.', href: '/catalog', glyph: '🪵' },
    ];
  }

  const tools: OfficerTool[] = [
    { id: 'inbox', label: 'My Task Inbox', desc: 'Items assigned to your role & jurisdiction.', href: '/admin/inbox', glyph: '📥' },
    { id: 'comms', label: 'Department Channels', desc: 'Internal messaging & emergency broadcasts.', href: '/admin/comms', glyph: '📡' },
    { id: 'messages', label: 'Direct Messages', desc: 'One-to-one conversations.', href: '/messages', glyph: '💬' },
  ];
  if (dept && ['exec', 'operations', 'compliance', 'sme', 'bizdev', 'crm', 'regional', 'district', 'ai', 'commerce', 'procurement'].includes(dept)) {
    tools.push({ id: 'catalog', label: 'Marketplace Catalog', desc: 'Browse live listings as reference.', href: '/catalog', glyph: '🪵' });
    tools.push({ id: 'stores', label: 'Store Directory', desc: 'Search registered storefronts.', href: '/stores', glyph: '🏪' });
  }
  if (ADMIN_TIER.includes(role)) {
    tools.push({ id: 'console', label: 'Admin Console', desc: 'Approve licenses & products, manage users.', href: '/admin', glyph: '🛠️' });
    tools.push({ id: 'review', label: 'Review Queue', desc: 'Flagged accounts awaiting a decision.', href: '/admin/review', glyph: '📋' });
  }
  if (COMMAND_TIER.includes(role)) {
    tools.push({ id: 'command', label: 'Command Center', desc: 'Officer directory, audit trail & oversight.', href: '/admin/command-center', glyph: '🛰️' });
  }
  return tools;
}

export function agentsForRole(role: string): AiAgent[] {
  const entry = ROLE_TABLE[role];
  const ids = entry?.agents || (entry ? DEPT_AGENTS[entry.dept] : undefined) || ['commerce'];
  return ids.map((id) => AI_AGENTS[id]).filter(Boolean);
}

export interface RoleProfile {
  persona: Persona;
  role: string;
  title: string;
  level: 1 | 2 | 3 | 4 | 5;
  levelLabel: string;
  department: DepartmentId | null;
  theme: DepartmentTheme | null;
  mission: string;
  modules: string[];
  can: string[];
  cannot: string[];
  agents: AiAgent[];
  tools: OfficerTool[];
}

export function getRoleProfile(role: string): RoleProfile {
  const key = resolveRoleKey(role);
  const persona = personaForRole(key);
  const entry = ROLE_TABLE[key];
  const dept =
    entry?.dept ??
    (persona === 'seller' ? 'commerce' : persona === 'partner' ? 'fleet' : persona === 'officer' ? 'district' : 'shopping');

  return {
    persona,
    role: key,
    title: formatRole(key),
    level: entry?.level ?? (persona === 'officer' ? 4 : 5),
    levelLabel: LEVEL_LABELS[entry?.level ?? (persona === 'officer' ? 4 : 5)],
    department: dept,
    theme: DEPARTMENTS[dept] || null,
    mission:
      entry?.mission ||
      (persona === 'officer'
        ? 'Operate within your assigned region and district.'
        : persona === 'seller'
          ? 'List products and fulfil orders.'
          : 'Discover products and track deliveries.'),
    modules: entry?.modules || [],
    can: entry?.can || [],
    cannot: entry?.cannot || [],
    agents: agentsForRole(key),
    tools: toolsForRole(key),
  };
}

// ── Staff/officer roles for HR (department-grouped, excludes buyers/sellers/partners) ──
export interface StaffRoleInfo { role: string; label: string; level: number; dept: DepartmentId; }
export function staffRoles(): StaffRoleInfo[] {
  const NON_STAFF = new Set<string>([...SELLER_ROLES, ...BUYER_ROLES, ...PARTNER_ROLES]);
  return Object.entries(ROLE_TABLE)
    .filter(([r]) => !NON_STAFF.has(r))
    .map(([role, m]) => ({ role, label: formatRole(role), level: m.level, dept: m.dept }))
    .sort((a, b) => a.level - b.level || a.label.localeCompare(b.label));
}
