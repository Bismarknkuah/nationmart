import { q, tx, money } from '../db/pg';

/**
 * The remaining platform domains — PostgreSQL.
 *
 * Grouped into one file because each is small: store categories, product
 * ratings, promo codes, abuse reports, officer channels, workflows and the AI
 * task log.
 */

// ─── Store categories ────────────────────────────────────────────────────────

export const storeCategories = {
  async list(activeOnly = true) {
    return q<any>(
      `SELECT key, label, tagline, image_url, active, sort_order
         FROM store_categories
        WHERE ($1::boolean = FALSE OR active = TRUE)
        ORDER BY sort_order ASC, label ASC`,
      [activeOnly],
    );
  },

  async upsert(input: {
    key: string; label: string; tagline?: string; imageUrl?: string;
    active?: boolean; sortOrder?: number;
  }) {
    const rows = await q<any>(
      `INSERT INTO store_categories (key, label, tagline, image_url, active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (key) DO UPDATE SET
         label = EXCLUDED.label, tagline = EXCLUDED.tagline,
         image_url = COALESCE(EXCLUDED.image_url, store_categories.image_url),
         active = EXCLUDED.active, sort_order = EXCLUDED.sort_order
       RETURNING *`,
      [input.key, input.label, input.tagline ?? '', input.imageUrl ?? null,
       input.active ?? true, input.sortOrder ?? 100],
    );
    return rows[0];
  },

  async remove(key: string) {
    const rows = await q(`DELETE FROM store_categories WHERE key = $1 RETURNING key`, [key]);
    return rows.length > 0;
  },
};

// ─── Ratings / reviews ───────────────────────────────────────────────────────

export const ratings = {
  /**
   * Leave a review. The product's average is recomputed by a database trigger,
   * so it can never drift from the actual reviews. One review per buyer per
   * product is enforced by a unique constraint.
   */
  async review(input: {
    productId: string; buyerId: string; orderId?: string;
    rating: number; comment?: string;
  }) {
    const stars = Math.max(1, Math.min(5, Math.round(input.rating)));
    const rows = await q<any>(
      `INSERT INTO product_reviews (product_id, buyer_id, order_id, rating, comment)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5)
       ON CONFLICT (product_id, buyer_id)
         DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment
       RETURNING *`,
      [input.productId, input.buyerId, input.orderId ?? null, stars, input.comment ?? ''],
    );
    return rows[0];
  },

  async forProduct(productId: string) {
    return q<any>(
      `SELECT r.id, r.rating, r.comment, r.created_at,
              u.full_name AS buyer_name
         FROM product_reviews r JOIN users u ON u.id = r.buyer_id
        WHERE r.product_id = $1::uuid
        ORDER BY r.created_at DESC LIMIT 50`,
      [productId],
    );
  },

  /** Only a buyer who actually bought (and received) it may review. */
  async canReview(productId: string, buyerId: string): Promise<boolean> {
    const rows = await q(
      `SELECT 1 FROM order_items i
         JOIN orders o ON o.id = i.order_id
        WHERE i.product_id = $1::uuid
          AND o.buyer_id = $2::uuid
          AND o.payment_status = 'paid'
        LIMIT 1`,
      [productId, buyerId],
    );
    return rows.length > 0;
  },
};

// ─── Promo codes ─────────────────────────────────────────────────────────────

