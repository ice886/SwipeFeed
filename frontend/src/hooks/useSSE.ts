import { useEffect, useRef } from 'react';
import { getAccessToken } from '../api/client';
import { API_BASE } from '../api/client';
import type { Notification } from '../types';

const RECONNECT_DELAY = 3000;

/**
 * 连接通知 SSE 流：GET /api/notification/stream?token=<access_token>（走 Vite 代理）。
 * 断线后自动重连（onerror 里 setTimeout 重连）。
 */
export function useSSE(onNotification: (n: Notification) => void, enabled: boolean): void {
  const handlerRef = useRef(onNotification);
  handlerRef.current = onNotification;

  useEffect(() => {
    if (!enabled) return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      const token = getAccessToken();
      if (!token || closed) return;
      const url = `${API_BASE}/notification/stream?token=${encodeURIComponent(token)}`;
      es = new EventSource(url);

      es.onmessage = (e: MessageEvent<string>) => {
        try {
          const data = JSON.parse(e.data) as Notification;
          if (data && typeof data === 'object') handlerRef.current(data);
        } catch {
          // keepalive 注释行/非法数据直接忽略
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          timer = setTimeout(connect, RECONNECT_DELAY);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      es?.close();
      es = null;
    };
  }, [enabled]);
}
