import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { videos } from '../lib/schema';
import { EX, QUEUES, mq, type MqEvent } from '../lib/mq';
import { NotificationService } from '../modules/notification/notification.service';

/**
 * NotificationWorker（API 进程内）：
 * 消费点赞/评论/关注事件，生成通知并经 SSEHub 推送给在线用户。
 */
export class NotificationWorker {
  constructor(private readonly notificationService: NotificationService) {}

  async start(): Promise<void> {
    await mq.init();
    await mq.consume(
      QUEUES.notification,
      [
        { exchange: EX.like, pattern: 'like.#' },
        { exchange: EX.comment, pattern: 'comment.#' },
        { exchange: EX.social, pattern: 'social.#' },
      ],
      async (payload: MqEvent, routingKey: string) => {
        switch (routingKey) {
          case 'like.like':
            await this.onLike(payload);
            break;
          case 'comment.publish':
            await this.onComment(payload);
            break;
          case 'social.follow':
            await this.onFollow(payload);
            break;
          default:
            break; // unlike / delete / unfollow 不产生通知
        }
      },
    );
    // eslint-disable-next-line no-console
    console.log('[worker] notification worker started');
  }

  private async onLike(payload: MqEvent): Promise<void> {
    const accountId = Number(payload.account_id);
    const username = String(payload.username ?? 'someone');
    const videoId = Number(payload.video_id);
    const author = await this.videoAuthor(videoId);
    if (author && author.id !== accountId) {
      await this.notificationService.notify(
        author.id,
        accountId,
        'like',
        videoId,
        `${username} liked your video`,
      );
    }
  }

  private async onComment(payload: MqEvent): Promise<void> {
    const accountId = Number(payload.author_id);
    const username = String(payload.username ?? 'someone');
    const videoId = Number(payload.video_id);
    const author = await this.videoAuthor(videoId);
    if (author && author.id !== accountId) {
      await this.notificationService.notify(
        author.id,
        accountId,
        'comment',
        videoId,
        `${username} commented on your video`,
      );
    }
  }

  private async onFollow(payload: MqEvent): Promise<void> {
    const followerId = Number(payload.follower_id);
    const followerName = String(payload.follower_name ?? 'someone');
    const vloggerId = Number(payload.vlogger_id);
    if (vloggerId > 0 && vloggerId !== followerId) {
      await this.notificationService.notify(
        vloggerId,
        followerId,
        'follow',
        followerId,
        `${followerName} followed you`,
      );
    }
  }

  private async videoAuthor(videoId: number): Promise<{ id: number } | null> {
    const rows = await db
      .select({ author_id: videos.author_id })
      .from(videos)
      .where(eq(videos.id, videoId));
    return rows[0] ? { id: Number(rows[0].author_id) } : null;
  }
}