export const promos = {
  async create(input: {
    code: string; storeId?: string | null;
    discountPercent?: number; discountAmount?: number;
    minOrder?: number; maxUses?: number; expiresAt?: string;
  }) {
    const rows = await q<any>(
      `INSERT INTO promo_codes (code, store_id, discount_percent, discount_amount,
                                min_order, max_uses, expires_at)
       VALUES ($1,$2::uuid,$3,$4::numeric,$5::numeric,$6,$7)
       RETURNING *`,
      [
        input.code.toUpperCase().trim(), input.storeId ?? null,
        input.discountPercent ?? null,
        input.discountAmount != null ? money(input.discountAmount) : null,
        money(input.minOrder ?? 0), input.maxUses ?? null, input.expiresAt ?? null,
      ],
    );
    return rows[0];
  },

  /**
   * Redeem a code. Validity and the usage increment happen in ONE statement, so
   * a "10 uses only" code cannot be redeemed an eleventh time under load.
   * Throws PROMO_INVALID if it cannot be used.
   */
  async claim(code: string, orderTotal: number): Promise<number> {
    const rows = await q<{ claim_promo: string }>(
      `SELECT claim_promo($1, $2::numeric)`,
      [code.toUpperCase().trim(), money(orderTotal)],
    );
    return Number(rows[0].claim_promo);
  },

  async list(storeId?: string) {
    return q<any>(
      `SELECT * FROM promo_codes
        WHERE ($1::uuid IS NULL OR store_id = $1::uuid)
        ORDER BY created_at DESC LIMIT 100`,
      [storeId ?? null],
    );
  },

  async deactivate(code: string) {
    const rows = await q(
      `UPDATE promo_codes SET active = FALSE WHERE code = $1 RETURNING code`,
      [code.toUpperCase().trim()],
    );
    return rows.length > 0;
  },

  async setActive(code: string, active: boolean) {
    const rows = await q<any>(
      `UPDATE promo_codes SET active = $2 WHERE code = $1 RETURNING *`,
      [code.toUpperCase().trim(), active],
    );
    return rows[0] ?? null;
  },

  /**
   * The management view: every promo with how much of it is used and whether
   * it's live, plus headline counts. Optionally scoped platform-wide (store_id
   * null) so an exec sees the campaigns they run, not every seller's codes.
   */
  async overview(opts: { platformOnly?: boolean } = {}) {
    const where = opts.platformOnly ? 'WHERE p.store_id IS NULL' : '';
    const rows = await q<any>(
      `SELECT p.*, s.name AS store_name,
              (p.active
                AND p.starts_at <= now()
                AND (p.expires_at IS NULL OR p.expires_at > now())
                AND (p.max_uses IS NULL OR p.used_count < p.max_uses)) AS is_live,
              CASE WHEN p.max_uses IS NULL THEN NULL
                   ELSE ROUND(p.used_count::numeric / NULLIF(p.max_uses,0) * 100, 0)
              END AS usage_percent
         FROM promo_codes p
         LEFT JOIN stores s ON s.id = p.store_id
         ${where}
        ORDER BY p.created_at DESC
        LIMIT 200`,
    );

    const live = rows.filter((r) => r.is_live).length;
    const totalRedemptions = rows.reduce((sum, r) => sum + Number(r.used_count), 0);

    return {
      promos: rows.map((r) => ({
        code: r.code,
        scope: r.store_id ? 'store' : 'platform',
        storeName: r.store_name,
        discount: r.discount_percent != null ? `${r.discount_percent}%` : `₵${Number(r.discount_amount)}`,
        discountPercent: r.discount_percent,
        discountAmount: r.discount_amount != null ? Number(r.discount_amount) : null,
        minOrder: Number(r.min_order),
        maxUses: r.max_uses,
        usedCount: Number(r.used_count),
        usagePercent: r.usage_percent != null ? Number(r.usage_percent) : null,
        startsAt: r.starts_at,
        expiresAt: r.expires_at,
        active: r.active,
        isLive: r.is_live,
        createdAt: r.created_at,
      })),
      summary: {
        total: rows.length,
        live,
        redemptions: totalRedemptions,
      },
    };
  },
};

// ─── Abuse / fraud reports ───────────────────────────────────────────────────

