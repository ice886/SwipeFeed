import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { AppError } from './errors';

/** 未匹配路由：404 */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'not found' });
}

/**
 * 统一错误响应：{"error": message}，与 Go 版接口契约一致。
 * AppError → 业务状态码；Multer/JSON 解析等带状态码的错误 → 4xx；其余 → 500。
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof MulterError) {
    res.status(400).json({ error: err.message });
    return;
  }

  // body-parser 等框架错误自带 4xx 状态码（如 JSON 语法错误）
  const raw = err as { status?: unknown; statusCode?: unknown; message?: unknown };
  const status = typeof raw?.status === 'number' ? raw.status : raw?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ error: err instanceof Error ? err.message : 'bad request' });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(
    `[http] unhandled error: ${message}`,
    err instanceof Error ? err.stack : '',
  );
  res.status(500).json({ error: 'internal server error' });
}
