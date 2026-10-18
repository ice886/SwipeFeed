import { KEYS, minuteBucket } from '../lib/cache';
import * as redisLib from '../lib/redis';
import { EX, QUEUES, mq, type MqEvent } from '../lib/mq';
import { bumpPopularity } from '../modules/video/video.service';

/**
 * PopularityWorker（独立 worker 进程）：
 * 消费 video.popularity.events：
 * 1. Redis 分钟窗 ZINCRBY（热榜滚动窗口，降低单 Key 竞争）；
 * 2. MySQL videos.popularity 累计热度（复合游标兜底查询用）。
 */
export class PopularityWorker {
  async start(): Promise<void> {
    await mq.init();
    await mq.consume(
      QUEUES.popularity,
      [{ exchange: EX.popularity, pattern: 'video.popularity.#' }],
      async (payload: MqEvent) => {
        const videoId = Number(payload.video_id);
        const delta = Number(payload.delta ?? 0);
        if (!videoId || !Number.isFinite(delta) || delta === 0) return;

        await redisLib.zIncrBy(KEYS.hotWindow(minuteBucket()), String(videoId), delta);
        await bumpPopularity(videoId, delta);
      },
    );
    // eslint-disable-next-line no-console
    console.log('[worker] popularity worker started');
  }
}