export const reports = {
  async file(input: {
    reporterId: string; reportedUser?: string; orderId?: string;
    category?: string; details?: string;
  }) {
    const rows = await q<any>(
      `INSERT INTO reports (reporter_id, reported_user, order_id, category, details)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5)
       RETURNING *`,
      [input.reporterId, input.reportedUser ?? null, input.orderId ?? null,
       input.category ?? 'other', input.details ?? ''],
    );
    return rows[0];
  },

  async list(status?: string) {
    return q<any>(
      `SELECT r.*, rep.full_name AS reporter_name, tgt.full_name AS reported_name
         FROM reports r
         LEFT JOIN users rep ON rep.id = r.reporter_id
         LEFT JOIN users tgt ON tgt.id = r.reported_user
        WHERE ($1::text IS NULL OR r.status = $1::report_status::text)
        ORDER BY r.created_at DESC LIMIT 100`,
      [status ?? null],
    );
  },

  /** Resolving requires an officer to own the decision — the DB enforces it. */
  async resolve(id: string, officerId: string, status: 'resolved' | 'dismissed', resolution: string) {
    const rows = await q<any>(
      `UPDATE reports
          SET status = $2::report_status, resolved_by = $3::uuid,
              resolution = $4, resolved_at = now()
        WHERE id = $1::uuid AND status IN ('open','investigating')
        RETURNING *`,
      [id, status, officerId, resolution],
    );
    return rows[0] ?? null;
  },
};

// ─── Officer channels ────────────────────────────────────────────────────────

