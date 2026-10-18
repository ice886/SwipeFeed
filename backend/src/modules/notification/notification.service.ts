import { and, desc, eq, sql } from 'drizzle-orm';
import { db, type NotificationRow } from '../../lib/db';
import { notifications } from '../../lib/schema';
import { sseHub, type SseNotificationPayload } from '../../lib/sse-hub';

export class NotificationService {
  toJson(row: NotificationRow): SseNotificationPayload {
    return {
      id: row.id,
      recipient_id: row.recipient_id,
      sender_id: row.sender_id,
      type: row.type,
      target_id: row.target_id,
      content: row.content ?? '',
      is_read: row.is_read === 1,
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  /** 写通知并实时推送给在线用户（MQ 降级路径与提及通知复用） */
  async notify(
    recipientId: number,
    senderId: number,
    type: string,
    targetId: number,
    content: string,
  ): Promise<void> {
    if (recipientId === senderId) return;
    const [res] = await db.insert(notifications).values({
      recipient_id: recipientId,
      sender_id: senderId,
      type,
      target_id: targetId,
      content: content.slice(0, 255),
    });
    const payload: SseNotificationPayload = {
      id: Number(res.insertId),
      recipient_id: recipientId,
      sender_id: senderId,
      type,
      target_id: targetId,
      content: content.slice(0, 255),
      is_read: false,
      created_at: new Date().toISOString(),
    };
    sseHub.push(recipientId, payload);
  }

  async list(accountId: number): Promise<SseNotificationPayload[]> {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.recipient_id, accountId))
      .orderBy(desc(notifications.created_at), desc(notifications.id))
      .limit(50);
    return rows.map((r) => this.toJson(r));
  }

  async markRead(accountId: number, id: number | null): Promise<void> {
    if (id !== null) {
      await db
        .update(notifications)
        .set({ is_read: 1 })
        .where(and(eq(notifications.id, id), eq(notifications.recipient_id, accountId)));
    } else {
      await db
        .update(notifications)
        .set({ is_read: 1 })
        .where(eq(notifications.recipient_id, accountId));
    }
  }

  async unreadCount(accountId: number): Promise<number> {
    const rows = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(notifications)
      .where(and(eq(notifications.recipient_id, accountId), eq(notifications.is_read, 0)));
    return Number(rows[0]?.c ?? 0);
  }
}
