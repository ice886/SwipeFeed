import type { Request } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { accounts } from '../lib/schema';
import { KEYS } from '../lib/cache';
import * as redisLib from '../lib/redis';
import { verifyAccessToken, type JwtClaims } from '../lib/tokens';

export interface AuthUser {
  accountId: number;
  username: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  // SSE 场景允许 query token（EventSource 无法自定义请求头）
  const q = (req.query as Record<string, unknown>)?.token;
  if (typeof q === 'string' && q.trim() !== '') return q.trim();
  return null;
}

/**
 * token 撤销检查（鉴权缓存自愈机制）：
 * 1. 优先查 Redis account:<id> 是否等于当前 token；
 * 2. Redis 未命中回退 MySQL 校验 accounts.token；
 * 3. MySQL 通过后回填 Redis。
 */
export async function checkTokenActive(claims: JwtClaims, token: string): Promise<boolean> {
  const key = KEYS.accountToken(claims.account_id);
  const cached = await redisLib.get(key);
  if (cached !== null) return cached === token;

  try {
    const rows = await db
      .select({ token: accounts.token })
      .from(accounts)
      .where(eq(accounts.id, claims.account_id));
    const dbToken = rows[0]?.token ?? '';
    const ok = dbToken !== '' && dbToken === token;
    if (ok) await redisLib.set(key, token, 24 * 3600);
    return ok;
  } catch {
    return false;
  }
}

/** 鉴权入口：解析 + 验签 + 撤销检查 */
export async function authenticate(req: Request): Promise<AuthUser | null> {
  const token = extractBearer(req);
  if (!token) return null;
  const claims = verifyAccessToken(token);
  if (!claims) return null;
  const ok = await checkTokenActive(claims, token);
  if (!ok) return null;
  return { accountId: claims.account_id, username: claims.username };
}
