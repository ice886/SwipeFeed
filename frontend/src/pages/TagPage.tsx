import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as feedApi from '../api/feed';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import VideoCard from '../components/VideoCard';
import { GridSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import type { FeedVideoItem } from '../types';

export default function TagPage() {
  const { name } = useParams<{ name: string }>();
  const tagName = decodeURIComponent(name ?? '');
  const { error: toastError } = useToast();
  const [items, setItems] = useState<FeedVideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await feedApi.listByTag({ tag_name: tagName, limit: 50 });
        if (!cancelled) setItems(res.video_list ?? []);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : '加载失败');
          toastError(err instanceof Error ? err.message : '加载失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tagName, toastError]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-24">
      <div className="animate-fade-in-up mb-8 rounded-3xl border border-zinc-800 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-900 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-400">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 3 8 21M16 3l-2 18M4 8.5h16M3 15.5h16" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl font-bold text-white">#{tagName}</h1>
            <p className="mt-0.5 text-sm text-zinc-500">话题下的最新视频</p>
          </div>
        </div>
      </div>

      {loading ? (
        <GridSkeleton count={8} />
      ) : loadError && items.length === 0 ? (
        <EmptyState
          title="话题加载失败"
          description={loadError}
          action={
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 rounded-full bg-zinc-800 px-6 py-2 text-sm text-white hover:bg-zinc-700"
            >
              重试
            </button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="话题下暂无视频"
          description={`还没有人发布带 #${tagName} 的视频，去发布第一个吧`}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <VideoCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {loading && (
        <div className="mt-4 flex justify-center">
          <Spinner size={22} className="text-zinc-600" />
        </div>
      )}
    </div>
  );
}
