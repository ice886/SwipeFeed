/** L1 本地缓存（视频实体 5s）+ 统一 Key 规则（与 Go 版保持一致） */

interface Entry {
  value: unknown;
  expireAt: number;
}

class LocalCache {
  private store = new Map<string, Entry>();

  get<T>(key: string): T | null {
    const e = this.store.get(key);
    if (!e) return null;
    if (Date.now() > e.expireAt) {
      this.store.delete(key);
      return null;
    }
    return e.value as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    if (this.store.size > 5000) {
      const now = Date.now();
      for (const [k, v] of this.store) {
        if (now > v.expireAt) this.store.delete(k);
      }
    }
    this.store.set(key, { value, expireAt: Date.now() + ttlMs });
  }

  del(prefix: string): void {
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }
}

export const localCache = new LocalCache();

export const KEYS = {
  accountToken: (id: number) => `account:${id}`,
  accountRefresh: (id: number) => `account:${id}:refresh`,
  refreshToAccount: (token: string) => `refresh:${token}`,
  chunkSession: (uploadId: string) => `chunk_upload:${uploadId}`,
  chunkHashIndex: (accountId: number, fileHash: string) =>
    `chunk_upload_hash:${accountId}:${fileHash}`,
  feedGlobalTimeline: () => 'feed:global_timeline',
  feedListLatest: (limit: number, before: number) =>
    `feed:listLatest:limit=${limit}:before=${before}`,
  feedListFollowing: (limit: number, accountId: number, before: number) =>
    `feed:listByFollowing:limit=${limit}:accountID=${accountId}:before=${before}`,
  feedListFollowingPattern: (accountId: number) =>
    `feed:listByFollowing:limit=*:accountID=${accountId}:*`,
  videoEntity: (id: number) => `video:entity:${id}`,
  videoDetail: (id: number) => `video:detail:id=${id}`,
  hotWindow: (minute: string) => `hot:video:1m:${minute}`,
  hotSnapshot: (asOf: string) => `hot:video:merge:1m:${asOf}`,
  rateLimit: (scope: string, subject: string) => `feedsystem:ratelimit:${scope}:${subject}`,
  lock: (name: string) => `lock:${name}`,
  /** 关注流推拉结合索引（对齐 GCFeed） */
  followingInbox: (accountId: number) => `feed:following:inbox:v1:${accountId}`,
  followingAuthorOutbox: (authorId: number) => `feed:following:author:v1:${authorId}`,
  /** 大V阈值运行时覆盖（演练/测试用，优先于环境变量） */
  fanoutThreshold: () => 'config:fanout_threshold',
};

/** 分钟桶 yyyyMMddHHmm（热榜滚动窗口） */
export function minuteBucket(ts = Date.now()): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
}
