import { badRequest } from './errors';

type Body = Record<string, unknown>;

export function requireString(body: Body, field: string, maxLen = 255): string {
  const v = body?.[field];
  if (typeof v !== 'string' || v.trim() === '') throw badRequest(`${field} is required`);
  const s = v.trim();
  if (s.length > maxLen) throw badRequest(`${field} is too long`);
  return s;
}

export function optionalString(body: Body, field: string, maxLen = 255): string {
  const v = body?.[field];
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string') throw badRequest(`${field} must be a string`);
  const s = v.trim();
  if (s.length > maxLen) throw badRequest(`${field} is too long`);
  return s;
}

export function requireNumber(body: Body, field: string): number {
  const v = body?.[field];
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    throw badRequest(`${field} is required`);
  }
  return Math.floor(n);
}

/** 非负整数（允许 0，如分片下标） */
export function requireNonNegative(body: Body, field: string): number {
  const v = body?.[field];
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
    throw badRequest(`${field} is required`);
  }
  return Math.floor(n);
}

export function optionalNumber(body: Body, field: string, def = 0): number {
  const v = body?.[field];
  if (v === undefined || v === null || v === '') return def;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw badRequest(`${field} must be a number`);
  return Math.floor(n);
}

/** 可空数字游标（允许 0 表示"未指定"，用于分页游标） */
export function optionalCursorNumber(body: Body, field: string): number | null {
  const v = body?.[field];
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw badRequest(`${field} must be a number`);
  return Math.floor(n);
}

export function requireLimit(body: Body, def = 10, max = 50): number {
  const n = optionalNumber(body, 'limit', def);
  if (n <= 0) return def;
  return Math.min(n, max);
}
