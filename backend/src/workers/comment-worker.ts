import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { comments } from '../lib/schema';
import { EX, QUEUES, mq, type MqEvent } from '../lib/mq';

/**
 * CommentWorker（独立 worker 进程）：
 * 消费 comment.events，异步写/删 comments 表。
 */
export class CommentWorker {
  async start(): Promise<void> {
    await mq.init();
    await mq.consume(
      QUEUES.comment,
      [{ exchange: EX.comment, pattern: 'comment.#' }],
      async (payload: MqEvent, routingKey: string) => {
        if (routingKey === 'comment.publish') {
          const authorId = Number(payload.author_id);
          const videoId = Number(payload.video_id);
          const username = String(payload.username ?? '');
          const content = String(payload.content ?? '');
          if (!authorId || !videoId || !content) return;
          await db
            .insert(comments)
            .values({ username, video_id: videoId, author_id: authorId, content });
        } else if (routingKey === 'comment.delete') {
          const commentId = Number(payload.comment_id);
          if (!commentId) return;
          await db.delete(comments).where(eq(comments.id, commentId));
        }
      },
    );
    // eslint-disable-next-line no-console
    console.log('[worker] comment worker started');
  }
}
