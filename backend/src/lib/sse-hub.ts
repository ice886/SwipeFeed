import type { Response } from 'express';

/**
 * SSE 连接中心（API 进程内）：
 * 每个用户可有多个连接（多端），push 时逐个下发；
 * 慢消费者直接丢弃该条（与 Go 版 channel 满丢弃语义一致）。
 */
export interface SseNotificationPayload {
  id: number;
  recipient_id: number;
  sender_id: number;
  type: string;
  target_id: number;
  content: string;
  is_read: boolean;
  created_at: string;
}

class SseHub {
  private clients = new Map<number, Set<Response>>();
  private seq = 0;

  subscribe(userId: number, res: Response): () => void {
    let set = this.clients.get(userId);
    if (!set) {
      set = new Set();
      this.clients.set(userId, set);
    }
    set.add(res);
    this.seq += 1;

    return () => {
      const s = this.clients.get(userId);
      if (!s) return;
      s.delete(res);
      if (s.size === 0) this.clients.delete(userId);
    };
  }

  push(userId: number, payload: SseNotificationPayload): void {
    const set = this.clients.get(userId);
    if (!set || set.size === 0) return;
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of set) {
      try {
        res.write(data);
      } catch {
        /* 连接异常：由 close 回调清理 */
      }
    }
  }

  onlineUsers(): number {
    return this.clients.size;
  }

  keepaliveTick(): void {
    for (const set of this.clients.values()) {
      for (const res of set) {
        try {
          res.write(': keepalive\n\n');
        } catch {
          /* ignore */
        }
      }
    }
  }
}

export const sseHub = new SseHub();
