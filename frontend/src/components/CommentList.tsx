import { useCallback, useEffect, useRef, useState } from 'react';
import * as commentApi from '../api/comment';
import { useAuth } from '../context/AuthContext';
import { timeAgo } from '../utils/format';
import Avatar from './Avatar';
import Spinner from './Spinner';
import { useToast } from './Toast';
import type { Comment } from '../types';

interface CommentListProps {
  videoId: number;
  /** 发布成功后通知父组件（刷新计数等） */
  onPublished?: () => void;
}

export default function CommentList({ videoId, onPublished }: CommentListProps) {
  const { isLoggedIn, accountId } = useAuth();
  const { error, success, toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await commentApi.listAll(videoId);
      setComments(res.comments ?? []);
    } catch (err) {
      error(err instanceof Error ? err.message : '评论加载失败');
    } finally {
      setLoading(false);
    }
  }, [videoId, error]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    const text = content.trim();
    if (!text) return;
    if (!isLoggedIn) {
      toast('请先登录后再评论', 'error');
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await commentApi.publish(videoId, text);
      setContent('');
      success('评论发布成功');
      await load();
      onPublished?.();
    } catch (err) {
      error(err instanceof Error ? err.message : '评论发布失败');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (comment: Comment) => {
    if (deletingId !== null) return;
    setDeletingId(comment.id);
    try {
      await commentApi.remove(comment.id);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
      success('评论已删除');
    } catch (err) {
      error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-base font-semibold text-white">
        评论 <span className="ml-1 text-sm font-normal text-zinc-500">{comments.length}</span>
      </h3>

      {/* 发布框 */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={() => {
            if (!isLoggedIn) toast('登录后即可参与评论', 'info');
          }}
          placeholder={isLoggedIn ? '友善评论，支持 @用户名 提及好友…' : '登录后参与评论'}
          rows={3}
          maxLength={500}
          className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-rose-500/60"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-zinc-600">
            {content.length}/500 · 输入 @用户名 可提及他人
          </span>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !content.trim()}
            className="flex items-center gap-1.5 rounded-full bg-rose-500 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Spinner size={14} />}
            发布
          </button>
        </div>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner size={28} className="text-zinc-500" />
        </div>
      ) : comments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 py-10 text-center text-sm text-zinc-500">
          还没有评论，来抢沙发吧
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => {
            const mine = accountId === c.author_id;
            return (
              <li key={c.id} className="animate-fade-in-up flex gap-3 rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-3">
                <Avatar userId={c.author_id} username={c.username} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-zinc-200">@{c.username}</span>
                    <span className="text-xs text-zinc-600">{timeAgo(c.created_at)}</span>
                    {mine && (
                      <button
                        type="button"
                        onClick={() => void remove(c)}
                        disabled={deletingId === c.id}
                        className="ml-auto rounded-full px-2 py-0.5 text-xs text-zinc-500 transition hover:bg-zinc-800 hover:text-rose-400 disabled:opacity-50"
                      >
                        {deletingId === c.id ? '删除中…' : '删除'}
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300">
                    {c.content}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && comments.length > 0 && (
        <p className="text-center text-xs text-zinc-600">
          共 {comments.length} 条评论{comments.length >= 200 ? '（最多展示 200 条）' : ''}
        </p>
      )}
    </section>
  );
}
