import * as mysql from 'mysql2/promise';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle, type MySql2Database, type MySql2PreparedQueryHKT, type MySql2QueryResultHKT, type MySql2Transaction } from 'drizzle-orm/mysql2';
import { config } from '../config';
import * as schema from './schema';

/** MySQL 连接池（API / Worker 共用，Drizzle 底层连接） */
export const pool = mysql.createPool({
  host: config.mysql.host,
  port: config.mysql.port,
  user: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  waitForConnections: true,
  connectionLimit: 20,
  namedPlaceholders: false,
  dateStrings: false,
});

/** Drizzle 实例：所有业务查询统一走它（查询构建器 / sql`` 片段） */
export const db: MySql2Database<typeof schema> = drizzle(pool, { schema, mode: 'default' });

/** 事务句柄类型（db.transaction 回调参数） */
export type Tx = MySql2Transaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

/** 行类型：直接取 Drizzle schema 的推导类型（snake_case 字段与原接口一致） */
export type AccountRow = typeof schema.accounts.$inferSelect;
export type VideoRow = typeof schema.videos.$inferSelect;
export type LikeRow = typeof schema.likes.$inferSelect;
export type CommentRow = typeof schema.comments.$inferSelect;
export type MessageRow = typeof schema.messages.$inferSelect;
export type NotificationRow = typeof schema.notifications.$inferSelect;
export type OutboxRow = typeof schema.outboxMsgs.$inferSelect;

export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

// ---------------------------------------------------------------------------
// AutoMigrate：启动时同步表结构（与 schema.ts 一一对应，CREATE IF NOT EXISTS 保底）
// ---------------------------------------------------------------------------

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(191) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    token TEXT,
    refresh_token TEXT,
    avatar_url VARCHAR(512),
    bio VARCHAR(255),
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS videos (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    author_id BIGINT UNSIGNED NOT NULL,
    username VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description VARCHAR(255),
    play_url VARCHAR(255) NOT NULL,
    cover_url VARCHAR(255) NOT NULL,
    create_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    likes_count BIGINT NOT NULL DEFAULT 0,
    popularity BIGINT NOT NULL DEFAULT 0,
    INDEX idx_videos_author (author_id),
    INDEX idx_videos_create_time (create_time DESC),
    INDEX idx_videos_likes_count_id (likes_count DESC, id DESC),
    INDEX idx_videos_popularity_time_id (popularity DESC, create_time DESC, id DESC)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS likes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    video_id BIGINT UNSIGNED NOT NULL,
    account_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY idx_like_video_account (video_id, account_id),
    INDEX idx_like_account (account_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS comments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(191) NOT NULL,
    video_id BIGINT UNSIGNED NOT NULL,
    author_id BIGINT UNSIGNED NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_comment_video (video_id),
    INDEX idx_comment_author (author_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS socials (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    follower_id BIGINT UNSIGNED NOT NULL,
    vlogger_id BIGINT UNSIGNED NOT NULL,
    UNIQUE KEY idx_social_follower_vlogger (follower_id, vlogger_id),
    INDEX idx_social_vlogger (vlogger_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS tags (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS video_tags (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    video_id BIGINT UNSIGNED NOT NULL,
    tag_id BIGINT UNSIGNED NOT NULL,
    UNIQUE KEY idx_video_tag (video_id, tag_id),
    INDEX idx_tag (tag_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    from_id BIGINT UNSIGNED NOT NULL,
    to_id BIGINT UNSIGNED NOT NULL,
    content TEXT NOT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_message_from (from_id),
    INDEX idx_message_to (to_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    recipient_id BIGINT UNSIGNED NOT NULL,
    sender_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(50) NOT NULL,
    target_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    content VARCHAR(255),
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_notification_recipient (recipient_id, is_read)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS outbox_msgs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    video_id BIGINT UNSIGNED NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    create_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    INDEX idx_outbox_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

export async function ensureSchema(): Promise<void> {
  for (const ddl of DDL) {
    await pool.query(ddl);
  }
}
