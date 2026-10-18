import * as amqp from 'amqplib';
import { config } from '../config';

/**
 * RabbitMQ Topic 事件总线（可选依赖）：
 * publish 失败返回 false，调用方降级直写 MySQL/Redis；
 * 所有队列配置 DLX（dlx.events），消费失败进入死信队列留档。
 */

export const EX = {
  like: 'like.events',
  comment: 'comment.events',
  social: 'social.events',
  popularity: 'video.popularity.events',
  timeline: 'video.timeline.events',
  dlx: 'dlx.events',
} as const;

export const QUEUES = {
  like: 'q.like.worker',
  comment: 'q.comment.worker',
  social: 'q.social.worker',
  popularity: 'q.popularity.worker',
  timeline: 'q.timeline.consumer',
  notification: 'q.notification.worker',
  fanout: 'q.fanout.worker',
  dlx: 'q.dlx',
} as const;

/** amqplib 各版本类型名有差异，这里只声明用到的结构 */
interface MqChannel {
  assertExchange(exchange: string, type: string, options?: Record<string, unknown>): unknown;
  assertQueue(queue: string, options?: Record<string, unknown>): unknown;
  bindQueue(queue: string, source: string, pattern: string): unknown;
  publish(exchange: string, routingKey: string, content: Buffer, options?: Record<string, unknown>): boolean;
  consume(
    queue: string,
    onMessage: (msg: MqMessage | null) => void,
    options?: Record<string, unknown>,
  ): unknown;
  ack(msg: MqMessage): void;
  nack(msg: MqMessage, allUpTo?: boolean, requeue?: boolean): void;
  close(): Promise<void>;
}

interface MqMessage {
  content: Buffer;
  fields: Record<string, unknown>;
  properties: Record<string, unknown>;
}

export interface MqEvent {
  [key: string]: unknown;
}

const DLX_ARGS = { 'x-dead-letter-exchange': EX.dlx };

class RabbitMQ {
  private channel: MqChannel | null = null;
  private initPromise: Promise<void> | null = null;

  /** 建立连接与拓扑；RabbitMQ 未就绪时后台重试，不阻塞启动 */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        const conn = await amqp.connect(config.rabbitmq.url);
        const ch = (await conn.createChannel()) as unknown as MqChannel;
        // exchange
        for (const ex of [EX.like, EX.comment, EX.social, EX.popularity, EX.timeline]) {
          await ch.assertExchange(ex, 'topic', { durable: true });
        }
        await ch.assertExchange(EX.dlx, 'topic', { durable: true });
        await ch.assertQueue(QUEUES.dlx, { durable: true });
        await ch.bindQueue(QUEUES.dlx, EX.dlx, '#');
        // 业务队列（DLX + 持久化）
        const declare = (queue: string) =>
          ch.assertQueue(queue, { durable: true, arguments: DLX_ARGS });
        await declare(QUEUES.like);
        await declare(QUEUES.comment);
        await declare(QUEUES.social);
        await declare(QUEUES.popularity);
        await declare(QUEUES.timeline);
        await declare(QUEUES.notification);
        await declare(QUEUES.fanout);
        await ch.bindQueue(QUEUES.like, EX.like, 'like.#');
        await ch.bindQueue(QUEUES.comment, EX.comment, 'comment.#');
        await ch.bindQueue(QUEUES.social, EX.social, 'social.#');
        await ch.bindQueue(QUEUES.popularity, EX.popularity, 'video.popularity.#');
        await ch.bindQueue(QUEUES.timeline, EX.timeline, 'video.timeline.#');
        await ch.bindQueue(QUEUES.fanout, EX.timeline, 'video.timeline.#');
        await ch.bindQueue(QUEUES.notification, EX.like, 'like.#');
        await ch.bindQueue(QUEUES.notification, EX.comment, 'comment.#');
        await ch.bindQueue(QUEUES.notification, EX.social, 'social.#');

        conn.on('close', () => {
          this.channel = null;
          this.initPromise = null;
          // eslint-disable-next-line no-console
          console.warn('[rabbitmq] connection closed, will retry');
          void this.init();
        });
        conn.on('error', () => {
          /* close 回调会处理重连 */
        });

        this.channel = ch;
        // eslint-disable-next-line no-console
        console.log('[rabbitmq] connected');
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.warn(`[rabbitmq] connect failed (attempt ${attempt}): ${msg}, retry in 3s`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  get available(): boolean {
    return this.channel !== null;
  }

  /** 发布事件；未连接/失败返回 false，调用方降级直写 */
  async publish(exchange: string, routingKey: string, payload: MqEvent): Promise<boolean> {
    const ch = this.channel;
    if (!ch) return false;
    try {
      const buf = Buffer.from(JSON.stringify(payload));
      return ch.publish(exchange, routingKey, buf, { persistent: true, contentType: 'application/json' });
    } catch {
      return false;
    }
  }

  /**
   * 消费事件：handler 成功则 ack；
   * handler 抛错时同步重试最多 3 次，仍失败则 nack 进 DLX 留档（对应 x-death 重试上限语义）。
   */
  async consume(
    queue: string,
    bindings: Array<{ exchange: string; pattern: string }>,
    handler: (payload: MqEvent, routingKey: string) => Promise<void>,
  ): Promise<void> {
    await this.init();
    const ch = this.channel;
    if (!ch) throw new Error('rabbitmq channel not ready');
    for (const b of bindings) {
      await ch.bindQueue(queue, b.exchange, b.pattern);
    }
    void ch.consume(queue, (msg) => {
      if (!msg) return;
      void (async () => {
        const routingKey = String((msg.fields as { routingKey?: string }).routingKey ?? '');
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const payload = JSON.parse(msg.content.toString('utf8')) as MqEvent;
            await handler(payload, routingKey);
            ch.ack(msg);
            return;
          } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line no-console
            console.warn(`[rabbitmq] handler error (${queue}, attempt ${attempt}): ${m}`);
            if (attempt === 3) ch.nack(msg, false, false); // 进 DLX
          }
        }
      })();
    });
    // eslint-disable-next-line no-console
    console.log(`[rabbitmq] consuming ${queue}`);
  }
}

export const mq = new RabbitMQ();
