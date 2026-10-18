import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFeed, toggleVideoLike } from '../hooks/useFeed';
import type { FeedTab } from '../hooks/useFeed';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { formatCount, timeAgo } from '../utils/format';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import FollowButton from '../components/FollowButton';
import HashtagText from '../components/HashtagText';
import Spinner from '../components/Spinner';
import VideoPlayer from '../components/VideoPlayer';
import { useToast } from '../components/Toast';
import { FeedSkeleton } from '../components/Skeleton';
import type { FeedVideoItem } from '../types';

const TABS: Array<{ key: FeedTab; label: string }> = [
  { key: 'recommend', label: '推荐' },
  { key: 'following', label: '关注' },
  { key: 'popular', label: '热榜' },
  { key: 'likes', label: '点赞榜' },
];

function ActionRail({
  item,
  liked,
  onToggleLike,
}: {
  item: FeedVideoItem;
  liked: boolean;
  onToggleLike: () => void;
}) {
  return (
    <div className="absolute bottom-28 right-3 z-20 flex flex-col items-center gap-5 sm:right-5">
      {/* 作者 */}
      <div className="flex flex-col items-center gap-1.5">
        <Avatar userId={item.author.id} username={item.author.username} size={46} />
        <FollowButton vloggerId={item.author.id} size="sm" className="!px-2.5 !py-1 !text-[11px]" />
      </div>

      {/* 点赞 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleLike();
        }}
        className="flex flex-col items-center gap-1 text-white transition hover:scale-110 active:scale-95"
        aria-label={liked ? '取消点赞' : '点赞'}
      >
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition ${
            liked ? 'animate-heart-pop bg-rose-500/90' : 'bg-black/40 hover:bg-black/60'
          }`}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill={liked ? 'white' : 'none'} stroke="white" strokeWidth="1.8">
            <path
              d="M12 21s-7.5-4.8-10-9.3C.4 8.6 2 5 5.5 5c2 0 3.5 1.1 4.5 2.6C11 6.1 12.5 5 14.5 5 18 5 19.6 8.6 22 11.7 19.5 16.2 12 21 12 21z"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="text-xs font-medium text-white drop-shadow">{formatCount(item.likes_count)}</span>
      </button>

      {/* 评论 */}
      <Link
        to={`/video/${item.id}`}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col items-center gap-1 text-white transition hover:scale-110 active:scale-95"
        aria-label="查看评论"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 backdrop-blur transition hover:bg-black/60">
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
            <path d="M21 12a8 8 0 0 1-8 8H4l2.2-3.3A8 8 0 1 1 21 12z" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="text-xs font-medium text-white drop-shadow">详情</span>
      </Link>

      {/* 分享（复制链接） */}
      <ShareButton videoId={item.id} />
    </div>
  );
}

function ShareButton({ videoId }: { videoId: number }) {
  const { success, error } = useToast();
  const onShare = async () => {
    try {
      const url = `${window.location.origin}/video/${videoId}`;
      await navigator.clipboard.writeText(url);
      success('链接已复制');
    } catch {
      error('复制失败');
    }
  };
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void onShare();
      }}
      className="flex flex-col items-center gap-1 text-white transition hover:scale-110 active:scale-95"
      aria-label="分享"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 backdrop-blur transition hover:bg-black/60">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
          <circle cx="18" cy="5" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="19" r="2.5" />
          <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" strokeLinecap="round" />
        </svg>
      </span>
      <span className="text-xs font-medium text-white drop-shadow">分享</span>
    </button>
  );
}

