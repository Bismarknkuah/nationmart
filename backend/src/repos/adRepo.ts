import { q, money } from '../db/pg';

/**
 * Advertising — sellers pay to promote products/stores; the platform serves and
 * bills against a pre-funded budget.
 *
 * The wallet is debited for the full budget at creation (create_ad_campaign),
 * every impression/click decrements remaining budget atomically, and stopping a
 * campaign refunds the unspent remainder. A seller can never overspend or run an
 * unfunded ad — the database enforces both.
 */

export type AdPlacement = 'search' | 'browse' | 'category' | 'home';
export type AdBillKind = 'per_impression' | 'per_click';
export type AdStatus = 'active' | 'paused' | 'exhausted' | 'cancelled' | 'pending_review';

export class AdError extends Error {
  constructor(message: string, public code: string) { super(message); this.name = 'AdError'; }
}

function reference(): string {
  return `NM-AD-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

export interface CreateAdInput {
  advertiserId: string;
  title: string;
  placement?: AdPlacement;
  billKind?: AdBillKind;
  budget: number;
  unitCost?: number;
  storeId?: string | null;
  productId?: string | null;
  targetRegion?: string | null;
  targetCategory?: string | null;
  keywords?: string | null;
}

// Sensible default unit costs (GHS) if the caller doesn't set one.
const DEFAULT_UNIT: Record<AdBillKind, number> = {
  per_impression: 0.02,   // 2 pesewas per view
  per_click: 0.50,        // 50 pesewas per click
};

export async function createAd(input: CreateAdInput) {
  if (!input.title?.trim()) throw new AdError('An ad needs a title.', 'NO_TITLE');
  if (!input.productId && !input.storeId) {
    throw new AdError('Choose a product or store to promote.', 'NO_SUBJECT');
  }
  const budget = Number(input.budget);
  if (!Number.isFinite(budget) || budget <= 0) throw new AdError('Set a budget above zero.', 'BAD_BUDGET');

  const billKind: AdBillKind = input.billKind || 'per_impression';
  const unitCost = input.unitCost != null ? Number(input.unitCost) : DEFAULT_UNIT[billKind];
  const ref = reference();

  try {
    const rows = await q<{ create_ad_campaign: string }>(
      `SELECT create_ad_campaign(
         $1::uuid, $2, $3, $4::ad_placement, $5::ad_bill_kind, $6::numeric, $7::numeric,
         $8::uuid, $9::uuid, $10, $11, $12)`,
      [
        input.advertiserId, ref, input.title.trim(),
        input.placement || 'search', billKind, money(budget), unitCost,
        input.storeId ?? null, input.productId ?? null,
        input.targetRegion ?? null, input.targetCategory ?? null, input.keywords ?? null,
      ],
    );
    const id = rows[0].create_ad_campaign;
    return findById(id);
  } catch (err: any) {
    if (/AD_INSUFFICIENT_FUNDS|INSUFFICIENT|overdraw|balance/i.test(err.message)) {
      throw new AdError('Your wallet balance is too low to fund this ad. Top up first.', 'INSUFFICIENT_FUNDS');
    }
    throw err;
  }
}

export async function findById(id: string) {
  const [row] = await q<any>(`SELECT * FROM ad_campaigns WHERE id = $1::uuid`, [id]);
  return row ? shape(row) : null;
}

export async function myAds(advertiserId: string) {
  const rows = await q<any>(
    `SELECT * FROM ad_campaigns WHERE advertiser_id = $1::uuid ORDER BY created_at DESC LIMIT 100`,
    [advertiserId],
  );
  return rows.map(shape);
}

/** Serve: pick active, funded ads for a placement, optionally by category/region. */
export async function serveAds(opts: { placement: AdPlacement; category?: string; region?: string; limit?: number }) {
  const rows = await q<any>(
    `SELECT a.*, p.title AS product_title, p.images AS product_images, s.name AS store_name
       FROM ad_campaigns a
       LEFT JOIN products p ON p.id = a.product_id
       LEFT JOIN stores s ON s.id = a.store_id
      WHERE a.status = 'active'
        AND a.placement = $1::ad_placement
        AND a.spent < a.budget
        AND (a.starts_at <= now())
        AND (a.ends_at IS NULL OR a.ends_at > now())
        AND ($2::text IS NULL OR a.target_category IS NULL OR a.target_category = $2)
        AND ($3::text IS NULL OR a.target_region IS NULL OR a.target_region = $3)
      ORDER BY a.unit_cost DESC, random()
      LIMIT $4`,
    [opts.placement, opts.category ?? null, opts.region ?? null, Math.min(opts.limit || 4, 10)],
  );
  return rows.map(shapeServed);
}

/** Bill an impression. Returns false if the ad is no longer active/funded. */
export async function recordImpression(adId: string): Promise<boolean> {
  const [r] = await q<{ record_ad_event: boolean }>(
    `SELECT record_ad_event($1::uuid, 'per_impression'::ad_bill_kind)`, [adId]);
  return r.record_ad_event;
}

export async function recordClick(adId: string): Promise<boolean> {
  const [r] = await q<{ record_ad_event: boolean }>(
    `SELECT record_ad_event($1::uuid, 'per_click'::ad_bill_kind)`, [adId]);
  return r.record_ad_event;
}

/** Pause (no refund — resumable) or cancel (refund the unspent remainder). */
export async function stopAd(id: string, advertiserId: string, status: 'paused' | 'cancelled') {
  const [owns] = await q<any>(`SELECT advertiser_id FROM ad_campaigns WHERE id = $1::uuid`, [id]);
  if (!owns) throw new AdError('Ad not found.', 'NOT_FOUND');
  if (owns.advertiser_id !== advertiserId) throw new AdError('That ad is not yours.', 'NOT_OWNER');

  const [r] = await q<{ stop_ad_campaign: string }>(
    `SELECT stop_ad_campaign($1::uuid, $2::ad_status)`, [id, status]);
  return { refunded: Number(r.stop_ad_campaign) };
}

export async function resumeAd(id: string, advertiserId: string) {
  const rows = await q<any>(
    `UPDATE ad_campaigns SET status = 'active'
      WHERE id = $1::uuid AND advertiser_id = $2::uuid
        AND status = 'paused' AND spent < budget
      RETURNING *`,
    [id, advertiserId],
  );
  if (rows.length === 0) throw new AdError('That ad cannot be resumed.', 'CANNOT_RESUME');
  return shape(rows[0]);
}

/** Admin overview across all campaigns. */
export async function adminOverview() {
  const [row] = await q<any>(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE status = 'active') AS active,
            COALESCE(SUM(budget), 0) AS total_budget,
            COALESCE(SUM(spent), 0)  AS total_spent,
            COALESCE(SUM(impressions), 0) AS impressions,
            COALESCE(SUM(clicks), 0)      AS clicks
       FROM ad_campaigns`,
  );
  const recent = await q<any>(
    `SELECT a.*, u.full_name AS advertiser_name
       FROM ad_campaigns a LEFT JOIN users u ON u.id = a.advertiser_id
      ORDER BY a.created_at DESC LIMIT 50`,
  );
  return {
    summary: {
      total: Number(row.total),
      active: Number(row.active),
      totalBudget: Number(row.total_budget),
      revenue: Number(row.total_spent),   // ad spend = platform ad revenue
      impressions: Number(row.impressions),
      clicks: Number(row.clicks),
    },
    campaigns: recent.map((r) => ({ ...shape(r), advertiserName: r.advertiser_name })),
  };
}

function shape(a: any) {
  return {
    id: a.id,
    reference: a.reference,
    title: a.title,
    placement: a.placement,
    billKind: a.bill_kind,
    budget: Number(a.budget),
    spent: Number(a.spent),
    remaining: Number(a.budget) - Number(a.spent),
    unitCost: Number(a.unit_cost),
    impressions: Number(a.impressions),
    clicks: Number(a.clicks),
    ctr: Number(a.impressions) > 0 ? Number(((Number(a.clicks) / Number(a.impressions)) * 100).toFixed(2)) : 0,
    status: a.status,
    targetRegion: a.target_region,
    targetCategory: a.target_category,
    keywords: a.keywords,
    storeId: a.store_id,
    productId: a.product_id,
    createdAt: a.created_at,
    endsAt: a.ends_at,
  };
}

function shapeServed(a: any) {
  return {
    id: a.id,
    title: a.title,
    productId: a.product_id,
    productTitle: a.product_title,
    image: a.product_images?.[0] ?? null,
    storeId: a.store_id,
    storeName: a.store_name,
    sponsored: true,
  };
}
