import { and, desc, eq, inArray, lt, notInArray, sql, type SQL } from 'drizzle-orm';
import { db, type VideoRow } from '../../lib/db';
import { likes as likesTable, socials, tags, videos, videoTags } from '../../lib/schema';
import { KEYS, minuteBucket } from '../../lib/cache';
import * as redisLib from '../../lib/redis';
import * as fanoutLib from '../../lib/fanout';
import { VideoService, type VideoJson } from '../video/video.service';

export interface FeedAuthor {
  id: number;
  username: string;
}

export interface FeedVideoItem {
  id: number;
  author: FeedAuthor;
  title: string;
  description?: string;
  play_url: string;
  cover_url: string;
  create_time: number; // 毫秒时间戳
  likes_count: number;
  is_liked: boolean;
}

interface ListLatestResult {
  video_list: FeedVideoItem[];
  next_time: number;
  has_more: boolean;
}

export class FeedService {
  constructor(private readonly videoService: VideoService) {}

  /** 视频行 → Feed 条目（含 is_liked 个性化） */
  async buildFeedVideos(rows: VideoJson[], viewerAccountId: number | null): Promise<FeedVideoItem[]> {
    const liked = await this.likedSet(
      viewerAccountId,
      rows.map((r) => r.id),
    );
    return rows.map((r) => {
      const item: FeedVideoItem = {
        id: r.id,
        author: { id: r.author_id, username: r.username },
        title: r.title,
        play_url: r.play_url,
        cover_url: r.cover_url,
        create_time: new Date(r.create_time).getTime(),
        likes_count: r.likes_count,
        is_liked: liked.has(r.id),
      };
      if (r.description) item.description = r.description;
      return item;
    });
  }

  private async likedSet(viewerAccountId: number | null, videoIds: number[]): Promise<Set<number>> {
    const liked = new Set<number>();
    if (!viewerAccountId || videoIds.length === 0) return liked;
    const rows = await db
      .select({ video_id: likesTable.video_id })
      .from(likesTable)
      .where(and(eq(likesTable.account_id, viewerAccountId), inArray(likesTable.video_id, videoIds)));
    for (const r of rows) liked.add(Number(r.video_id));
    return liked;
  }

  /** 按 ID 序还原 Feed 条目（保持排序稳定） */
  private async buildOrdered(
    ordered: Array<{ id: number; create_time: Date | string | number; likes_count?: number }>,
    viewerAccountId: number | null,
  ): Promise<FeedVideoItem[]> {
    const ids = ordered.map((o) => o.id);
    const entities = await this.videoService.getEntities(ids);
    const rows: VideoJson[] = [];
    for (const o of ordered) {
      const e = entities.get(o.id);
      if (e) rows.push(e);
    }
    return this.buildFeedVideos(rows, viewerAccountId);
  }

  // -------------------------------------------------------------------------
  // listLatest：冷热分离 + 游标分页
  // -------------------------------------------------------------------------

  async listLatest(
    limit: number,
    latestTime: number,
    viewerAccountId: number | null,
    anonymous: boolean,
  ) {
    const cacheKey = KEYS.feedListLatest(limit, latestTime);
    if (anonymous) {
      const cached = await redisLib.getJSON<ListLatestResult>(cacheKey);
      if (cached) return cached;
    }

    const maxScore = latestTime > 0 ? latestTime : null;
    const timelineKey = KEYS.feedGlobalTimeline();

    // 热数据：Redis ZSET feed:global_timeline（保留最近约 1000 条）
    let hotIds: string[] = [];
    if (await redisLib.redisAvailable()) {
      await this.backfillTimelineIfEmpty(timelineKey);
      hotIds = await redisLib.zRevRangeByScore(timelineKey, maxScore, null, 0, limit);
    }

    const items: Array<{ id: number; create_time: Date | string | number }> = hotIds.map((sid) => ({
      id: Number(sid),
      create_time: 0, // 占位，稍后按实体时间排序
    }));

    // 冷数据：ZSET 未覆盖的回源 MySQL（不回写 ZSET，防止冷数据污染热点时间线）
    if (items.length < limit) {
      const hotIdNums = hotIds.map(Number);
      const conditions: SQL[] = [];
      if (maxScore !== null) conditions.push(lt(videos.create_time, new Date(maxScore)));
      if (hotIdNums.length > 0) conditions.push(notInArray(videos.id, hotIdNums));
      const rows = await db
        .select()
        .from(videos)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(videos.create_time), desc(videos.id))
        .limit(limit - items.length);
      for (const r of rows) items.push({ id: r.id, create_time: r.create_time });
    }

    // 用实体时间排序合并结果（热数据可能与冷数据时间交织）
    const entities = await this.videoService.getEntities(items.map((i) => i.id));
    const merged = items
      .map((i) => {
        const e = entities.get(i.id);
        return e ? { id: i.id, create_time: new Date(e.create_time).getTime() } : null;
      })
      .filter((x): x is { id: number; create_time: number } => x !== null)
      .sort((a, b) => b.create_time - a.create_time)
      .slice(0, limit);

