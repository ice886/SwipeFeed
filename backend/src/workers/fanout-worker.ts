import { eq } from 'drizzle-orm';
import { config } from '../config';
import { db } from '../lib/db';
import { videos } from '../lib/schema';
import { EX, QUEUES, mq, type MqEvent } from '../lib/mq';
import {
  addAuthorOutboxItem,
  addInboxItems,
  countFollowers,
  getFollowerThreshold,
  listFollowerIds,
  type FollowingItem,
} from '../lib/fanout';

/**
 * FanoutWorker（独立 worker 进程，对齐 GCFeed 的 video_fanout_worker）：
 * 消费视频发布时间线事件，按粉丝数分流维护关注流索引——
 * 普通作者（粉丝 < 阈值）分批推送到每个粉丝收件箱（写扩散）；
 * 大V（粉丝 ≥ 阈值）只写作者发件箱（读扩散），读取侧拉取归并。
 */
export class FanoutWorker {
  async start(): Promise<void> {
    await mq.init();
    await mq.consume(
      QUEUES.fanout,
      [{ exchange: EX.timeline, pattern: 'video.timeline.#' }],
      async (payload: MqEvent) => {
        const videoId = Number(payload.video_id);
        const publishedAtMs = Number(payload.create_time);
        if (!Number.isFinite(videoId) || videoId <= 0 || !Number.isFinite(publishedAtMs)) return;

        const rows = await db
          .select({ author_id: videos.author_id })
          .from(videos)
          .where(eq(videos.id, videoId));
        const authorId = Number(rows[0]?.author_id ?? 0);
        if (!authorId) return;
        const item: FollowingItem = { videoId, authorId, publishedAtMs };

        const threshold = await getFollowerThreshold();
        const followerCount = await countFollowers(authorId);
        if (followerCount >= threshold) {
          // 大V：只写发件箱，避免百万级扇出
          await addAuthorOutboxItem(authorId, item, config.fanout.outboxMaxLen);
          return;
        }

        // 普通作者：分批扇出到粉丝收件箱
        let cursor = 0;
        for (;;) {
          const ids = await listFollowerIds(authorId, cursor, config.fanout.followerBatchSize);
          if (ids.length === 0) return;
          await addInboxItems(ids, item, config.fanout.inboxMaxLen);
          cursor = ids[ids.length - 1];
          if (ids.length < config.fanout.followerBatchSize) return;
        }
      },
    );
    // eslint-disable-next-line no-console
    console.log('[worker] fanout worker started');
  }
}
