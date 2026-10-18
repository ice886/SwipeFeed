import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db, transaction, type VideoRow } from '../../lib/db';
import { outboxMsgs, tags, videos, videoTags } from '../../lib/schema';
import { KEYS, localCache } from '../../lib/cache';
import * as redisLib from '../../lib/redis';
import { notFound } from '../../common/errors';

export interface VideoJson {
  id: number;
  author_id: number;
  username: string;
  title: string;
  description?: string;
  play_url: string;
  cover_url: string;
  create_time: string;
  likes_count: number;
  popularity: number;
}

export class VideoService {
  toVideoJson(row: VideoRow): VideoJson {
    const out: VideoJson = {
      id: row.id,
      author_id: row.author_id,
      username: row.username,
      title: row.title,
      play_url: row.play_url,
      cover_url: row.cover_url,
      create_time: new Date(row.create_time).toISOString(),
      likes_count: Number(row.likes_count),
      popularity: Number(row.popularity),
    };
    if (row.description) out.description = row.description;
    return out;
  }

  /** 从标题/描述提取 #话题（支持中英文数字下划线） */
  extractTags(...texts: string[]): string[] {
    const names = new Set<string>();
    for (const text of texts) {
      const re = /#([^\s#]{1,50})/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const name = m[1].replace(/[，。,.!?！？:：;；'"'"]/g, '');
        if (name) names.add(name);
      }
    }
    return [...names];
  }

  /**
   * 发布视频：事务写 videos + outbox_msgs + tags/video_tags。
   * 时间线由 OutboxPoller 异步投递（对应 Go 版 Outbox 模式）。
   */
  async publish(
    authorId: number,
    username: string,
    title: string,
    description: string,
    playUrl: string,
    coverUrl: string,
  ): Promise<VideoJson> {
    const tagNames = this.extractTags(title, description);
    const videoId = await transaction(async (tx) => {
      const [res] = await tx.insert(videos).values({
        author_id: authorId,
        username,
        title,
        description: description || null,
        play_url: playUrl,
        cover_url: coverUrl,
      });
      const id = Number(res.insertId);
      await tx.insert(outboxMsgs).values({ video_id: id, event_type: 'video.timeline.publish', status: 'pending' });
      for (const name of tagNames) {
        await tx
          .insert(tags)
          .values({ name })
          .onDuplicateKeyUpdate({ set: { name: sql`${tags.name}` } });
        const tagRows = await tx.select({ id: tags.id }).from(tags).where(eq(tags.name, name));
        const tagId = Number(tagRows[0]?.id ?? 0);
        if (tagId > 0) {
          await tx
            .insert(videoTags)
            .values({ video_id: id, tag_id: tagId })
            .onDuplicateKeyUpdate({ set: { video_id: sql`${videoTags.video_id}` } });
        }
      }
      return id;
    });

    // 发布影响关注流缓存，主动失效
    await redisLib.delByPattern('feed:listByFollowing:*');
    await redisLib.delByPattern('feed:listLatest:*');

    const rows = await db.select().from(videos).where(eq(videos.id, videoId));
    return this.toVideoJson(rows[0]);
  }

  async listByAuthorID(authorId: number): Promise<VideoJson[]> {
    const rows = await db
      .select()
      .from(videos)
      .where(eq(videos.author_id, authorId))
      .orderBy(desc(videos.create_time), desc(videos.id))
      .limit(200);
    return rows.map((r) => this.toVideoJson(r));
  }

  async getByID(id: number): Promise<VideoRow | null> {
    const rows = await db.select().from(videos).where(eq(videos.id, id));
    return rows[0] ?? null;
  }

  /** 视频详情：Redis 缓存 5 分钟 + SETNX 互斥锁防击穿 */
  async getDetail(id: number): Promise<VideoJson> {
    const cacheKey = KEYS.videoDetail(id);
    const cached = await redisLib.getJSON<VideoJson>(cacheKey);
    if (cached) return cached;

    const lockKey = KEYS.lock(`video:detail:${id}`);
    const gotLock = await redisLib.setNx(lockKey, '1', 2);
    if (!gotLock) {
      // 未抢到锁：短暂等待后读缓存，读不到再回源（保证可用性）
      await new Promise((r) => setTimeout(r, 150));
      const again = await redisLib.getJSON<VideoJson>(cacheKey);
      if (again) return again;
    }

    const row = await this.getByID(id);
    if (!row) throw notFound('video not found');
    const json = this.toVideoJson(row);
    await redisLib.setJSON(cacheKey, json, 300);
    return json;
  }

  /** 批量取视频实体：L1 本地缓存 5s + L2 Redis 1h + L3 MySQL */
  async getEntities(ids: number[]): Promise<Map<number, VideoJson>> {
    const result = new Map<number, VideoJson>();
    const missing: number[] = [];
    for (const id of ids) {
      const l1 = localCache.get<VideoJson>(`video:entity:${id}`);
      if (l1) result.set(id, l1);
      else missing.push(id);
    }
    const fromRedis: number[] = [];
    for (const id of missing) {
      const l2 = await redisLib.getJSON<VideoJson>(KEYS.videoEntity(id));
      if (l2) {
        result.set(id, l2);
        localCache.set(`video:entity:${id}`, l2, 5000);
      } else {
        fromRedis.push(id);
      }
    }
    if (fromRedis.length > 0) {
      const rows = await db.select().from(videos).where(inArray(videos.id, fromRedis));
      for (const row of rows) {
        const json = this.toVideoJson(row);
        result.set(row.id, json);
        localCache.set(`video:entity:${row.id}`, json, 5000);
        void redisLib.setJSON(KEYS.videoEntity(row.id), json, 3600);
      }
    }
    return result;
  }
}

/** 互动导致计数变化时主动失效详情/实体缓存 */
export async function invalidateVideoCache(videoId: number): Promise<void> {
  localCache.del(`video:entity:${videoId}`);
  await redisLib.del(KEYS.videoDetail(videoId), KEYS.videoEntity(videoId));
}

export async function bumpLikesCount(videoId: number, delta: number): Promise<void> {
  await db
    .update(videos)
    .set({ likes_count: sql`GREATEST(${videos.likes_count} + ${delta}, 0)` })
    .where(eq(videos.id, videoId));
  await invalidateVideoCache(videoId);
}

export async function bumpPopularity(videoId: number, delta: number): Promise<void> {
  await db
    .update(videos)
    .set({ popularity: sql`GREATEST(${videos.popularity} + ${delta}, 0)` })
    .where(eq(videos.id, videoId));
  await invalidateVideoCache(videoId);
}
