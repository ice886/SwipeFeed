import { and, desc, eq, sql } from 'drizzle-orm';
import { db, type VideoRow } from '../../lib/db';
import { likes, videos } from '../../lib/schema';
import { EX, mq } from '../../lib/mq';
import { KEYS, minuteBucket } from '../../lib/cache';
import * as redisLib from '../../lib/redis';
import { badRequest, notFound } from '../../common/errors';
import { bumpLikesCount, bumpPopularity, VideoService } from '../video/video.service';
import { NotificationService } from '../notification/notification.service';

/**
 * 点赞/取消点赞：优先发 MQ（like.events + video.popularity.events）异步落库，
 * 任一发布失败对该目标降级直写；新点赞同步触发作者通知。
 */
export class LikeService {
  constructor(
    private readonly videoService: VideoService,
    private readonly notificationService: NotificationService,
  ) {}

  private async getVideoOrThrow(videoId: number): Promise<VideoRow> {
    const row = await this.videoService.getByID(videoId);
    if (!row) throw notFound('video not found');
    return row;
  }

  async isLiked(accountId: number, videoId: number): Promise<boolean> {
    const rows = await db
      .select()
      .from(likes)
      .where(and(eq(likes.account_id, accountId), eq(likes.video_id, videoId)));
    return rows.length > 0;
  }

  async like(accountId: number, username: string, videoId: number): Promise<void> {
    const video = await this.getVideoOrThrow(videoId);
    if (await this.isLiked(accountId, videoId)) return; // 幂等：已赞直接返回

    const eventOk = await mq.publish(EX.like, 'like.like', {
      account_id: accountId,
      username,
      video_id: videoId,
      ts: Date.now(),
    });
    const popOk = await mq.publish(EX.popularity, 'video.popularity.update', {
      video_id: videoId,
      delta: 1,
      reason: 'like',
      ts: Date.now(),
    });

    if (!eventOk) {
      // 降级直写 MySQL（ON DUPLICATE 自赋值 = INSERT IGNORE 语义）
      const [res] = await db
        .insert(likes)
        .values({ video_id: videoId, account_id: accountId })
        .onDuplicateKeyUpdate({ set: { video_id: sql`${likes.video_id}` } });
      if (res.affectedRows > 0) await bumpLikesCount(videoId, 1);
    }
    if (!popOk) {
      // 降级直写 Redis 热榜 + MySQL popularity
      await redisLib.zIncrBy(KEYS.hotWindow(minuteBucket()), String(videoId), 1);
      await bumpPopularity(videoId, 1);
    }
    if (!eventOk || !popOk) {
      await this.notificationService.notify(
        video.author_id,
        accountId,
        'like',
        videoId,
        `${username} liked your video`,
      );
    }
  }

  async unlike(accountId: number, username: string, videoId: number): Promise<void> {
    await this.getVideoOrThrow(videoId);
    if (!(await this.isLiked(accountId, videoId))) return;

    const eventOk = await mq.publish(EX.like, 'like.unlike', {
      account_id: accountId,
      username,
      video_id: videoId,
      ts: Date.now(),
    });
    const popOk = await mq.publish(EX.popularity, 'video.popularity.update', {
      video_id: videoId,
      delta: -1,
      reason: 'unlike',
      ts: Date.now(),
    });

    if (!eventOk) {
      const [res] = await db
        .delete(likes)
        .where(and(eq(likes.video_id, videoId), eq(likes.account_id, accountId)));
      if (res.affectedRows > 0) await bumpLikesCount(videoId, -1);
    }
    if (!popOk) {
      await redisLib.zIncrBy(KEYS.hotWindow(minuteBucket()), String(videoId), -1);
      await bumpPopularity(videoId, -1);
    }
  }

  /** 我赞过的视频列表 */
  async listMyLikedVideos(accountId: number) {
    const rows = await db
      .select()
      .from(likes)
      .innerJoin(videos, eq(videos.id, likes.video_id))
      .where(eq(likes.account_id, accountId))
      .orderBy(desc(likes.created_at), desc(likes.id))
      .limit(100);
    return { videos: rows.map((r) => this.videoService.toVideoJson(r.videos)) };
  }

  async requireVideoId(body: Record<string, unknown>): Promise<number> {
    const raw = body?.video_id;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) throw badRequest('video_id is required');
    return Math.floor(n);
  }
}
