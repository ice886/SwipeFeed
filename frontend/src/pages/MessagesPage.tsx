import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import * as accountApi from '../api/account';
import * as messageApi from '../api/message';
import * as socialApi from '../api/social';
import { useAuth } from '../context/AuthContext';
import { timeAgo } from '../utils/format';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { useToast } from '../components/Toast';
import type { Account, Message } from '../types';

const POLL_INTERVAL = 10_000;

export default function MessagesPage() {
  const { accountId } = useAuth();
  const { error: toastError, success } = useToast();

  const [peers, setPeers] = useState<Account[]>([]);
  const [peersLoading, setPeersLoading] = useState(true);
  const [activePeer, setActivePeer] = useState<Account | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [searching, setSearching] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const activePeerIdRef = useRef<number | null>(null);

  activePeerIdRef.current = activePeer?.id ?? null;

  // 会话候选：关注 + 粉丝（去重、排除自己）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPeersLoading(true);
      const map = new Map<number, Account>();
      try {
        const [vloggers, followers] = await Promise.all([
          socialApi.getAllVloggers(),
          socialApi.getAllFollowers(),
        ]);
        for (const u of vloggers.vloggers ?? []) map.set(u.id, u);
        for (const u of followers.followers ?? []) map.set(u.id, u);
      } catch {
        // 静默：会话列表拿不到就展示搜索入口
      }
      if (cancelled) return;
      map.delete(accountId ?? -1);
      setPeers([...map.values()]);
      setPeersLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const loadMessages = useCallback(
    async (peerId: number) => {
      setMessagesLoading(true);
      try {
        const res = await messageApi.list(peerId);
        const list = [...(res.messages ?? [])].sort(
          (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
        );
        if (activePeerIdRef.current === peerId) setMessages(list);
      } catch (err) {
        toastError(err instanceof Error ? err.message : '消息加载失败');
      } finally {
        if (activePeerIdRef.current === peerId) setMessagesLoading(false);
      }
    },
    [toastError],
  );

  // 轮询当前会话（轻量实时）
  useEffect(() => {
    if (!activePeer) return;
    void loadMessages(activePeer.id);
    const timer = window.setInterval(() => {
      if (activePeerIdRef.current !== null) void loadMessages(activePeerIdRef.current);
    }, POLL_INTERVAL);
    return () => window.clearInterval(timer);
  }, [activePeer, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const onSearch = async (e: FormEvent) => {
    e.preventDefault();
    const name = searchName.trim();
    if (!name || searching) return;
    setSearching(true);
    try {
      const user = await accountApi.findByUsername(name);
      setPeers((prev) => (prev.some((p) => p.id === user.id) ? prev : [user, ...prev]));
      setActivePeer(user);
      setSearchName('');
      success(`已找到 @${user.username}`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : '用户不存在');
    } finally {
      setSearching(false);
    }
  };

  const onSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    if (!text || !activePeer || sending) return;
    setSending(true);
    try {
      const res = await messageApi.send(activePeer.id, text);
      if (res.message) setMessages((prev) => [...prev, res.message]);
      else if (activePeerIdRef.current !== null) void loadMessages(activePeerIdRef.current);
      setContent('');
    } catch (err) {
      toastError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setSending(false);
    }
  };

  const sortedPeers = useMemo(() => peers, [peers]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-20">
      <div className="animate-fade-in-up flex h-[calc(100vh-8rem)] overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/50">
        {/* 左侧会话列表 */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-800">
          <div className="border-b border-zinc-800 p-4">
            <h1 className="mb-3 text-lg font-semibold text-white">私信</h1>
            <form onSubmit={(e) => void onSearch(e)} className="flex gap-2">
              <input
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="搜索用户名发起会话"
                className="min-w-0 flex-1 rounded-full border border-zinc-800 bg-zinc-950/70 px-4 py-1.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-rose-500/60"
              />
              <button
                type="submit"
                disabled={searching || !searchName.trim()}
                className="rounded-full bg-rose-500 px-3.5 py-1.5 text-sm text-white transition hover:bg-rose-400 disabled:opacity-50"
              >
                {searching ? <Spinner size={14} /> : '搜索'}
              </button>
            </form>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {peersLoading ? (
              <div className="flex justify-center py-10">
                <Spinner size={24} className="text-zinc-500" />
              </div>
            ) : sortedPeers.length === 0 ? (
              <div className="px-3 py-10 text-center text-sm text-zinc-500">
                暂无会话。
                <br />
                可通过上方搜索用户名发起
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {sortedPeers.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setActivePeer(p)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                        activePeer?.id === p.id ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
                      }`}
                    >
                      <Avatar userId={p.id} username={p.username} avatarUrl={p.avatar_url} size={40} link={false} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-zinc-100">@{p.username}</span>
                        <span className="block truncate text-xs text-zinc-500">{p.bio || '发条消息打个招呼吧'}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* 右侧聊天区 */}
        <section className="flex min-w-0 flex-1 flex-col">
          {!activePeer ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState title="选择一个会话" description="从左侧选择联系人，或搜索用户名开始聊天" />
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-zinc-800 px-5 py-3.5">
                <Avatar
                  userId={activePeer.id}
                  username={activePeer.username}
                  avatarUrl={activePeer.avatar_url}
                  size={40}
                  link={false}
                />
                <div>
                  <div className="text-sm font-semibold text-white">@{activePeer.username}</div>
                  <div className="text-xs text-zinc-500">最近 50 条消息</div>
                </div>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {messagesLoading && messages.length === 0 ? (
                  <div className="flex justify-center py-16">
                    <Spinner size={24} className="text-zinc-500" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-16 text-center text-sm text-zinc-500">
                    和 @{activePeer.username} 还没有聊过，打个招呼吧
                  </div>
                ) : (
                  messages.map((m) => {
                    const mine = m.from_id === accountId;
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[72%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            mine
                              ? 'rounded-br-md bg-gradient-to-r from-rose-500 to-orange-500 text-white'
                              : 'rounded-bl-md bg-zinc-800 text-zinc-100'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          <p className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-zinc-500'}`}>
                            {timeAgo(m.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={(e) => void onSend(e)} className="flex gap-2 border-t border-zinc-800 p-4">
                <input
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={`发消息给 @${activePeer.username}…`}
                  maxLength={500}
                  className="min-w-0 flex-1 rounded-full border border-zinc-800 bg-zinc-950/70 px-5 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-rose-500/60"
                />
                <button
                  type="submit"
                  disabled={sending || !content.trim()}
                  className="flex items-center gap-1.5 rounded-full bg-rose-500 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-rose-400 disabled:opacity-50"
                >
                  {sending && <Spinner size={14} />}
                  发送
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
