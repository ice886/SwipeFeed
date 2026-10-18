import express from 'express';
import cors from 'cors';
import { config } from './config';
import { ensureSchema } from './lib/db';
import { mq } from './lib/mq';
import { sseHub } from './lib/sse-hub';
import { errorHandler, notFoundHandler } from './common/error-handler';
import { AccountService } from './modules/account/account.service';
import { VideoService } from './modules/video/video.service';
import { ChunkService } from './modules/video/chunk.service';
import { LikeService } from './modules/like/like.service';
import { CommentService } from './modules/comment/comment.service';
import { SocialService } from './modules/social/social.service';
import { FeedService } from './modules/feed/feed.service';
import { MessageService } from './modules/message/message.service';
import { NotificationService } from './modules/notification/notification.service';
import { createAccountRouter } from './modules/account/account.router';
import { createVideoRouter } from './modules/video/video.router';
import { createLikeRouter } from './modules/like/like.router';
import { createCommentRouter } from './modules/comment/comment.router';
import { createSocialRouter } from './modules/social/social.router';
import { createFeedRouter } from './modules/feed/feed.router';
import { createMessageRouter } from './modules/message/message.router';
import { createNotificationRouter } from './modules/notification/notification.router';
import { OutboxPoller } from './workers/outbox-poller';
import { TimelineConsumer } from './workers/timeline-consumer';
import { NotificationWorker } from './workers/notification-worker';

async function bootstrap(): Promise<void> {
  await ensureSchema();
  await mq.init();

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  // 上传文件静态服务：/static/* -> .run/uploads/*
  app.use('/static', express.static(config.uploadDir));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // 依赖装配（手工组合根）
  const notificationService = new NotificationService();
  const videoService = new VideoService();
  const chunkService = new ChunkService();
  const accountService = new AccountService();
  const likeService = new LikeService(videoService, notificationService);
  const commentService = new CommentService(videoService, notificationService);
  const socialService = new SocialService(notificationService);
  const feedService = new FeedService(videoService);
  const messageService = new MessageService();

  app.use('/account', createAccountRouter(accountService));
  app.use('/video', createVideoRouter(videoService, chunkService));
  app.use('/like', createLikeRouter(likeService));
  app.use('/comment', createCommentRouter(commentService));
  app.use('/social', createSocialRouter(socialService));
  app.use('/feed', createFeedRouter(feedService));
  app.use('/message', createMessageRouter(messageService));
  app.use('/notification', createNotificationRouter(notificationService));

  app.use(notFoundHandler);
  app.use(errorHandler);

  await new Promise<void>((resolve) => {
    app.listen(config.server.port, '0.0.0.0', () => resolve());
  });

  // API 进程内异步组件：Outbox 投递、时间线消费、通知落库 + SSE 推送
  new OutboxPoller().start();
  await new TimelineConsumer().start();
  await new NotificationWorker(notificationService).start();

  // SSE 全局 keepalive（每条连接自己也会写，这里兜底清理死连接）
  setInterval(() => sseHub.keepaliveTick(), 60_000);

  // eslint-disable-next-line no-console
  console.log(`[api] listening on :${config.server.port}, uploads at ${config.uploadDir}`);
}

void bootstrap();
