import { ensureSchema } from './lib/db';
import { mq } from './lib/mq';
import { LikeWorker } from './workers/like-worker';
import { CommentWorker } from './workers/comment-worker';
import { SocialWorker } from './workers/social-worker';
import { PopularityWorker } from './workers/popularity-worker';
import { FanoutWorker } from './workers/fanout-worker';

/**
 * Worker 进程入口（与 API 进程分离，可独立伸缩）：
 * LikeWorker / CommentWorker / SocialWorker / PopularityWorker / FanoutWorker
 * 消费 RabbitMQ 异步落库并更新计数、热度、关注流索引与缓存。
 */
async function bootstrap(): Promise<void> {
  await ensureSchema();
  await mq.init();

  await new LikeWorker().start();
  await new CommentWorker().start();
  await new SocialWorker().start();
  await new PopularityWorker().start();
  await new FanoutWorker().start();

  // eslint-disable-next-line no-console
  console.log('[worker] all workers started');

  // 保持进程存活
  setInterval(() => {}, 1 << 30);
}

void bootstrap();
