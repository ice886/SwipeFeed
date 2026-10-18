import { Link } from 'react-router-dom';
import type { Account } from '../types';
import Avatar from './Avatar';
import FollowButton from './FollowButton';

interface UserCardProps {
  user: Account;
  /** 是否展示关注按钮 */
  showFollow?: boolean;
  /** 点击跳转后关闭弹层等 */
  onClick?: () => void;
  right?: React.ReactNode;
}

export default function UserCard({ user, showFollow = true, onClick, right }: UserCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-3 transition hover:border-zinc-700 hover:bg-zinc-900">
      <Avatar userId={user.id} username={user.username} avatarUrl={user.avatar_url} size={44} link={false} />
      <Link
        to={`/user/${user.id}`}
        onClick={onClick}
        className="min-w-0 flex-1"
      >
        <div className="truncate text-sm font-medium text-zinc-100 hover:text-rose-400">@{user.username}</div>
        <div className="truncate text-xs text-zinc-500">{user.bio || '这个人很懒，什么都没写'}</div>
      </Link>
      {right ?? (showFollow ? <FollowButton vloggerId={user.id} size="sm" /> : null)}
    </div>
  );
}