function FeedItemView({
  item,
  onToggleLike,
}: {
  item: FeedVideoItem;
  onToggleLike: (item: FeedVideoItem) => void;
}) {
  return (
    <section className="relative h-full w-full snap-start overflow-hidden bg-black">
      <VideoPlayer
        playUrl={item.play_url}
        coverUrl={item.cover_url}
        className="absolute inset-0"
        playWhenVisible
        loop
      />

      {/* 沉浸式渐变遮罩 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

      {/* 文案 */}
      <div className="absolute bottom-6 left-4 z-20 max-w-[min(560px,68%)] space-y-2 sm:left-6">
        <Link to={`/user/${item.author.id}`} className="inline-flex items-center gap-2">
          <span className="text-base font-semibold text-white drop-shadow hover:text-rose-400">
            @{item.author.username}
          </span>
        </Link>
        <p className="line-clamp-2 text-sm leading-relaxed text-white/95 drop-shadow sm:text-base">
          <HashtagText text={item.title} />
        </p>
        {item.description ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-white/70 drop-shadow sm:text-sm">
            <HashtagText text={item.description} />
          </p>
        ) : null}
        <p className="text-xs text-white/50">{timeAgo(item.create_time)}</p>
      </div>

      <ActionRail
        item={item}
        liked={item.is_liked}
        onToggleLike={() => onToggleLike(item)}
      />
    </section>
  );
}

export default function FeedPage() {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const { error: toastError, toast } = useToast();
  const [tab, setTab] = useState<FeedTab>('recommend');
  const { items, loading, loadingMore, hasMore, error, loadMore, reload, setItemLiked } = useFeed(tab, isLoggedIn);

  const sentinelRef = useInfiniteScroll(loadMore, hasMore && !loading && !loadingMore);

  const needLogin = tab === 'following' && !isLoggedIn;

  const onToggleLike = async (item: FeedVideoItem) => {
    if (!isLoggedIn) {
      toast('请先登录后再点赞', 'error');
      navigate('/login');
      return;
    }
    const next = !item.is_liked;
    setItemLiked(item.id, next); // 乐观更新
    try {
      await toggleVideoLike(item.id, item.is_liked);
    } catch (err) {
      setItemLiked(item.id, !next); // 回滚
      toastError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const tabs = useMemo(() => TABS, []);

  return (
    <div className="h-screen pt-16">
      <div className="relative h-full overflow-y-scroll bg-[#0f0f0f] snap-y snap-mandatory no-scrollbar">
        {/* Tab 栏 */}
        <div className="sticky top-0 z-30 flex h-14 items-center justify-center">
          <div className="flex items-center gap-1 rounded-full border border-zinc-800/80 bg-zinc-950/70 p-1 backdrop-blur-xl">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition sm:px-5 ${
                  tab === t.key
                    ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-lg shadow-rose-500/25'
                    : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 内容区 */}
        {needLogin ? (
          <div className="flex h-[calc(100%-3.5rem)] items-center justify-center px-6">
            <EmptyState
              title="关注流需要登录"
              description="登录后即可看到你关注的创作者的最新视频"
              action={
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="mt-2 rounded-full bg-rose-500 px-6 py-2 text-sm font-medium text-white transition hover:bg-rose-400"
                >
                  去登录
                </button>
              }
            />
          </div>
        ) : error && items.length === 0 ? (
          <div className="flex h-[calc(100%-3.5rem)] items-center justify-center px-6">
            <EmptyState
              title="加载失败"
              description={error}
              action={
                <button
                  type="button"
                  onClick={reload}
                  className="mt-2 rounded-full bg-zinc-800 px-6 py-2 text-sm text-white transition hover:bg-zinc-700"
                >
                  重试
                </button>
              }
            />
          </div>
        ) : loading && items.length === 0 ? (
          <div className="h-[calc(100%-3.5rem)]">
            <FeedSkeleton />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-[calc(100%-3.5rem)] items-center justify-center px-6">
            <EmptyState title="暂时没有内容" description="换个 Tab 逛逛，或者稍后再来" />
          </div>
        ) : (
          <>
            {items.map((item) => (
              <div key={item.id} className="h-full snap-start">
                <FeedItemView item={item} onToggleLike={(it) => void onToggleLike(it)} />
              </div>
            ))}

            {/* 加载更多哨兵 */}
            <div ref={sentinelRef} className="flex h-20 items-center justify-center">
              {loadingMore && <Spinner size={26} className="text-zinc-500" />}
              {!hasMore && items.length > 0 && (
                <span className="text-xs text-zinc-600">— 已经到底啦 —</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
