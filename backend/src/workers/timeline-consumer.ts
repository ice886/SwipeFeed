import { KEYS } from '../lib/cache';
import * as redisLib from '../lib/redis';
import { EX, QUEUES, mq, type MqEvent } from '../lib/mq';

const TIMELINE_KEEP = 1000;

/**
 * TimelineConsumer（API 进程内）：
 * 消费 video.timeline.publish，写 Redis ZSET feed:global_timeline（热时间线），
 * 并修剪到最近约 1000 条热数据（冷数据回源 MySQL）。
 */
export class TimelineConsumer {
  async start(): Promise<void> {
    await mq.init();
    await mq.consume(
      QUEUES.timeline,
      [{ exchange: EX.timeline, pattern: 'video.timeline.#' }],
      async (payload: MqEvent) => {
        const videoId = Number(payload.video_id);
        const createTime = Number(payload.create_time ?? payload.ts ?? Date.now());
        if (!Number.isFinite(videoId) || videoId <= 0) return;
        const key = KEYS.feedGlobalTimeline();
        await redisLib.zAdd(key, [{ score: createTime, member: String(videoId) }]);
        await redisLib.zRemRangeByRank(key, 0, -TIMELINE_KEEP - 1);
      },
    );
    // eslint-disable-next-line no-console
    console.log('[worker] timeline consumer started');
  }
}
