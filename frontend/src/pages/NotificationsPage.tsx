import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as notificationApi from '../api/notification';
import { useNotifications } from '../context/NotificationContext';
import { timeAgo } from '../utils/format';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { useToast } from '../components/Toast';
import type { Notification, NotificationType } from '../types';

const TYPE_META: Record<NotificationType, { label: string; color: string; icon: React.ReactNode }> = {
  like: {
    label: '点赞',
    color: 'bg-rose-500/15 text-rose-400',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 21s-7.5-4.8-10-9.3C.4 8.6 2 5 5.5 5c2 0 3.5 1.1 4.5 2.6C11 6.1 12.5 5 14.5 5 18 5 19.6 8.6 22 11.7 19.5 16.2 12 21 12 21z" />
      </svg>
    ),
  },
  comment: {
    label: '评论',
    color: 'bg-cyan-500/15 text-cyan-400',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12a8 8 0 0 1-8 8H4l2.2-3.3A8 8 0 1 1 21 12z" strokeLinejoin="round" />
      </svg>
    ),
  },
  follow: {
    label: '关注',
    color: 'bg-emerald-500/15 text-emerald-400',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="10" cy="8" r="3.5" />
        <path d="M3.5 20c0-3.3 3-5 6.5-5 1.2 0 2.3.2 3.2.6M18 9v6m3-3h-6" strokeLinecap="round" />
      </svg>
    ),
  },
  mention: {
    label: '提及',
    color: 'bg-violet-500/15 text-violet-400',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="4" />
        <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" strokeLinecap="round" />
      </svg>
    ),
  },
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { refreshUnread, setUnreadCount, lastEvent, eventSeq } = useNotifications();
  const { error: toastError, success } = useToast();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<number | 'all' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationApi.list();
      setItems(res.notifications ?? []);
    } catch (err) {
      toastError(err instanceof Error ? err.message : '通知加载失败');
    } finally {
      setLoading(false);
    }
    void refreshUnread();
  }, [toastError, refreshUnread]);

  useEffect(() => {
    void load();
  }, [load]);

  // SSE 实时推送：新通知插入列表顶部
  const [seenSeq, setSeenSeq] = useState(0);
  useEffect(() => {
    if (eventSeq > seenSeq && lastEvent) {
      setSeenSeq(eventSeq);
      setItems((prev) => (prev.some((n) => n.id === lastEvent.id) ? prev : [lastEvent, ...prev]));
    }
  }, [eventSeq, lastEvent, seenSeq]);

  const markOne = async (n: Notification) => {
    if (marking !== null) return;
    // 跳转目标：follow -> 用户主页，其他 -> 视频详情
    const target = n.type === 'follow' ? `/user/${n.sender_id}` : `/video/${n.target_id}`;

    if (!n.is_read) {
      setMarking(n.id);
      try {
        await notificationApi.markRead(n.id);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
        setUnreadCount((c: number) => Math.max(0, c - 1));
      } catch (err) {
        toastError(err instanceof Error ? err.message : '标记失败');
      } finally {
        setMarking(null);
      }
    }
    navigate(target);
  };

  const markAll = async () => {
    if (marking !== null) return;
    setMarking('all');
    try {
      await notificationApi.markRead();
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
      setUnreadCount(0);
      success('全部已读');
    } catch (err) {
      toastError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setMarking(null);
    }
  };

  const unread = items.filter((n) => !n.is_read).length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-24">
      <div className="animate-fade-in-up mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">通知</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {unread > 0 ? `${unread} 条未读 · ` : ''}实时推送已开启，新互动会自动出现
          </p>
        </div>
        <button
          type="button"
          onClick={() => void markAll()}
          disabled={marking !== null || unread === 0}
          className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 transition hover:border-rose-500/50 hover:text-rose-400 disabled:opacity-40"
        >
          {marking === 'all' && <Spinner size={14} />}
          全部已读
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={30} className="text-zinc-500" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="暂无通知" description="有人点赞、评论、关注或 @你 时，通知会出现在这里" />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => {
            const meta = TYPE_META[n.type] ?? TYPE_META.like;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void markOne(n)}
                  className={`animate-fade-in-up flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition hover:border-zinc-700 ${
                    n.is_read
                      ? 'border-zinc-800/70 bg-zinc-900/40 hover:bg-zinc-900/70'
                      : 'border-rose-500/30 bg-rose-500/[0.07] hover:bg-rose-500/10'
                  }`}
                >
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.color}`}>
                    {meta.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.color}`}>
                        {meta.label}
                      </span>
                      {!n.is_read && <span className="h-2 w-2 rounded-full bg-rose-500" />}
                      <span className="ml-auto text-xs text-zinc-600">{timeAgo(n.created_at)}</span>
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-zinc-200">{n.content}</span>
                    <span className="mt-1 block text-xs text-zinc-600">
                      {n.type === 'follow' ? '点击查看主页' : '点击查看视频'}
                      {marking === n.id ? ' · 标记中…' : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
