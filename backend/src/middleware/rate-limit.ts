import type { NextFunction, Request, Response } from 'express';
import { KEYS } from '../lib/cache';
import { incrWithExpire } from '../lib/redis';
import { tooManyRequests } from '../common/errors';

/**
 * Redis 滑动窗口限流（INCR + PEXPIRE 原子脚本）。
 * Redis 不可用时放行（降级），限流维度：IP 或账号。
 * 用法：router.post('/login', rateLimit('login', 10, 60_000, 'ip'), handler)
 */
export function rateLimit(
  scope: string,
  limit: number,
  windowMs: number,
  by: 'ip' | 'account' = 'ip',
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    let subject: string;
    if (by === 'account') {
      subject = req.user ? String(req.user.accountId) : '';
      if (!subject) {
        next(); // 未登录交给鉴权中间件处理
        return;
      }
    } else {
      subject = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
    }
    const key = KEYS.rateLimit(scope, subject);
    const count = await incrWithExpire(key, windowMs);
    if (count > limit) {
      next(tooManyRequests('too many requests'));
      return;
    }
    next();
  };
}
