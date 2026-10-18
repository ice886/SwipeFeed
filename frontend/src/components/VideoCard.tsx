import { Link } from 'react-router-dom';
import { assetUrl } from '../api/client';
import { formatCount, timeAgo } from '../utils/format';
import HashtagText from './HashtagText';
import Avatar from './Avatar';
import type { FeedVideoItem, Video } from '../types';

interface VideoCardProps {
  /** Feed 条目（毫秒时间戳）或 Video 实体（ISO 时间） */
  item: FeedVideoItem | Video;
  showAuthor?: boolean;
}

function isFeedItem(item: FeedVideoItem | Video): item is FeedVideoItem {
  return 'author' in item;
}

export default function VideoCard({ item, showAuthor = true }: VideoCardProps) {
  const authorId = isFeedItem(item) ? item.author.id : item.author_id;
  const authorName = isFeedItem(item) ? item.author.username : item.username;
  const time = isFeedItem(item) ? item.create_time : item.create_time;

  return (
    <Link
      to={`/video/${item.id}`}
      className="group animate-fade-in-up block overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/60 transition hover:-translate-y-1 hover:border-zinc-700 hover:shadow-xl hover:shadow-black/40"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-950">
        {item.cover_url ? (
          <img
            src={assetUrl(item.cover_url)}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-700">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <path d="m10 9 5 3-5 3V9z" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3">
          <div className="flex items-center gap-1.5 text-xs text-white/90">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21s-7.5-4.8-10-9.3C.4 8.6 2 5 5.5 5c2 0 3.5 1.1 4.5 2.6C11 6.1 12.5 5 14.5 5 18 5 19.6 8.6 22 11.7 19.5 16.2 12 21 12 21z" />
            </svg>
            {formatCount(item.likes_count)}
            <span className="mx-1 text-white/40">·</span>
            {timeAgo(time)}
          </div>
        </div>
      </div>
      <div className="space-y-1.5 p-3">
        <div className="line-clamp-2 text-sm font-medium leading-snug text-zinc-100">
          <HashtagText text={item.title} />
        </div>
        {showAuthor && (
          <div className="flex items-center gap-2 pt-1">
            <Avatar userId={authorId} username={authorName} size={22} />
            <span className="truncate text-xs text-zinc-400">{authorName}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