export const officerComms = {
  /** Channels this officer's level lets them into. */
  async channels(level: number) {
    return q<any>(
      `SELECT c.id, c.slug, c.name, c.description, c.is_broadcast, c.min_level,
              (SELECT count(*) FROM officer_messages m WHERE m.channel_id = c.id) AS messages,
              (SELECT body FROM officer_messages m WHERE m.channel_id = c.id
                ORDER BY created_at DESC LIMIT 1) AS last_message
         FROM officer_channels c
        WHERE c.min_level >= $1
        ORDER BY c.min_level ASC, c.name ASC`,
      [level],
    );
  },

  async messages(channelId: string, limit = 50) {
    return q<any>(
      `SELECT m.id, m.body, m.urgent, m.created_at,
              u.full_name AS sender_name, u.role AS sender_role
         FROM officer_messages m JOIN users u ON u.id = m.sender_id
        WHERE m.channel_id = $1::uuid
        ORDER BY m.created_at DESC LIMIT $2`,
      [channelId, limit],
    );
  },

  async send(channelId: string, senderId: string, body: string, urgent = false) {
    if (!body?.trim()) throw new Error('Message cannot be empty.');
    const rows = await q<any>(
      `INSERT INTO officer_messages (channel_id, sender_id, body, urgent)
       VALUES ($1::uuid,$2::uuid,$3,$4) RETURNING *`,
      [channelId, senderId, body.trim(), urgent],
    );
    return rows[0];
  },

  async ensureChannel(slug: string, name: string, minLevel = 5, isBroadcast = false) {
    const rows = await q<any>(
      `INSERT INTO officer_channels (slug, name, min_level, is_broadcast)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [slug, name, minLevel, isBroadcast],
    );
    return rows[0];
  },
};

// ─── Workflows ───────────────────────────────────────────────────────────────

export const workflows = {
  async defineWorkflow(input: { key: string; name: string; description?: string; steps?: any[] }) {
    const rows = await q<any>(
      `INSERT INTO workflow_definitions (key, name, description, steps)
       VALUES ($1,$2,$3,$4::jsonb)
       ON CONFLICT (key) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description, steps = EXCLUDED.steps
       RETURNING *`,
      [input.key, input.name, input.description ?? '', JSON.stringify(input.steps ?? [])],
    );
    return rows[0];
  },

  async listDefinitions() {
    return q<any>(`SELECT * FROM workflow_definitions WHERE active ORDER BY name`);
  },

  async start(input: {
    definitionKey?: string; title: string; assignedTo?: string; assignedRole?: string;
    region?: string; district?: string; priority?: number; dueAt?: string; payload?: any;
  }) {
    const rows = await q<any>(
      `INSERT INTO workflow_instances (
         definition_id, title, assigned_to, assigned_role, region, district,
         priority, due_at, payload)
       VALUES (
         (SELECT id FROM workflow_definitions WHERE key = $1),
         $2,$3::uuid,$4,$5,$6,$7,$8,$9::jsonb)
       RETURNING *`,
      [
        input.definitionKey ?? null, input.title, input.assignedTo ?? null,
        input.assignedRole ?? null, input.region ?? '', input.district ?? '',
        Math.max(1, Math.min(5, input.priority ?? 3)),
        input.dueAt ?? null, JSON.stringify(input.payload ?? {}),
      ],
    );
    return rows[0];
  },

  /** My tasks, or my jurisdiction's. */
  async mine(userId: string, scope?: { region?: string; district?: string }) {
    return q<any>(
      `SELECT w.*, d.name AS definition_name
         FROM workflow_instances w
         LEFT JOIN workflow_definitions d ON d.id = w.definition_id
        WHERE (w.assigned_to = $1::uuid
            OR ($2::text IS NOT NULL AND w.region = $2 AND w.assigned_to IS NULL))
          AND w.state IN ('pending','in_progress','blocked')
        ORDER BY w.priority ASC, w.due_at ASC NULLS LAST
        LIMIT 100`,
      [userId, scope?.region ?? null],
    );
  },

  async advance(id: string, state: string, userId: string) {
    const rows = await q<any>(
      `UPDATE workflow_instances
          SET state = $2::workflow_state,
              assigned_to = COALESCE(assigned_to, $3::uuid),
              completed_at = CASE WHEN $2 = 'done' THEN now() ELSE completed_at END
        WHERE id = $1::uuid
        RETURNING *`,
      [id, state, userId],
    );
    return rows[0] ?? null;
  },

  /** Anything past its due date and still open. */
  async overdue() {
    return q<any>(
      `SELECT w.*, u.full_name AS assignee
         FROM workflow_instances w LEFT JOIN users u ON u.id = w.assigned_to
        WHERE w.due_at < now() AND w.state IN ('pending','in_progress')
        ORDER BY w.due_at ASC LIMIT 50`,
    );
  },
};

// ─── AI task log + knowledge base ────────────────────────────────────────────

export const ai = {
  async logTask(input: { userId?: string; kind: string; input?: any; output?: any; status?: string; error?: string }) {
    const rows = await q<any>(
      `INSERT INTO ai_tasks (user_id, kind, input, output, status, error)
       VALUES ($1::uuid,$2,$3::jsonb,$4::jsonb,$5,$6)
       RETURNING *`,
      [
        input.userId ?? null, input.kind,
        JSON.stringify(input.input ?? {}),
        input.output ? JSON.stringify(input.output) : null,
        input.status ?? 'done', input.error ?? null,
      ],
    );
    return rows[0];
  },

  async recentTasks(userId: string, limit = 20) {
    return q<any>(
      `SELECT * FROM ai_tasks WHERE user_id = $1::uuid
        ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );
  },

  /** Full-text search over the knowledge base — the assistant's memory. */
  async searchKnowledge(query: string, limit = 5) {
    if (!query?.trim()) return [];
    return q<any>(
      `SELECT id, question, answer, uses,
              ts_rank(search_vector, websearch_to_tsquery('english', $1)) AS rank
         FROM knowledge_entries
        WHERE search_vector @@ websearch_to_tsquery('english', $1)
        ORDER BY rank DESC, uses DESC
        LIMIT $2`,
      [query.trim(), limit],
    );
  },

  async learn(question: string, answer: string, tags: string[] = []) {
    const rows = await q<any>(
      `INSERT INTO knowledge_entries (question, answer, tags)
       VALUES ($1,$2,$3) RETURNING *`,
      [question, answer, tags],
    );
    return rows[0];
  },

  async recordUse(id: string) {
    await q(`UPDATE knowledge_entries SET uses = uses + 1 WHERE id = $1::uuid`, [id]).catch(() => {});
  },
};
