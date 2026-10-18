import { Link } from 'react-router-dom';
import { assetUrl } from '../api/client';

interface AvatarProps {
  userId: number;
  username: string;
  avatarUrl?: string | null;
  size?: number;
  link?: boolean;
  className?: string;
}

const GRADIENTS = [
  'from-rose-500 to-orange-400',
  'from-cyan-500 to-blue-500',
  'from-violet-500 to-fuchsia-500',
  'from-emerald-500 to-teal-400',
  'from-amber-500 to-red-500',
];

export default function Avatar({ userId, username, avatarUrl, size = 40, link = true, className = '' }: AvatarProps) {
  const gradient = GRADIENTS[Math.abs(userId) % GRADIENTS.length];
  const inner = avatarUrl ? (
    <img
      src={assetUrl(avatarUrl)}
      alt={username}
      className="h-full w-full rounded-full object-cover"
      onError={(e) => {
        // 头像加载失败时退回首字母
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  ) : (
    <span
      className={`flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-sm font-semibold text-white`}
    >
      {username.slice(0, 1).toUpperCase()}
    </span>
  );

  const style = { width: size, height: size };
  const cls = `shrink-0 overflow-hidden rounded-full ring-2 ring-zinc-800 transition hover:ring-rose-500/60 ${className}`;

  return link ? (
    <Link to={`/user/${userId}`} style={style} className={cls} title={username}>
      {inner}
    </Link>
  ) : (
    <span style={style} className={cls}>
      {inner}
    </span>
  );
}
