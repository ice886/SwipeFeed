import type { NextFunction, Request, Response } from 'express';
import { authenticate } from '../common/auth';
import { unauthorized } from '../common/errors';

/** JWT 鉴权：强制登录，失败 401 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const user = await authenticate(req);
  if (!user) {
    next(unauthorized('invalid or expired token'));
    return;
  }
  req.user = user;
  next();
}
