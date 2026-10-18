import Redis from 'ioredis';
import { config } from '../config';

/**
 * Redis 客户端（可选依赖）：
 * 连接失败不阻塞业务，所有 helper 吞掉错误并返回空值，
 * 对应 Go 版"Redis 不可用自动降级 MySQL/直写"的容灾语义。
 */
export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  db: config.redis.db,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: (times) => Math.min(times * 500, 5000),
});

let ready = false;
let warned = false;

redis.on('ready', () => {
  ready = true;
  warned = false;
  // eslint-disable-next-line no-console
  console.log('[redis] connected');
});

redis.on('error', (err: Error) => {
  ready = false;
  if (!warned) {
    warned = true;
    // eslint-disable-next-line no-console
    console.warn(`[redis] unavailable, degrade to direct writes: ${err.message}`);
  }
});

export function redisAvailable(): boolean {
  return ready;
}

export async function getJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setJSON(key: string, value: unknown, ttlSec?: number): Promise<void> {
  try {
    const raw = JSON.stringify(value);
    if (ttlSec && ttlSec > 0) await redis.set(key, raw, 'EX', ttlSec);
    else await redis.set(key, raw);
  } catch {
    /* 降级：忽略 */
  }
}

export async function del(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch {
    /* 降级 */
  }
}

export async function get(key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

export async function set(key: string, value: string, ttlSec?: number): Promise<void> {
  try {
    if (ttlSec && ttlSec > 0) await redis.set(key, value, 'EX', ttlSec);
    else await redis.set(key, value);
  } catch {
    /* 降级 */
  }
}

/** SET NX EX：分布式锁/防击穿 */
export async function setNx(key: string, value: string, ttlSec: number): Promise<boolean> {
  try {
    const res = await redis.set(key, value, 'EX', ttlSec, 'NX');
    return res === 'OK';
  } catch {
    return false;
  }
}

/** 按前缀删除缓存（SCAN，不阻塞 Redis） */
export async function delByPattern(pattern: string): Promise<void> {
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
  } catch {
    /* 降级 */
  }
}

const INCR_WITH_EXPIRE = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return current
`;

/** 滑动窗口限流：INCR + PEXPIRE 原子脚本，返回当前窗口计数 */
export async function incrWithExpire(key: string, windowMs: number): Promise<number> {
  try {
    const res = await redis.eval(INCR_WITH_EXPIRE, 1, key, String(windowMs));
    return Number(res);
  } catch {
    return 0; // Redis 不可用时限流放行
  }
}

// ---------------------------------------------------------------------------
// ZSET 封装（Feed 时间线 / 热榜）
// ---------------------------------------------------------------------------

export async function zAdd(key: string, members: Array<{ score: number; member: string }>): Promise<void> {
  if (members.length === 0) return;
  try {
    const args: (string | number)[] = [];
    for (const m of members) args.push(m.score, m.member);
    await redis.zadd(key, ...args);
  } catch {
    /* 降级 */
  }
}

export async function zIncrBy(key: string, member: string, delta: number): Promise<void> {
  try {
    await redis.zincrby(key, delta, member);
  } catch {
    /* 降级 */
  }
}

/** 按分数区间倒序取 member，maxScoreExclusive 传 null 表示 +inf */
export async function zRevRangeByScore(
  key: string,
  maxScore: number | null,
  minScore: number | null,
  offset: number,
  count: number,
): Promise<string[]> {
  try {
    const max = maxScore === null ? '+inf' : `(${maxScore}`;
    const min = minScore === null ? '-inf' : String(minScore);
    return await redis.zrevrangebyscore(key, max, min, 'LIMIT', offset, count);
  } catch {
    return [];
  }
}

export async function zRevRange(key: string, start: number, stop: number): Promise<string[]> {
  try {
    return await redis.zrevrange(key, start, stop);
  } catch {
    return [];
  }
}

export async function zCard(key: string): Promise<number> {
  try {
    return await redis.zcard(key);
  } catch {
    return 0;
  }
}

export async function zRemRangeByRank(key: string, start: number, stop: number): Promise<void> {
  try {
    await redis.zremrangebyrank(key, start, stop);
  } catch {
    /* 降级 */
  }
}

/** ZADD + 按排名修剪 + TTL 一条管线完成（收件箱/发件箱写入用） */
export async function zAddTrim(
  key: string,
  members: Array<{ score: number; member: string }>,
  maxLen: number,
  ttlSec: number,
): Promise<void> {
  if (members.length === 0) return;
  try {
    const pipe = redis.pipeline();
    for (const m of members) pipe.zadd(key, String(m.score), m.member);
    if (maxLen > 0) pipe.zremrangebyrank(key, 0, -maxLen - 1);
    if (ttlSec > 0) pipe.expire(key, ttlSec);
    await pipe.exec();
  } catch {
    /* 降级 */
  }
}

export async function zRange(key: string, start: number, stop: number): Promise<string[]> {
  try {
    return await redis.zrange(key, String(start), String(stop));
  } catch {
    return [];
  }
}

export async function zRem(key: string, members: string[]): Promise<void> {
  if (members.length === 0) return;
  try {
    await redis.zrem(key, ...members);
  } catch {
    /* 降级 */
  }
}

export async function zUnionStore(
  dest: string,
  keys: string[],
  ttlSec?: number,
): Promise<number> {
  try {
    const res = await redis.zunionstore(dest, keys.length, ...keys);
    if (ttlSec && ttlSec > 0) await redis.expire(dest, ttlSec);
    return Number(res);
  } catch {
    return 0;
  }
}

export async function exists(key: string): Promise<boolean> {
  try {
    return (await redis.exists(key)) === 1;
  } catch {
    return false;
  }
}

export async function expire(key: string, ttlSec: number): Promise<void> {
  try {
    await redis.expire(key, ttlSec);
  } catch {
    /* 降级 */
  }
}
