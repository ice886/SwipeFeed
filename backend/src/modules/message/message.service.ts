import { and, asc, desc, eq, or } from 'drizzle-orm';
import { db, type MessageRow } from '../../lib/db';
import { accounts, messages } from '../../lib/schema';
import { badRequest, notFound } from '../../common/errors';

export interface MessageJson {
  id: number;
  from_id: number;
  to_id: number;
  content: string;
  is_read: boolean;
  created_at: string;
}

export class MessageService {
  toJson(row: MessageRow): MessageJson {
    return {
      id: row.id,
      from_id: row.from_id,
      to_id: row.to_id,
      content: row.content,
      is_read: row.is_read === 1,
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  async send(fromId: number, toId: number, content: string): Promise<MessageJson> {
    const text = content.trim();
    if (text === '') throw badRequest('content is required');
    if (toId === fromId) throw badRequest('cannot message yourself');
    const targets = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, toId));
    if (!targets[0]) throw notFound('account not found');

    const [res] = await db
      .insert(messages)
      .values({ from_id: fromId, to_id: toId, content: text });
    const rows = await db.select().from(messages).where(eq(messages.id, Number(res.insertId)));
    return this.toJson(rows[0]);
  }

  /** 与对端的最近 50 条会话（时间正序渲染） */
  async list(accountId: number, peerId: number) {
    const recent = db
      .select()
      .from(messages)
      .where(
        or(
          and(eq(messages.from_id, accountId), eq(messages.to_id, peerId)),
          and(eq(messages.from_id, peerId), eq(messages.to_id, accountId)),
        ),
      )
      .orderBy(desc(messages.created_at), desc(messages.id))
      .limit(50)
      .as('t');
    const rows = await db
      .select()
      .from(recent)
      .orderBy(asc(recent.created_at), asc(recent.id));
    return { messages: rows.map((r) => this.toJson(r)) };
  }
}
