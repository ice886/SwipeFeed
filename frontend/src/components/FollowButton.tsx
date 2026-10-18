import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFollow } from '../hooks/useFollow';
import { useToast } from './Toast';

interface FollowButtonProps {
  vloggerId: number;
  size?: 'sm' | 'md';
  className?: string;
}

/** 关注/已关注 切换按钮。未登录点击提示先登录；自己的 id 不渲染。 */
export default function FollowButton({ vloggerId, size = 'md', className = '' }: FollowButtonProps) {
  const { isLoggedIn, accountId } = useAuth();
  const { isFollowing, toggleFollow } = useFollow(isLoggedIn);
  const { error, success } = useToast();
  const [pending, setPending] = useState(false);

  if (!isLoggedIn || accountId === vloggerId) return null;

  const following = isFollowing(vloggerId);
  const pad = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm';

  const onClick = async () => {
    if (pending) return;
    setPending(true);
    try {
      const next = await toggleFollow(vloggerId);
      success(next ? '关注成功' : '已取消关注');
    } catch (err) {
      error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void onClick();
      }}
      disabled={pending}
      className={`${pad} rounded-full font-medium transition disabled:opacity-60 ${
        following
          ? 'border border-zinc-700 bg-zinc-800/80 text-zinc-300 hover:border-zinc-600 hover:text-white'
          : 'bg-rose-500 text-white shadow-lg shadow-rose-500/25 hover:bg-rose-400'
      } ${className}`}
    >
      {following ? '已关注' : '关注'}
    </button>
  );
}
