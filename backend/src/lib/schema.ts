import {
  bigint,
  datetime,
  index,
  mysqlTable,
  text,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

/**
 * Drizzle 表结构（与 lib/db.ts 的 DDL 保持一一对应）。
 * 属性名沿用 snake_case 行字段，调用点访问 row.xxx 与迁移前完全一致。
 */

const id = () => bigint('id', { mode: 'number' }).autoincrement().primaryKey();
const createdAt = () =>
  datetime('created_at', { fsp: 3, mode: 'date' }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);

export const accounts = mysqlTable('accounts', {
  id: id(),
  username: varchar('username', { length: 191 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  token: text('token'),
  refresh_token: text('refresh_token'),
  avatar_url: varchar('avatar_url', { length: 512 }),
  bio: varchar('bio', { length: 255 }),
  created_at: createdAt(),
});

export const videos = mysqlTable(
  'videos',
  {
    id: id(),
    author_id: bigint('author_id', { mode: 'number' }).notNull(),
    username: varchar('username', { length: 255 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: varchar('description', { length: 255 }),
    play_url: varchar('play_url', { length: 255 }).notNull(),
    cover_url: varchar('cover_url', { length: 255 }).notNull(),
    create_time: datetime('create_time', { fsp: 3, mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    likes_count: bigint('likes_count', { mode: 'number' }).notNull().default(0),
    popularity: bigint('popularity', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    index('idx_videos_author').on(t.author_id),
    index('idx_videos_create_time').on(t.create_time),
    index('idx_videos_likes_count_id').on(t.likes_count, t.id),
    index('idx_videos_popularity_time_id').on(t.popularity, t.create_time, t.id),
  ],
);

export const likes = mysqlTable(
  'likes',
  {
    id: id(),
    video_id: bigint('video_id', { mode: 'number' }).notNull(),
    account_id: bigint('account_id', { mode: 'number' }).notNull(),
    created_at: createdAt(),
  },
  (t) => [
    uniqueIndex('idx_like_video_account').on(t.video_id, t.account_id),
    index('idx_like_account').on(t.account_id),
  ],
);

export const comments = mysqlTable(
  'comments',
  {
    id: id(),
    username: varchar('username', { length: 191 }).notNull(),
    video_id: bigint('video_id', { mode: 'number' }).notNull(),
    author_id: bigint('author_id', { mode: 'number' }).notNull(),
    content: text('content').notNull(),
    created_at: createdAt(),
  },
  (t) => [index('idx_comment_video').on(t.video_id), index('idx_comment_author').on(t.author_id)],
);

export const socials = mysqlTable(
  'socials',
  {
    id: id(),
    follower_id: bigint('follower_id', { mode: 'number' }).notNull(),
    vlogger_id: bigint('vlogger_id', { mode: 'number' }).notNull(),
  },
  (t) => [
    uniqueIndex('idx_social_follower_vlogger').on(t.follower_id, t.vlogger_id),
    index('idx_social_vlogger').on(t.vlogger_id),
  ],
);

export const tags = mysqlTable('tags', {
  id: id(),
  name: varchar('name', { length: 100 }).notNull().unique(),
});

export const videoTags = mysqlTable(
  'video_tags',
  {
    id: id(),
    video_id: bigint('video_id', { mode: 'number' }).notNull(),
    tag_id: bigint('tag_id', { mode: 'number' }).notNull(),
  },
  (t) => [uniqueIndex('idx_video_tag').on(t.video_id, t.tag_id), index('idx_tag').on(t.tag_id)],
);

export const messages = mysqlTable(
  'messages',
  {
    id: id(),
    from_id: bigint('from_id', { mode: 'number' }).notNull(),
    to_id: bigint('to_id', { mode: 'number' }).notNull(),
    content: text('content').notNull(),
    is_read: tinyint('is_read').notNull().default(0),
    created_at: createdAt(),
  },
  (t) => [index('idx_message_from').on(t.from_id), index('idx_message_to').on(t.to_id)],
);

export const notifications = mysqlTable(
  'notifications',
  {
    id: id(),
    recipient_id: bigint('recipient_id', { mode: 'number' }).notNull(),
    sender_id: bigint('sender_id', { mode: 'number' }).notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    target_id: bigint('target_id', { mode: 'number' }).notNull().default(0),
    content: varchar('content', { length: 255 }),
    is_read: tinyint('is_read').notNull().default(0),
    created_at: createdAt(),
  },
  (t) => [index('idx_notification_recipient').on(t.recipient_id, t.is_read)],
);

export const outboxMsgs = mysqlTable(
  'outbox_msgs',
  {
    id: id(),
    video_id: bigint('video_id', { mode: 'number' }).notNull(),
    event_type: varchar('event_type', { length: 50 }).notNull(),
    create_time: datetime('create_time', { fsp: 3, mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    status: varchar('status', { length: 50 }).notNull().default('pending'),
  },
  (t) => [index('idx_outbox_status').on(t.status)],
);