    const videoList = await this.buildOrdered(merged, viewerAccountId);
    const nextTime = merged.length > 0 ? merged[merged.length - 1].create_time : 0;
    const hasMore = merged.length >= limit;

    // 匿名流短 TTL 缓存（登录态不缓存，保证个性化 is_liked 准确）
    const result: ListLatestResult = { video_list: videoList, next_time: nextTime, has_more: hasMore };
    if (anonymous) await redisLib.setJSON(cacheKey, result, 30);
    return result;
  }

  /** ZSET 为空时从 MySQL 回填最近 1000 条（互斥锁防并发回填） */
  private async backfillTimelineIfEmpty(key: string): Promise<void> {
    const card = await redisLib.zCard(key);
    if (card > 0) return;
    const gotLock = await redisLib.setNx(KEYS.lock('feed:global_timeline:backfill'), '1', 3);
    if (!gotLock) return;
    const rows = await db
      .select({ id: videos.id, create_time: videos.create_time })
      .from(videos)
      .orderBy(desc(videos.create_time), desc(videos.id))
      .limit(1000);
    await redisLib.zAdd(
      key,
      rows.map((r) => ({ score: new Date(r.create_time).getTime(), member: String(r.id) })),
    );
    await redisLib.zRemRangeByRank(key, 0, -1001);
  }

  // -------------------------------------------------------------------------
  // listLikesCount：likes_count + id 复合游标
  // -------------------------------------------------------------------------

  async listLikesCount(
    limit: number,
    likesCountBefore: number | null,
    idBefore: number | null,
    viewerAccountId: number | null,
  ) {
    let condition: SQL | undefined;
    if (likesCountBefore !== null && idBefore !== null) {
      condition = sql`(${videos.likes_count}, ${videos.id}) < (${likesCountBefore}, ${idBefore})`;
    }
    const rows = await db
      .select()
      .from(videos)
      .where(condition)
      .orderBy(desc(videos.likes_count), desc(videos.id))
      .limit(limit);
    const videoList = await this.buildFeedVideos(
      rows.map((r) => this.videoService.toVideoJson(r)),
      viewerAccountId,
    );
    const last = rows[rows.length - 1];
    return {
      video_list: videoList,
      next_likes_count_before: last ? Number(last.likes_count) : undefined,
      next_id_before: last ? last.id : undefined,
      has_more: rows.length >= limit,
    };
  }

  // -------------------------------------------------------------------------
  // listByPopularity：Redis 分钟窗 ZUNIONSTORE 快照 + offset 稳定分页
  // -------------------------------------------------------------------------

  async listByPopularity(
    limit: number,
    asOf: number,
    offset: number,
    fallbackCursor: {
      latest_popularity: number | null;
      latest_before: string | number | null;
      latest_id_before: number | null;
    },
    viewerAccountId: number | null,
  ) {
    const nowMinute = Math.floor(Date.now() / 60000) * 60000;
    const asOfMs = asOf > 0 ? asOf : nowMinute;

    if (await redisLib.redisAvailable()) {
      const snapshotKey = KEYS.hotSnapshot(minuteBucket(asOfMs));
      if (!(await redisLib.exists(snapshotKey))) {
        // 合并最近 60 个分钟窗生成快照（2 分钟 TTL，同 as_of 分页复用）
        const windows: string[] = [];
        for (let i = 0; i < 60; i++) {
          windows.push(KEYS.hotWindow(minuteBucket(asOfMs - i * 60000)));
        }
        await redisLib.zUnionStore(snapshotKey, windows, 120);
      }
      const members = await redisLib.zRevRange(snapshotKey, offset, offset + limit - 1);
      if (members.length > 0) {
        const ids = members.map(Number);
        const videoList = await this.buildOrdered(
          ids.map((id) => ({ id, create_time: 0 })),
          viewerAccountId,
        );
        return {
          video_list: videoList,
          as_of: asOfMs,
          next_offset: offset + members.length,
          has_more: members.length >= limit,
        };
      }
    }

    // Redis 不可用 / 快照为空：回退 MySQL 复合游标 (popularity, create_time, id)
    let condition: SQL | undefined;
    const { latest_popularity, latest_before, latest_id_before } = fallbackCursor;
    if (latest_popularity !== null && latest_before !== null && latest_id_before !== null) {
      condition = sql`(${videos.popularity}, ${videos.create_time}, ${videos.id}) < (${latest_popularity}, ${new Date(latest_before)}, ${latest_id_before})`;
    }
    const rows = await db
      .select()
      .from(videos)
      .where(condition)
      .orderBy(desc(videos.popularity), desc(videos.create_time), desc(videos.id))
      .limit(limit);
    const videoList = await this.buildFeedVideos(
      rows.map((r) => this.videoService.toVideoJson(r)),
      viewerAccountId,
    );
    const last = rows[rows.length - 1];
    return {
      video_list: videoList,
      as_of: asOfMs,
      next_offset: offset + rows.length,
      has_more: rows.length >= limit,
      next_latest_popularity: last ? Number(last.popularity) : undefined,
      next_latest_before: last ? new Date(last.create_time).toISOString() : undefined,
      next_latest_id_before: last ? last.id : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // listByFollowing：推拉结合关注流（收件箱推 + 大V发件箱拉 + k-way 归并）+ 短缓存
  // -------------------------------------------------------------------------

  async listByFollowing(limit: number, latestTime: number, accountId: number) {
    const before = latestTime > 0 ? latestTime : Date.now();
    const cacheKey = KEYS.feedListFollowing(limit, accountId, before);
    const cached = await redisLib.getJSON<{
      video_list: FeedVideoItem[];
      next_time: number;
      has_more: boolean;
    }>(cacheKey);
    if (cached) return cached;

    const gotLock = await redisLib.setNx(KEYS.lock(cacheKey), '1', 2);
    if (!gotLock) {
      await new Promise((r) => setTimeout(r, 120));
      const again = await redisLib.getJSON<{
        video_list: FeedVideoItem[];
        next_time: number;
        has_more: boolean;
      }>(cacheKey);
      if (again) return again;
    }

    // 推拉结合优先；索引缺失（冷启动/Redis 不可用）回退纯拉 SQL JOIN
    const merged = await this.listFollowingViaIndex(limit, before, accountId);
    let videoList: FeedVideoItem[];
    let nextTime: number;
    let hasMore: boolean;
    if (merged) {
      ({ videoList, nextTime, hasMore } = merged);
    } else {
      const joined = await db
        .select()
        .from(videos)
        .innerJoin(socials, eq(socials.vlogger_id, videos.author_id))
        .where(and(eq(socials.follower_id, accountId), lt(videos.create_time, new Date(before))))
        .orderBy(desc(videos.create_time), desc(videos.id))
        .limit(limit);
      const rows: VideoRow[] = joined.map((r) => r.videos);
      videoList = await this.buildFeedVideos(
        rows.map((r) => this.videoService.toVideoJson(r)),
        accountId,
      );
      const last = rows[rows.length - 1];
      nextTime = last ? new Date(last.create_time).getTime() : before;
      hasMore = rows.length >= limit;
    }

    const result = { video_list: videoList, next_time: nextTime, has_more: hasMore };
    // 短 TTL 缓存（关注/发布会主动失效对应前缀）
    await redisLib.setJSON(cacheKey, result, 60);
    return result;
  }

  /** 我的收件箱（推） + 关注的大V发件箱（拉） 归并；null 表示索引缺失需回退 SQL */
  private async listFollowingViaIndex(
    limit: number,
    before: number,
    accountId: number,
  ): Promise<{ videoList: FeedVideoItem[]; nextTime: number; hasMore: boolean } | null> {
    if (!(await redisLib.redisAvailable())) return null;
    const pullAuthorIds = await this.listFollowingPullAuthorIds(accountId);
    const items = await fanoutLib.listFollowingIndexPage(accountId, pullAuthorIds, before, limit);
    if (items === null) return null;
    if (items.length === 0) return { videoList: [], nextTime: before, hasMore: false };

    const entities = await this.videoService.getEntities(items.map((i) => i.videoId));
    const jsons: VideoJson[] = [];
    for (const it of items) {
      const e = entities.get(it.videoId);
      if (e) jsons.push(e);
    }
    const videoList = await this.buildFeedVideos(jsons, accountId);
    const last = items[items.length - 1];
    return { videoList, nextTime: last.publishedAtMs, hasMore: items.length >= limit };
  }

  /** 关注列表里的大V（粉丝数 ≥ 阈值）：他们的作品走读扩散拉取 */
  private async listFollowingPullAuthorIds(accountId: number): Promise<number[]> {
    const rows = await db
      .select({ vlogger_id: socials.vlogger_id, c: sql<number>`COUNT(*)` })
      .from(socials)
      .where(
        sql`${socials.vlogger_id} IN (SELECT vlogger_id FROM socials WHERE follower_id = ${accountId})`,
      )
      .groupBy(socials.vlogger_id);
    const threshold = await fanoutLib.getFollowerThreshold();
    return rows.filter((r) => Number(r.c) >= threshold).map((r) => Number(r.vlogger_id));
  }

  // -------------------------------------------------------------------------
  // listByTag：按 #话题 浏览
  // -------------------------------------------------------------------------

  async listByTag(tagName: string, limit: number, viewerAccountId: number | null) {
    const joined = await db
      .select()
      .from(videos)
      .innerJoin(videoTags, eq(videoTags.video_id, videos.id))
      .innerJoin(tags, eq(tags.id, videoTags.tag_id))
      .where(eq(tags.name, tagName))
      .orderBy(desc(videos.create_time), desc(videos.id))
      .limit(limit);
    const video_list = await this.buildFeedVideos(
      joined.map((r) => this.videoService.toVideoJson(r.videos)),
      viewerAccountId,
    );
    return { video_list };
  }
}
