// ─────────────────────────────────────────────────────────────────────────────
// officeConfig.ts — what each officer/executive can DO in their office.
//
// getRoleProfile() already gives us persona/level/department/tools. This adds the
// *action* layer: the real, executable duties for each office, grouped into
// sections, each pointing at a page or an in-office action. It is deliberately
// data-driven so every role gets a consistent, complete workspace instead of a
// scatter of links — and so a new role inherits a sensible office by department.
// ─────────────────────────────────────────────────────────────────────────────

import type { DepartmentId } from './roleConfig';

export interface OfficeAction {
  id: string;
  label: string;
  desc: string;
  glyph: string;
  href: string;
  /** Roles/levels that gate this action are handled by the page; this is display. */
  minLevel?: number;
}

export interface OfficeSection {
  id: string;
  title: string;
  actions: OfficeAction[];
}

// Common actions every officer/executive gets — the spine of the office.
const CORE: OfficeSection = {
  id: 'core',
  title: 'Your desk',
  actions: [
    { id: 'inbox', label: 'Task Inbox', desc: 'Approvals & decisions routed to you.', glyph: '📥', href: '/admin/inbox' },
    { id: 'comms', label: 'Department Channels', desc: 'Internal messaging & broadcasts.', glyph: '📡', href: '/admin/comms' },
    { id: 'reports', label: 'Reports', desc: 'File and compile official reports.', glyph: '📝', href: '/dashboard' },
    { id: 'messages', label: 'Direct Messages', desc: 'One-to-one conversations.', glyph: '💬', href: '/messages' },
  ],
};

