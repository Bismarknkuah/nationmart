import { q } from '../db/pg';

/**
 * Audit trail — PostgreSQL.
 * Never throws: auditing must not be able to break the action it is recording.
 */
export async function audit(entry: {
  actorId?: string | null;
  actorRole?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
  metadata?: any;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await q(
      `INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id,
                               summary, metadata, ip_address, user_agent)
       VALUES ($1::uuid,$2,$3,$4,$5,$6,$7::jsonb,$8::inet,$9)`,
      [
        entry.actorId ?? null, entry.actorRole ?? 'system', entry.action,
        entry.entityType ?? null, entry.entityId ?? null, entry.summary ?? '',
        JSON.stringify(entry.metadata ?? {}), entry.ip ?? null, entry.userAgent ?? null,
      ],
    );
  } catch (err: any) {
    console.error('[audit] could not record:', err?.message);
  }
}

export async function recentAudit(limit = 100) {
  return q<any>(
    `SELECT a.action, a.summary, a.actor_role, a.entity_type, a.ip_address, a.created_at,
            u.full_name AS actor
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
      ORDER BY a.created_at DESC LIMIT $1`,
    [limit],
  );
}

export default audit;
