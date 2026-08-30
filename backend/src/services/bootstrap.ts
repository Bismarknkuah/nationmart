import { q } from '../db/pg';
import { workflows, officerComms, storeCategories } from '../repos/platformRepo';

/**
 * Install the platform's defaults at boot: workflow templates, officer channels,
 * and store categories. Every step is idempotent (ON CONFLICT DO UPDATE), so a
 * restart never duplicates anything and never wipes anything.
 */
export async function installDefaults(): Promise<void> {
  const templates = [
    { key: 'rider_approval', name: 'Rider approval',
      description: 'Verify a new rider and let them start taking jobs.',
      steps: ['Check Ghana Card', 'Check vehicle licence', 'Approve or decline'] },
    { key: 'seller_onboarding', name: 'Seller onboarding',
      description: 'Get a new seller trading.',
      steps: ['Verify identity', 'Set up store', 'Add first listings', 'Set up payouts'] },
    { key: 'fraud_investigation', name: 'Fraud investigation',
      description: 'Look into a report against a user.',
      steps: ['Review the report', 'Gather evidence', 'Decide', 'Notify the parties'] },
    { key: 'failed_delivery', name: 'Failed delivery follow-up',
      description: 'Put right a delivery that did not arrive.',
      steps: ['Contact the buyer', 'Contact the rider', 'Re-deliver or refund'] },
  ];
  for (const t of templates) await workflows.defineWorkflow(t);

  const channels = [
    { slug: 'executive', name: 'Executive',         level: 1, broadcast: false },
    { slug: 'national',  name: 'National officers', level: 2, broadcast: false },
    { slug: 'regional',  name: 'Regional officers', level: 3, broadcast: false },
    { slug: 'district',  name: 'District officers', level: 4, broadcast: false },
    { slug: 'all-staff', name: 'All staff',         level: 5, broadcast: true },
    { slug: 'logistics', name: 'Logistics desk',    level: 5, broadcast: false },
    { slug: 'security',  name: 'Security & fraud',  level: 3, broadcast: false },
  ];
  for (const c of channels) {
    await officerComms.ensureChannel(c.slug, c.name, c.level, c.broadcast);
  }

  const [count] = await q<any>(`SELECT count(*)::int AS n FROM store_categories`);
  if (count.n === 0) {
    const cats = [
      { key: 'farm_produce',        label: 'Farm produce',        sortOrder: 10 },
      { key: 'building_materials',  label: 'Building materials',  sortOrder: 20 },
      { key: 'timber',              label: 'Timber & wood',       sortOrder: 30 },
      { key: 'food_drink',          label: 'Food & drink',        sortOrder: 40 },
      { key: 'fashion',             label: 'Fashion & textiles',  sortOrder: 50 },
      { key: 'electronics',         label: 'Electronics',         sortOrder: 60 },
      { key: 'household',           label: 'Household goods',     sortOrder: 70 },
      { key: 'services',            label: 'Services',            sortOrder: 80 },
      { key: 'general',             label: 'General',             sortOrder: 90 },
    ];
    for (const c of cats) await storeCategories.upsert(c);
  }

  console.log('[bootstrap] defaults installed');
}

export default installDefaults;
