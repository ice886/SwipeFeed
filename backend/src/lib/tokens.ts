import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';

export interface JwtClaims {
  account_id: number;
  username: string;
}

export function signAccessToken(claims: JwtClaims): string {
  return jwt.sign({ account_id: claims.account_id, username: claims.username }, config.jwt.secret, {
    expiresIn: config.jwt.accessTtlSec,
  });
}

export function verifyAccessToken(token: string): JwtClaims | null {
  try {
    const payload = jwt.verify(token, config.jwt.secret) as jwt.JwtPayload;
    const account_id = Number(payload.account_id);
    const username = String(payload.username ?? '');
    if (!Number.isFinite(account_id) || account_id <= 0) return null;
    return { account_id, username };
  } catch {
    return null;
  }
}

/** Refresh Token：32 字节随机串，服务端（DB + Redis）可随时撤销 */
export function newRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function newUploadId(): string {
  return crypto.randomBytes(16).toString('hex');
}
