import type { NextFunction, Request, Response } from 'express';
import { authenticate, extractBearer } from '../common/auth';
import { unauthorized } from '../common/errors';

/**
 * 软鉴权：可匿名访问；但带了 token 必须合法（否则 401），
 * 用于 Feed 浏览等"匿名可看、登录个性化"的场景。
 */
export async function softAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!extractBearer(req)) {
    next();
    return;
  }
  const user = await authenticate(req);
  if (!user) {
    next(unauthorized('invalid or expired token'));
    return;
  }
  req.user = user;
  next();
}