// Department-specific action sets. A role inherits its department's set, so a new
// finance role automatically gets the finance office.
const DEPT_SECTIONS: Partial<Record<DepartmentId, OfficeSection[]>> = {
  exec: [
    {
      id: 'command', title: 'Command & oversight',
      actions: [
        { id: 'command-center', label: 'Command Center', desc: 'Officer directory, audit trail & oversight.', glyph: '🛰️', href: '/admin/command-center' },
        { id: 'operations', label: 'National Operations', desc: 'Cross-department operational view.', glyph: '📊', href: '/admin/operations' },
        { id: 'control', label: 'Control Center', desc: 'Platform-wide controls & approvals.', glyph: '🎛️', href: '/admin/control' },
        { id: 'payments', label: 'Payment Management', desc: 'Revenue, escrow & payouts.', glyph: '💰', href: '/admin/payments' },
        { id: 'security', label: 'Security & Fraud', desc: 'Trust, fraud signals & incidents.', glyph: '🔐', href: '/admin/security' },
      ],
    },
    {
      id: 'people-money', title: 'People & money',
      actions: [
        { id: 'users', label: 'User Management', desc: 'Add, edit, reassign & suspend accounts.', glyph: '👥', href: '/admin/users' },
        { id: 'promotions', label: 'Promotions & Discounts', desc: 'Run platform promo campaigns.', glyph: '🏷️', href: '/admin/promotions' },
        { id: 'ads', label: 'Ad Management', desc: 'All campaigns & ad revenue.', glyph: '📣', href: '/admin/ads' },
        { id: 'hr', label: 'HR Office', desc: 'Staff, recruitment & payroll.', glyph: '🧑‍💼', href: '/hr' },
        { id: 'admin', label: 'Admin Console', desc: 'Users, approvals, licenses.', glyph: '🛠️', href: '/admin' },
      ],
    },
  ],
  finance: [
    {
      id: 'finance', title: 'Finance operations',
      actions: [
        { id: 'payments', label: 'Payment Management', desc: 'Revenue, escrow, payouts & every transaction.', glyph: '💰', href: '/admin/payments' },
        { id: 'operations', label: 'Finance Office', desc: 'Wallets, escrow, settlements & payouts.', glyph: '🏦', href: '/admin/operations' },
        { id: 'disputes', label: 'Refund oversight', desc: 'Disputes affecting settlements.', glyph: '⚖️', href: '/dashboard' },
      ],
    },
  ],
  logistics: [
    {
      id: 'logistics', title: 'Logistics operations',
      actions: [
        { id: 'board', label: 'Delivery Board', desc: 'Live deliveries in your jurisdiction.', glyph: '🚚', href: '/logistics' },
        { id: 'riders', label: 'Riders & Drivers', desc: 'Approve, monitor & assign.', glyph: '🛵', href: '/logistics/riders' },
      ],
    },
  ],
  compliance: [
    {
      id: 'compliance', title: 'Compliance & verification',
      actions: [
        { id: 'review', label: 'Review Queue', desc: 'Businesses & licenses awaiting a decision.', glyph: '📋', href: '/admin/review' },
        { id: 'stores', label: 'Store Directory', desc: 'Verify & inspect storefronts.', glyph: '🏪', href: '/stores' },
      ],
    },
  ],
  district: [
    {
      id: 'district', title: 'District operations',
      actions: [
        { id: 'region', label: 'District Overview', desc: 'Your jurisdiction at a glance.', glyph: '🗺️', href: '/admin/region' },
        { id: 'review', label: 'Store Approvals', desc: 'Approve local stores & sellers.', glyph: '✅', href: '/admin/review' },
        { id: 'create-store', label: 'Create Store', desc: 'Onboard a seller directly.', glyph: '🏪', href: '/admin/create-store' },
        { id: 'riders', label: 'Rider Activity', desc: 'Local deliveries & dispatch.', glyph: '🛵', href: '/logistics/riders' },
      ],
    },
  ],
  regional: [
    {
      id: 'regional', title: 'Regional operations',
      actions: [
        { id: 'region', label: 'Regional Overview', desc: 'Districts in your region.', glyph: '🗺️', href: '/admin/region' },
        { id: 'operations', label: 'Operations', desc: 'Regional performance & escalations.', glyph: '📊', href: '/admin/operations' },
        { id: 'review', label: 'Approvals', desc: 'Businesses awaiting a decision.', glyph: '📋', href: '/admin/review' },
      ],
    },
  ],
  commerce: [
    {
      id: 'commerce', title: 'Commerce oversight',
      actions: [
        { id: 'review', label: 'Store Approvals', desc: 'Verify new stores & sellers.', glyph: '✅', href: '/admin/review' },
        { id: 'stores', label: 'Store Directory', desc: 'Local business activity.', glyph: '🏪', href: '/stores' },
        { id: 'create-store', label: 'Create Store', desc: 'Onboard a seller directly.', glyph: '➕', href: '/admin/create-store' },
      ],
    },
  ],
  hr: [
    {
      id: 'hr', title: 'Human resources',
      actions: [
        { id: 'hr-office', label: 'HR Office', desc: 'Staff directory, onboarding & payroll.', glyph: '👥', href: '/hr' },
        { id: 'workflows', label: 'HR Workflows', desc: 'Recruitment & onboarding flows.', glyph: '🔁', href: '/hr/workflows' },
      ],
    },
  ],
  security: [
    {
      id: 'security', title: 'Security & trust',
      actions: [
        { id: 'security-log', label: 'Security Log', desc: 'Fraud signals & incidents.', glyph: '🔐', href: '/admin/security' },
        { id: 'review', label: 'Flagged Accounts', desc: 'Accounts awaiting a decision.', glyph: '🚩', href: '/admin/review' },
      ],
    },
  ],
  ai: [
    {
      id: 'ai', title: 'Intelligence',
      actions: [
        { id: 'ai-console', label: 'AI Console', desc: 'Models, signals & teaching.', glyph: '🤖', href: '/ai-console' },
        { id: 'operations', label: 'Analytics', desc: 'Commerce intelligence.', glyph: '📊', href: '/admin/operations' },
      ],
    },
  ],
  sme: [
    {
      id: 'sme', title: 'Business support',
      actions: [
        { id: 'stores', label: 'Seller Directory', desc: 'Support & educate sellers.', glyph: '🏪', href: '/stores' },
        { id: 'review', label: 'New Seller Support', desc: 'Onboard & verify sellers.', glyph: '🤝', href: '/admin/review' },
      ],
    },
  ],
  bizdev: [
    {
      id: 'bizdev', title: 'Business development',
      actions: [
        { id: 'promotions', label: 'Promotions & Discounts', desc: 'Run platform promo campaigns.', glyph: '🏷️', href: '/admin/promotions' },
        { id: 'ads', label: 'Ad Management', desc: 'All ad campaigns & ad revenue.', glyph: '📣', href: '/admin/ads' },
        { id: 'stores', label: 'Seller Directory', desc: 'New business pipeline.', glyph: '🏪', href: '/stores' },
      ],
    },
  ],
  crm: [
    {
      id: 'crm', title: 'Customer relations',
      actions: [
        { id: 'disputes', label: 'Disputes & Complaints', desc: 'Resolve customer issues.', glyph: '⚖️', href: '/dashboard' },
        { id: 'messages', label: 'Customer Messages', desc: 'Respond to customers.', glyph: '💬', href: '/messages' },
      ],
    },
  ],
  operations: [
    {
      id: 'operations', title: 'National operations',
      actions: [
        { id: 'operations', label: 'Operations Center', desc: 'Cross-region performance.', glyph: '📊', href: '/admin/operations' },
        { id: 'command', label: 'Command Center', desc: 'Oversight & escalations.', glyph: '🛰️', href: '/admin/command-center' },
      ],
    },
  ],
  field: [
    {
      id: 'field', title: 'Field operations',
      actions: [
        { id: 'inbox', label: 'Assigned Visits', desc: 'Verification tasks routed to you.', glyph: '📍', href: '/admin/inbox' },
        { id: 'review', label: 'Verification Requests', desc: 'Businesses to inspect.', glyph: '📋', href: '/admin/review' },
      ],
    },
  ],
  warehouse: [
    {
      id: 'warehouse', title: 'Warehousing',
      actions: [
        { id: 'operations', label: 'Warehouse Ops', desc: 'Inventory & fulfilment.', glyph: '📦', href: '/admin/operations' },
      ],
    },
  ],
  procurement: [
    {
      id: 'procurement', title: 'Procurement',
      actions: [
        { id: 'stores', label: 'Supplier Directory', desc: 'Supplier networks.', glyph: '🔗', href: '/stores' },
      ],
    },
  ],
  legal: [
    {
      id: 'legal', title: 'Legal & policy',
      actions: [
        { id: 'review', label: 'Policy Cases', desc: 'Disputes & contract review.', glyph: '⚖️', href: '/admin/review' },
        { id: 'security', label: 'Investigations', desc: 'Enforcement & investigations.', glyph: '🔍', href: '/admin/security' },
      ],
    },
  ],
  intl: [
    {
      id: 'intl', title: 'International',
      actions: [
        { id: 'intl', label: 'International Market', desc: 'Cross-border sellers & orders.', glyph: '🌍', href: '/international' },
        { id: 'operations', label: 'Trade Analytics', desc: 'Export performance.', glyph: '📊', href: '/admin/operations' },
      ],
    },
  ],
};

