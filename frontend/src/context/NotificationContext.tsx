import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import * as notificationApi from '../api/notification';
import { useSSE } from '../hooks/useSSE';
import { useAuth } from './AuthContext';
import type { Notification } from '../types';

export interface NotificationContextValue {
  unreadCount: number;
  /** 最近一条 SSE 推送（用于页面实时插入列表） */
  lastEvent: Notification | null;
  /** 每次 SSE 推送自增，页面可监听变化 */
  eventSeq: number;
  refreshUnread: () => Promise<void>;
  setUnreadCount: Dispatch<SetStateAction<number>>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastEvent, setLastEvent] = useState<Notification | null>(null);
  const [eventSeq, setEventSeq] = useState(0);
  const loggedInRef = useRef(isLoggedIn);
  loggedInRef.current = isLoggedIn;

  const refreshUnread = useCallback(async () => {
    if (!loggedInRef.current) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await notificationApi.unreadCount();
      setUnreadCount(res.count ?? 0);
    } catch {
      // 静默失败
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) void refreshUnread();
    else setUnreadCount(0);
  }, [isLoggedIn, refreshUnread]);

  const handleSSE = useCallback(
    (n: Notification) => {
      setLastEvent(n);
      setEventSeq((s) => s + 1);
      setUnreadCount((c) => c + 1);
    },
    [],
  );

  useSSE(handleSSE, isLoggedIn);

  const value = useMemo<NotificationContextValue>(
    () => ({ unreadCount, lastEvent, eventSeq, refreshUnread, setUnreadCount }),
    [unreadCount, lastEvent, eventSeq, refreshUnread],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications 必须在 NotificationProvider 内使用');
  return ctx;
}
