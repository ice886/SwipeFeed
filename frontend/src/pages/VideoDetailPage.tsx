import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as videoApi from '../api/video';
import * as likeApi from '../api/like';
import { toggleVideoLike } from '../hooks/useFeed';
import { useAuth } from '../context/AuthContext';
import { formatCount, timeAgo } from '../utils/format';
import Avatar from '../components/Avatar';
import CommentList from '../components/CommentList';
import EmptyState from '../components/EmptyState';
import FollowButton from '../components/FollowButton';
import HashtagText from '../components/HashtagText';
import Spinner from '../components/Spinner';
import VideoPlayer from '../components/VideoPlayer';
import { useToast } from '../components/Toast';
import type { Video } from '../types';

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const videoId = Number(id);
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const { error: toastError, success, toast } = useToast();

  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);

  const load = useCallback(async () => {
    if (!Number.isFinite(videoId)) {
      setLoadError('无效的视频 ID');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await videoApi.getDetail(videoId);
      const v = res.video_detail;
      setVideo(v);
      setLikesCount(v.likes_count ?? 0);
      if (isLoggedIn) {
        try {
          const l = await likeApi.isLiked(videoId);
          setLiked(Boolean(l.is_liked));
        } catch {
          setLiked(false);
        }
      } else {
        setLiked(false);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [videoId, isLoggedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggleLike = async () => {
    if (!isLoggedIn) {
      toast('请先登录后再点赞', 'error');
      navigate('/login');
      return;
    }
    const prevLiked = liked;
    setLiked(!prevLiked);
    setLikesCount((c) => Math.max(0, c + (prevLiked ? -1 : 1)));
    try {
      await toggleVideoLike(videoId, prevLiked);
    } catch (err) {
      setLiked(prevLiked);
      setLikesCount((c) => Math.max(0, c + (prevLiked ? 1 : -1)));
      toastError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/video/${videoId}`);
      success('链接已复制');
    } catch {
      toastError('复制失败');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center pt-16">
        <Spinner size={32} className="text-zinc-500" />
      </div>
    );
  }

  if (loadError || !video) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 pt-16">
        <EmptyState
          title="视频加载失败"
          description={loadError ?? '视频不存在或已被删除'}
          action={
            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-2 rounded-full bg-rose-500 px-6 py-2 text-sm text-white hover:bg-rose-400"
            >
              返回首页
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-20">
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* 左：播放器 + 评论 */}
        <div className="animate-fade-in-up space-y-6">
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-2xl shadow-black/50">
            <VideoPlayer
              playUrl={video.play_url}
              coverUrl={video.cover_url}
              className="aspect-video w-full"
              loop
            />
          </div>

          <div className="space-y-3">
            <h1 className="text-xl font-bold leading-snug text-white">
              <HashtagText text={video.title} />
            </h1>
            {video.description ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                <HashtagText text={video.description} />
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
              <span>发布于 {timeAgo(video.create_time)}</span>
              <span>热度 {formatCount(video.popularity)}</span>
              <span>获赞 {formatCount(likesCount)}</span>
            </div>
          </div>

          {/* 操作栏 */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void onToggleLike()}
              className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition ${
                liked
                  ? 'animate-heart-pop bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                  : 'border border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-rose-500/50 hover:text-rose-400'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
                <path
                  d="M12 21s-7.5-4.8-10-9.3C.4 8.6 2 5 5.5 5c2 0 3.5 1.1 4.5 2.6C11 6.1 12.5 5 14.5 5 18 5 19.6 8.6 22 11.7 19.5 16.2 12 21 12 21z"
                  strokeLinejoin="round"
                />
              </svg>
              {liked ? '已赞' : '点赞'} {formatCount(likesCount)}
            </button>
            <button
              type="button"
              onClick={() => void onShare()}
              className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-sm text-zinc-200 transition hover:border-zinc-700 hover:text-white"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="18" cy="5" r="2.5" />
                <circle cx="6" cy="12" r="2.5" />
                <circle cx="18" cy="19" r="2.5" />
                <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" strokeLinecap="round" />
              </svg>
              分享
            </button>
          </div>

          <div className="pt-2">
            <CommentList videoId={videoId} />
          </div>
        </div>

        {/* 右：作者卡片 */}
        <aside className="animate-fade-in-up lg:sticky lg:top-24 lg:h-fit">
          <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">作者</div>
            <Link to={`/user/${video.author_id}`} className="flex items-center gap-3">
              <Avatar userId={video.author_id} username={video.username} size={52} link={false} />
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-white hover:text-rose-400">
                  @{video.username}
                </div>
                <div className="text-xs text-zinc-500">查看主页</div>
              </div>
            </Link>
            <FollowButton vloggerId={video.author_id} className="w-full" />
            <div className="border-t border-zinc-800 pt-4 text-xs text-zinc-500">
              <p>支持在评论里 @用户名 提及好友，对方会收到通知。</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
