import { and, eq, sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { socials } from '../lib/schema';
import { EX, QUEUES, mq, type MqEvent } from '../lib/mq';

/**
 * SocialWorker（独立 worker 进程）：
 * 消费 social.events，异步维护 socials 关注关系表。
 */
export class SocialWorker {
  async start(): Promise<void> {
    await mq.init();
    await mq.consume(
      QUEUES.social,
      [{ exchange: EX.social, pattern: 'social.#' }],
      async (payload: MqEvent, routingKey: string) => {
        const followerId = Number(payload.follower_id);
        const vloggerId = Number(payload.vlogger_id);
        if (!followerId || !vloggerId) return;

        if (routingKey === 'social.follow') {
          await db
            .insert(socials)
            .values({ follower_id: followerId, vlogger_id: vloggerId })
            .onDuplicateKeyUpdate({ set: { follower_id: sql`${socials.follower_id}` } });
        } else if (routingKey === 'social.unfollow') {
          await db
            .delete(socials)
            .where(and(eq(socials.follower_id, followerId), eq(socials.vlogger_id, vloggerId)));
        }
      },
    );
    // eslint-disable-next-line no-console
    console.log('[worker] social worker started');
  }
}
