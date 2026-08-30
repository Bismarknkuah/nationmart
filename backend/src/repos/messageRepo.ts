import { q, tx } from '../db/pg';

/**
 * Messaging — PostgreSQL.
 *
 * The order thread is the 3-way chat between buyer, seller and rider. Two rules
 * are enforced by the database rather than by hope:
 *   • one thread per order (unique constraint) — no duplicate chats
 *   • no empty messages (check constraint)
 * The thread's "last activity" timestamp is maintained by a trigger, so the
 * inbox ordering can never go stale.
 */

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachment_url: string | null;
  read: boolean;
  created_at: Date;
};

/**
 * The chat for an order, created on first use.
 *
 * Participants are the buyer, the seller, and the rider once one is assigned —
 * so a rider joining an existing delivery is added to the conversation they need.
 */
export async function getOrCreateOrderThread(orderId: string): Promise<string> {
  return tx(async (c) => {
    const { rows: existing } = await c.query(
      `SELECT id FROM conversations WHERE order_id = $1::uuid`, [orderId]);

    let conversationId: string;
    if (existing.length) {
      conversationId = existing[0].id;
    } else {
      const { rows } = await c.query(
        `INSERT INTO conversations (order_id, subject)
         VALUES ($1::uuid, (SELECT 'Order ' || order_number FROM orders WHERE id = $1::uuid))
         RETURNING id`,
        [orderId],
      );
      conversationId = rows[0].id;
    }

    // Buyer + seller, and the rider if one is on the job. Re-running is harmless.
    await c.query(
      `INSERT INTO conversation_participants (conversation_id, user_id)
       SELECT $1::uuid, u FROM (
         SELECT buyer_id AS u FROM orders WHERE id = $2::uuid
         UNION
         SELECT seller_id FROM orders WHERE id = $2::uuid
         UNION
         SELECT rider_id FROM deliveries WHERE order_id = $2::uuid AND rider_id IS NOT NULL
       ) t
       ON CONFLICT DO NOTHING`,
      [conversationId, orderId],
    );

    return conversationId;
  });
}

/** Is this person allowed to read/post in this thread? */
export async function isParticipant(conversationId: string, userId: string): Promise<boolean> {
  const rows = await q(
    `SELECT 1 FROM conversation_participants
      WHERE conversation_id = $1::uuid AND user_id = $2::uuid`,
    [conversationId, userId],
  );
  return rows.length > 0;
}

export async function sendMessage(
  conversationId: string, senderId: string, body: string, attachmentUrl?: string,
): Promise<MessageRow> {
  if (!body?.trim()) throw new Error('Message cannot be empty.');
  if (!(await isParticipant(conversationId, senderId))) {
    throw new Error('You are not part of this conversation.');
  }

  const rows = await q<MessageRow>(
    `INSERT INTO messages (conversation_id, sender_id, body, attachment_url)
     VALUES ($1::uuid, $2::uuid, $3, $4)
     RETURNING *`,
    [conversationId, senderId, body.trim(), attachmentUrl ?? null],
  );

  // Everyone else in the thread gets a nudge.
  q(
    `INSERT INTO notifications (user_id, type, title, message, link)
     SELECT p.user_id, 'message',
            'New message from ' || (SELECT full_name FROM users WHERE id = $2::uuid),
            LEFT($3, 120), '/messages'
       FROM conversation_participants p
      WHERE p.conversation_id = $1::uuid AND p.user_id <> $2::uuid`,
    [conversationId, senderId, body.trim()],
  ).catch(() => {});

  return rows[0];
}

/** Messages in a thread, oldest first, with sender identity for the UI. */
export async function getMessages(conversationId: string, limit = 100) {
  return q<any>(
    `SELECT m.id, m.body, m.attachment_url, m.read, m.created_at,
            m.sender_id, u.full_name AS sender_name, u.role AS sender_role
       FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $1::uuid
      ORDER BY m.created_at ASC
      LIMIT $2`,
    [conversationId, limit],
  );
}

/** My inbox: every thread I'm in, most recent first. */
export async function listConversations(userId: string) {
  return q<any>(
    `SELECT c.id, c.subject, c.order_id, c.last_message_at,
            o.order_number,
            (SELECT body FROM messages m WHERE m.conversation_id = c.id
              ORDER BY m.created_at DESC LIMIT 1) AS last_message,
            (SELECT count(*) FROM messages m
              WHERE m.conversation_id = c.id AND m.read = FALSE
                AND m.sender_id <> $1::uuid) AS unread
       FROM conversations c
       JOIN conversation_participants p ON p.conversation_id = c.id
       LEFT JOIN orders o ON o.id = c.order_id
      WHERE p.user_id = $1::uuid
      ORDER BY c.last_message_at DESC
      LIMIT 50`,
    [userId],
  );
}

export async function markThreadRead(conversationId: string, userId: string): Promise<void> {
  await q(
    `UPDATE messages SET read = TRUE
      WHERE conversation_id = $1::uuid AND sender_id <> $2::uuid AND read = FALSE`,
    [conversationId, userId],
  );
}

export function publicMessage(m: any) {
  return {
    _id: m.id,
    body: m.body,
    attachmentUrl: m.attachment_url,
    read: m.read,
    sender: m.sender_id,
    senderName: m.sender_name,
    senderRole: m.sender_role,
    createdAt: m.created_at,
  };
}
