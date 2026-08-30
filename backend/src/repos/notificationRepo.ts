import { q } from '../db/pg';

/** Notifications — PostgreSQL. */

export type NotificationType =
  | 'order_placed' | 'payment_received' | 'payment_failed' | 'delivery_update'
  | 'subscription_due' | 'subscription_paid' | 'message' | 'system' | 'promo'
  | 'leave_decision' | 'rider_assigned' | 'review';

export interface NotifyInput {
  userId: string;
  type?: NotificationType;
  title: string;
  message?: string;
  link?: string;
}

/**
 * Send a notification.
 *
 * Deliberately never throws: a failed notification must not break the payment or
 * delivery that triggered it. Callers can `await` it or not, as they prefer.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await q(
      `INSERT INTO notifications (user_id, type, title, message, link)
       VALUES ($1::uuid, $2::notification_type, $3, $4, $5)`,
      [input.userId, input.type ?? 'system', input.title, input.message ?? '', input.link ?? null],
    );
  } catch (err: any) {
    console.error('[notify] failed:', err?.message);
  }
}

/** Notify several people at once (e.g. buyer AND seller on a delivery update). */
export async function notifyMany(userIds: string[], input: Omit<NotifyInput, 'userId'>): Promise<void> {
  await Promise.all(userIds.filter(Boolean).map((userId) => notify({ ...input, userId })));
}

export async function list(userId: string, limit = 30) {
  return q<any>(
    `SELECT id, type, title, message, link, read, created_at
       FROM notifications WHERE user_id = $1::uuid
      ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
}

export async function unreadCount(userId: string): Promise<number> {
  const rows = await q<{ n: string }>(
    `SELECT count(*) AS n FROM notifications WHERE user_id = $1::uuid AND read = FALSE`,
    [userId],
  );
  return Number(rows[0].n);
}

export async function markRead(id: string, userId: string): Promise<boolean> {
  const rows = await q(
    `UPDATE notifications SET read = TRUE
      WHERE id = $1 AND user_id = $2::uuid RETURNING id`,
    [id, userId],
  );
  return rows.length > 0;
}

export async function markAllRead(userId: string): Promise<number> {
  const rows = await q(
    `UPDATE notifications SET read = TRUE
      WHERE user_id = $1::uuid AND read = FALSE RETURNING id`,
    [userId],
  );
  return rows.length;
}

export function publicNotification(n: any) {
  return {
    _id: String(n.id),
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    read: n.read,
    createdAt: n.created_at,
  };
}
