/** 统一业务错误：抛出后由全局过滤器转成 {"error": message} 响应 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message = 'bad request') => new AppError(400, message);
export const unauthorized = (message = 'unauthorized') => new AppError(401, message);
export const forbidden = (message = 'forbidden') => new AppError(403, message);
export const notFound = (message = 'not found') => new AppError(404, message);
export const conflict = (message = 'conflict') => new AppError(409, message);
export const tooManyRequests = (message = 'too many requests') => new AppError(429, message);
export const internal = (message = 'internal server error') => new AppError(500, message);
