import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as accountApi from '../api/account';
import * as socialApi from '../api/social';
import * as videoApi from '../api/video';
import { useAuth } from '../context/AuthContext';
import { formatCount } from '../utils/format';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import FollowButton from '../components/FollowButton';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import UserCard from '../components/UserCard';
import VideoCard from '../components/VideoCard';
import { GridSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import type { Account, ProfileResponse, Video } from '../types';

type ListKind = 'followers' | 'vloggers' | null;

function StatBox({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  const inner = (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 px-4 py-3 text-center transition hover:border-zinc-700 hover:bg-zinc-900">
      <div className="text-xl font-bold text-white">{formatCount(value)}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{label}</div>
    </div>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="w-full">
      {inner}
    </button>
  ) : (
    <div className="w-full">{inner}</div>
  );
}

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const { isLoggedIn, accountId } = useAuth();
  const { error: toastError } = useToast();

  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [videosLoading, setVideosLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listKind, setListKind] = useState<ListKind>(null);
  const [listUsers, setListUsers] = useState<Account[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const isSelf = isLoggedIn && accountId === userId;

  const load = useCallback(async () => {
    if (!Number.isFinite(userId)) {
      setLoadError('无效的用户 ID');
      setLoading(false);
      setVideosLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await accountApi.getProfile(userId);
      setProfile(res);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载失败');
      setLoading(false);
      return;
    }
    setLoading(false);

    setVideosLoading(true);
    try {
      const res = await videoApi.listByAuthorID(userId);
      setVideos(res.videos ?? []);
    } catch {
      setVideos([]);
    } finally {
      setVideosLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openList = async (kind: Exclude<ListKind, null>) => {
    setListKind(kind);
    setListUsers([]);
    setListLoading(true);
    try {
      const users =
        kind === 'followers'
          ? (await socialApi.getAllFollowers(userId)).followers ?? []
          : (await socialApi.getAllVloggers(userId)).vloggers ?? [];
      setListUsers(users);
    } catch (err) {
      toastError(err instanceof Error ? err.message : '列表加载失败');
    } finally {
      setListLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center pt-16">
        <Spinner size={32} className="text-zinc-500" />
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-24">
        <EmptyState
          title="用户加载失败"
          description={loadError ?? '用户不存在'}
          action={
            <Link to="/" className="mt-2 rounded-full bg-rose-500 px-6 py-2 text-sm text-white hover:bg-rose-400">
              返回首页
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-24">
      {/* 头部信息 */}
      <div className="animate-fade-in-up overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/60">
        <div className="relative h-32 bg-gradient-to-r from-rose-500/25 via-zinc-900 to-cyan-500/20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(244,63,94,0.25),transparent_60%)]" />
        </div>
        <div className="px-6 pb-6">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <div className="rounded-full border-4 border-zinc-900">
                <Avatar
                  userId={profile.account.id}
                  username={profile.account.username}
                  avatarUrl={profile.account.avatar_url}
                  size={88}
                  link={false}
                />
              </div>
              <div className="pb-1">
                <h1 className="text-2xl font-bold text-white">@{profile.account.username}</h1>
                <p className="mt-1 max-w-md text-sm text-zinc-400">
                  {profile.account.bio || '这个人很懒，什么都没写'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 pb-1">
              {isSelf ? (
                <Link
                  to="/settings"
                  className="rounded-full border border-zinc-700 bg-zinc-800/80 px-5 py-2 text-sm text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800"
                >
                  编辑资料
                </Link>
              ) : (
                <FollowButton vloggerId={userId} />
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBox label="作品" value={profile.video_count} />
            <StatBox label="获赞" value={profile.total_likes} />
            <StatBox label="粉丝" value={profile.follower_count} onClick={() => void openList('followers')} />
            <StatBox label="关注" value={profile.vlogger_count} onClick={() => void openList('vloggers')} />
          </div>
        </div>
      </div>

      {/* 作品网格 */}
      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-white">
          作品 <span className="ml-1 text-sm font-normal text-zinc-500">{videos.length} 个</span>
        </h2>
        {videosLoading ? (
          <GridSkeleton count={4} />
        ) : videos.length === 0 ? (
          <EmptyState title="还没有发布作品" description={isSelf ? '点击右上角「上传」发布第一个视频' : 'TA 还没有发布过视频'} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {videos.map((v) => (
              <VideoCard key={v.id} item={v} showAuthor={false} />
            ))}
          </div>
        )}
      </section>

      {/* 粉丝 / 关注列表 */}
      <Modal
        open={listKind !== null}
        title={listKind === 'followers' ? '粉丝列表' : '关注列表'}
        onClose={() => setListKind(null)}
      >
        {listLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size={26} className="text-zinc-500" />
          </div>
        ) : listUsers.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-500">
            {listKind === 'followers' ? '还没有粉丝' : '还没有关注任何人'}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {listUsers.map((u) => (
              <UserCard
                key={u.id}
                user={u}
                showFollow={!isSelf || listKind === 'vloggers'}
                onClick={() => setListKind(null)}
              />
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
