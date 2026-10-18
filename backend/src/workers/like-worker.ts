import { and, eq, sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { likes } from '../lib/schema';
import { EX, QUEUES, mq, type MqEvent } from '../lib/mq';
import { bumpLikesCount } from '../modules/video/video.service';

/**
 * LikeWorker（独立 worker 进程）：
 * 消费 like.events，异步写 likes 表并更新 videos.likes_count。
 * 幂等写法（ON DUPLICATE KEY 自赋值）/DELETE 保证重复事件不重复计数。
 */
export class LikeWorker {
  async start(): Promise<void> {
    await mq.init();
    await mq.consume(
      QUEUES.like,
      [{ exchange: EX.like, pattern: 'like.#' }],
      async (payload: MqEvent, routingKey: string) => {
        const accountId = Number(payload.account_id);
        const videoId = Number(payload.video_id);
        if (!accountId || !videoId) return;

        if (routingKey === 'like.like') {
          const [res] = await db
            .insert(likes)
            .values({ video_id: videoId, account_id: accountId })
            .onDuplicateKeyUpdate({ set: { video_id: sql`${likes.video_id}` } });
          if (res.affectedRows > 0) await bumpLikesCount(videoId, 1);
        } else if (routingKey === 'like.unlike') {
          const [res] = await db
            .delete(likes)
            .where(and(eq(likes.video_id, videoId), eq(likes.account_id, accountId)));
          if (res.affectedRows > 0) await bumpLikesCount(videoId, -1);
        }
      },
    );
    // eslint-disable-next-line no-console
    console.log('[worker] like worker started');
  }
}

/** 供 notification worker 复用的小工具（避免重复查询） */
export async function likeExists(accountId: number, videoId: number): Promise<boolean> {
  const rows = await db
    .select({ id: likes.id })
    .from(likes)
    .where(and(eq(likes.account_id, accountId), eq(likes.video_id, videoId)));
  return rows.length > 0;
}
