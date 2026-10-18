import { asc, eq } from 'drizzle-orm';
import { db, type CommentRow } from '../../lib/db';
import { accounts, comments, videos } from '../../lib/schema';
import { EX, mq } from '../../lib/mq';
import { KEYS, minuteBucket } from '../../lib/cache';
import * as redisLib from '../../lib/redis';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { bumpPopularity, VideoService } from '../video/video.service';
import { NotificationService } from '../notification/notification.service';

export interface CommentJson {
  id: number;
  username: string;
  video_id: number;
  author_id: number;
  content: string;
  created_at: string;
}

export class CommentService {
  constructor(
    private readonly videoService: VideoService,
    private readonly notificationService: NotificationService,
  ) {}

  toJson(row: CommentRow): CommentJson {
    return {
      id: row.id,
      username: row.username,
      video_id: row.video_id,
      author_id: row.author_id,
      content: row.content,
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  async listAll(videoId: number): Promise<CommentJson[]> {
    const rows = await db
      .select()
      .from(comments)
      .where(eq(comments.video_id, videoId))
      .orderBy(asc(comments.created_at), asc(comments.id))
      .limit(200);
    return rows.map((r) => this.toJson(r));
  }

  /** 发布评论：MQ 异步落库 + 热度 +1，@username 提及通知同步写入 */
  async publish(accountId: number, username: string, videoId: number, content: string) {
    const videoRows = await db.select().from(videos).where(eq(videos.id, videoId));
    const video = videoRows[0];
    if (!video) throw notFound('video not found');
    const text = content.trim();
    if (text === '') throw badRequest('content is required');

    const eventOk = await mq.publish(EX.comment, 'comment.publish', {
      author_id: accountId,
      username,
      video_id: videoId,
      content: text,
      ts: Date.now(),
    });
    const popOk = await mq.publish(EX.popularity, 'video.popularity.update', {
      video_id: videoId,
      delta: 1,
      reason: 'comment',
      ts: Date.now(),
    });

    if (!eventOk) {
      await db
        .insert(comments)
        .values({ username, video_id: videoId, author_id: accountId, content: text });
    }
    if (!popOk) {
      await redisLib.zIncrBy(KEYS.hotWindow(minuteBucket()), String(videoId), 1);
      await bumpPopularity(videoId, 1);
    }
    if (!eventOk || !popOk) {
      await this.notificationService.notify(
        video.author_id,
        accountId,
        'comment',
        videoId,
        `${username} commented on your video`,
      );
    }

    // @提及通知：直接写 notifications（不走 MQ），被提及者实时收到
    await this.notifyMentions(accountId, username, videoId, text);
    return { message: 'comment published' };
  }

  private async notifyMentions(
    accountId: number,
    username: string,
    videoId: number,
    text: string,
  ): Promise<void> {
    const re = /@([A-Za-z0-9_]{1,50})/g;
    const names = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) names.add(m[1]);
    for (const name of names) {
      const targetRows = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.username, name));
      const targetId = targetRows[0]?.id;
      if (targetId && targetId !== accountId) {
        await this.notificationService.notify(
          targetId,
          accountId,
          'mention',
          videoId,
          `${username} mentioned you in a comment`,
        );
      }
    }
  }

  /** 删除评论：仅作者可删，事件异步落库 + 热度 -1 */
  async delete(accountId: number, commentId: number): Promise<void> {
    const rows = await db.select().from(comments).where(eq(comments.id, commentId));
    const comment = rows[0];
    if (!comment) throw notFound('comment not found');
    if (comment.author_id !== accountId) throw forbidden('only the comment author can delete');

    const eventOk = await mq.publish(EX.comment, 'comment.delete', {
      author_id: comment.author_id,
      username: comment.username,
      video_id: comment.video_id,
      comment_id: commentId,
      ts: Date.now(),
    });
    const popOk = await mq.publish(EX.popularity, 'video.popularity.update', {
      video_id: comment.video_id,
      delta: -1,
      reason: 'comment_delete',
      ts: Date.now(),
    });

    if (!eventOk) {
      await db.delete(comments).where(eq(comments.id, commentId));
    }
    if (!popOk) {
      await redisLib.zIncrBy(KEYS.hotWindow(minuteBucket()), String(comment.video_id), -1);
      await bumpPopularity(comment.video_id, -1);
    }
  }
}