/**
 * Build the office layout for a role. Returns the core desk plus that role's
 * department sections. Admin-tier roles additionally get the admin console.
 */
export function officeForRole(role: string, department: DepartmentId | null, level: number): OfficeSection[] {
  const sections: OfficeSection[] = [CORE];
  const dept = department ? DEPT_SECTIONS[department] : undefined;
  if (dept) sections.push(...dept);

  // Super admin / admin tier: make sure the full console is reachable even if the
  // department didn't include it.
  const isAdminTier = ['super_admin', 'admin', 'region_admin', 'district_admin'].includes(role);
  if (isAdminTier && !sections.some((s) => s.actions.some((a) => a.href === '/admin'))) {
    sections.push({
      id: 'admin', title: 'Administration',
      actions: [
        { id: 'users', label: 'User Management', desc: 'Add, edit, reassign & suspend accounts.', glyph: '👥', href: '/admin/users' },
        { id: 'admin', label: 'Admin Console', desc: 'Users, approvals, licenses.', glyph: '🛠️', href: '/admin' },
        { id: 'command-center', label: 'Command Center', desc: 'Officer directory & audit trail.', glyph: '🛰️', href: '/admin/command-center' },
      ],
    });
  }

  return sections;
}

/** A short, human description of the office for the header. */
export function officeTagline(department: DepartmentId | null): string {
  const map: Partial<Record<DepartmentId, string>> = {
    exec: 'Steer the platform, clear escalations, and oversee every department.',
    finance: 'Govern wallets, escrow, settlements and payouts.',
    logistics: 'Keep deliveries moving and riders supported.',
    compliance: 'Verify businesses and keep the marketplace trustworthy.',
    district: 'Run your district — approvals, dispatch and local governance.',
    regional: 'Oversee your region and the districts within it.',
    commerce: 'Verify and support local stores and sellers.',
    hr: 'Recruit, onboard, and look after staff.',
    security: 'Protect the platform from fraud and abuse.',
    ai: 'Watch the models and turn data into insight.',
    sme: 'Grow and support small businesses.',
    bizdev: 'Bring new businesses onto the platform.',
    crm: 'Keep customers happy and resolve disputes.',
    operations: 'Coordinate national operations across regions.',
    field: 'Verify businesses and deliveries on the ground.',
    legal: 'Enforce policy and handle investigations.',
    intl: 'Open Ghanaian sellers to the world.',
  };
  return (department && map[department]) || 'Execute your duties and keep NationMart running.';
}
