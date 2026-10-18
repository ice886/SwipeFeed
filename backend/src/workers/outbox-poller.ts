import { asc, eq } from 'drizzle-orm';
import { db, type OutboxRow } from '../lib/db';
import { outboxMsgs } from '../lib/schema';
import { EX, mq } from '../lib/mq';

/**
 * OutboxPoller（API 进程内）：
 * 持续把 outbox_msgs 中 pending 的发布时间线事件投递到 MQ，
 * 成功后删除，保证"视频记录已写但时间线事件丢失"不会发生（最终一致）。
 */
export class OutboxPoller {
  private running = false;

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
    // eslint-disable-next-line no-console
    console.log('[worker] outbox poller started');
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const messages = await db
          .select()
          .from(outboxMsgs)
          .where(eq(outboxMsgs.status, 'pending'))
          .orderBy(asc(outboxMsgs.create_time), asc(outboxMsgs.id))
          .limit(100);
        if (messages.length === 0) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        for (const msg of messages) {
          const ok = await mq.publish(EX.timeline, 'video.timeline.publish', {
            video_id: msg.video_id,
            create_time: new Date(msg.create_time).getTime(),
            occurred_at: Date.now(),
          });
          if (ok) {
            await db.delete(outboxMsgs).where(eq(outboxMsgs.id, msg.id));
          } else {
            // MQ 不可用：保留 pending，下轮重投
            // eslint-disable-next-line no-console
            console.warn(`[worker] outbox deliver failed, retry later: video=${msg.video_id}`);
            break;
          }
        }
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.warn(`[worker] outbox poller error: ${m}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  stop(): void {
    this.running = false;
  }
}
