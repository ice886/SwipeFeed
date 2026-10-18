import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { config } from '../config';
import { KEYS } from './cache';
import { db } from './db';
import { socials, videos } from './schema';
import * as redisLib from './redis';

/**
 * 关注流推拉结合索引（对齐 GCFeed 的 inbox/author outbox 设计）：
 * - 收件箱 feed:following:inbox:v1:<uid>：普通作者（粉丝 < 阈值）发布时推送到每个粉丝（写扩散）；
 * - 发件箱 feed:following:author:v1:<aid>：大V（粉丝 ≥ 阈值）只写自己的发件箱（读扩散）；
 * - 读取侧把「我的收件箱 + 关注的大V发件箱」做 k-way 归并（发布时间倒序、video_id 破平）。
 * Redis 不可用或索引整体缺失时返回 null，由调用方回退纯拉 SQL JOIN。
 */

export interface FollowingItem {
  videoId: number;
  authorId: number;
  publishedAtMs: number;
}

/** 分数 = 秒*1e6 + videoId%1e6：时间主排序，同秒内按 id 破平（浮点安全至公元 2255 年） */
export function followingIndexScore(publishedAtMs: number, videoId: number): number {
  return Math.floor(publishedAtMs / 1000) * 1_000_000 + (videoId % 1_000_000);
}

/** member 自带 videoId/authorId/发布时间，归并排序与取关清理无需回表 */
export function followingIndexMember(videoId: number, authorId: number, publishedAtMs: number): string {
  return `${videoId}:${authorId}:${new Date(publishedAtMs).toISOString()}`;
}

export function parseFollowingMember(member: string): FollowingItem | null {
  const i1 = member.indexOf(':');
  const i2 = i1 > 0 ? member.indexOf(':', i1 + 1) : -1;
  if (i1 <= 0 || i2 <= i1) return null;
  const videoId = Number(member.slice(0, i1));
  const authorId = Number(member.slice(i1 + 1, i2));
  const publishedAtMs = Date.parse(member.slice(i2 + 1));
  if (!Number.isFinite(videoId) || videoId <= 0 || !Number.isFinite(publishedAtMs)) return null;
  return { videoId, authorId: Number.isFinite(authorId) ? authorId : 0, publishedAtMs };
}

/** 大V阈值：Redis config:fanout_threshold 运行时可调（演练/测试），否则取环境变量默认值 */
export async function getFollowerThreshold(): Promise<number> {
  const raw = await redisLib.get(KEYS.fanoutThreshold());
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : config.fanout.followerThreshold;
}

export async function countFollowers(authorId: number): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(socials)
    .where(eq(socials.vlogger_id, authorId));
  return Number(rows[0]?.c ?? 0);
}

/** 游标分批拉粉丝（扇出用），按 follower_id 升序 */
export async function listFollowerIds(authorId: number, cursor: number, limit: number): Promise<number[]> {
  const rows = await db
    .select({ follower_id: socials.follower_id })
    .from(socials)
    .where(and(eq(socials.vlogger_id, authorId), gt(socials.follower_id, cursor)))
    .orderBy(asc(socials.follower_id))
    .limit(limit);
  return rows.map((r) => Number(r.follower_id));
}

async function pushIndexItem(key: string, item: FollowingItem, maxLen: number): Promise<void> {
  await redisLib.zAddTrim(
    key,
    [
      {
        score: followingIndexScore(item.publishedAtMs, item.videoId),
        member: followingIndexMember(item.videoId, item.authorId, item.publishedAtMs),
      },
    ],
    maxLen,
    30 * 24 * 3600,
  );
}

/** 推：普通作者发布，写入一批粉丝的收件箱（ZADD + 修剪 + TTL） */
export async function addInboxItems(userIds: number[], item: FollowingItem, maxLen: number): Promise<void> {
  for (const uid of userIds) {
    if (uid > 0) await pushIndexItem(KEYS.followingInbox(uid), item, maxLen);
  }
}

/** 拉：大V发布只写自己的发件箱，读取侧按关注关系拉取 */
export async function addAuthorOutboxItem(authorId: number, item: FollowingItem, maxLen: number): Promise<void> {
  await pushIndexItem(KEYS.followingAuthorOutbox(authorId), item, maxLen);
}

/**
 * k-way 归并读取：我的收件箱（推） + 关注的大V发件箱（拉）。
 * 每路按分数倒序取一页，跨路去重后按 (publishedAt, videoId) 倒序归并截断；
 * 游标语义与 SQL 的 create_time < before 一致。全部索引为空返回 null（调用方回退 SQL）。
 */
export async function listFollowingIndexPage(
  viewerId: number,
  pullAuthorIds: number[],
  beforeMs: number,
  limit: number,
): Promise<FollowingItem[] | null> {
  const streams = [KEYS.followingInbox(viewerId), ...pullAuthorIds.map((a) => KEYS.followingAuthorOutbox(a))];
  // 略微放大游标上界覆盖同秒条目，精确过滤交给下方 publishedAtMs < beforeMs
  const fetchMax = beforeMs > 0 ? followingIndexScore(beforeMs, 999_999) : null;
  const pullSet = new Set(pullAuthorIds);
  const seen = new Set<number>();
  const collected: FollowingItem[] = [];
  let hasIndex = false;

  for (let i = 0; i < streams.length; i += 1) {
    const key = streams[i];
    if ((await redisLib.zCard(key)) > 0) hasIndex = true;
    const members = await redisLib.zRevRangeByScore(key, fetchMax, null, 0, limit + 5);
    for (const m of members) {
      const item = parseFollowingMember(m);
      if (!item) continue;
      if (beforeMs > 0 && item.publishedAtMs >= beforeMs) continue;
      // 发件箱流校验作者仍是当前关注的大V（取关/降级即时生效）
      if (i > 0 && item.authorId > 0 && !pullSet.has(item.authorId)) continue;
      if (seen.has(item.videoId)) continue;
      seen.add(item.videoId);
      collected.push(item);
    }
  }
  if (!hasIndex) return null;

  collected.sort((a, b) => b.publishedAtMs - a.publishedAtMs || b.videoId - a.videoId);
  return collected.slice(0, limit);
}

/** 取关：把该作者的条目从粉丝收件箱移除（member 自带 authorId，扫一遍即可，收件箱上限 1000） */
export async function removeAuthorFromInbox(userId: number, authorId: number): Promise<void> {
  const key = KEYS.followingInbox(userId);
  const members = await redisLib.zRange(key, 0, -1);
  const toRemove = members.filter((m) => parseFollowingMember(m)?.authorId === authorId);
  if (toRemove.length > 0) await redisLib.zRem(key, toRemove);
}

/** 关注回填：把作者最近作品写入新粉丝收件箱（覆盖关注前的历史；与发件箱重叠由读取侧去重） */
export async function backfillInboxOnFollow(followerId: number, authorId: number): Promise<void> {
  const rows = await db
    .select({ id: videos.id, create_time: videos.create_time })
    .from(videos)
    .where(eq(videos.author_id, authorId))
    .orderBy(desc(videos.create_time), desc(videos.id))
    .limit(50);
  for (const r of rows) {
    await addInboxItems(
      [followerId],
      {
        videoId: Number(r.id),
        authorId,
        publishedAtMs: new Date(r.create_time).getTime(),
      },
      config.fanout.inboxMaxLen,
    );
  }
}
