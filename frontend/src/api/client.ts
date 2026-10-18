// 轻量 fetch 封装：统一鉴权、401 自动刷新、错误解析、带进度的 multipart 上传。
import type { LoginResponse, RefreshResponse } from '../types';

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const ACCOUNT_ID_KEY = 'account_id';
const USERNAME_KEY = 'username';

// ---------- token 存取 ----------

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getAccountId(): number | null {
  const raw = localStorage.getItem(ACCOUNT_ID_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function isLoggedIn(): boolean {
  return Boolean(getAccessToken());
}

export function saveAuth(data: {
  token: string;
  refresh_token?: string;
  account_id: number | string;
  username: string;
}): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, data.token);
  if (data.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
  localStorage.setItem(ACCOUNT_ID_KEY, String(data.account_id));
  localStorage.setItem(USERNAME_KEY, data.username);
}

/** 改名后只更新 access_token 与 username，保留 refresh_token。 */
export function updateTokenAndUsername(token: string, username: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearAuth(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(ACCOUNT_ID_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

// ---------- 静态资源 URL ----------

/** 把后端返回的 /static/... 相对路径映射到开发代理 /api/static/... */
export function assetUrl(url?: string | null): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  return url.replace(/^\/static/, `${API_BASE}/static`);
}

// ---------- 核心请求 ----------

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `请求失败（${res.status}）`;
    throw new Error(msg);
  }
  return data as T;
}

async function tryRefresh(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/account/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as RefreshResponse;
    if (!data?.token) return false;
    saveAuth({
      token: data.token,
      account_id: data.account_id,
      username: data.username,
    });
    return true;
  } catch {
    return false;
  }
}

function redirectToLogin(): void {
  clearAuth();
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

export interface RequestOptions {
  method?: 'POST' | 'GET';
  /** 附带 Authorization 头（默认：有 token 就带上） */
  auth?: boolean;
  signal?: AbortSignal;
}

/**
 * POST JSON 业务请求。401 时自动用 refresh_token 换新 token 并重试一次。
 * 错误统一解析 {"error": msg} 并抛出 Error(msg)。
 */
export async function request<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'POST';
  const doFetch = (): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getAccessToken();
    if (token && options.auth !== false) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      signal: options.signal,
    });
  };

  let res = await doFetch();
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch();
    } else {
      redirectToLogin();
      throw new Error('登录已过期，请重新登录');
    }
  }
  return parseResponse<T>(res);
}

/** multipart 上传（带进度），走 XMLHttpRequest 以便拿到 upload 进度事件。 */
export function uploadForm<T>(
  path: string,
  form: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}${path}`);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e: ProgressEvent) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      let data: unknown = null;
      if (xhr.responseText) {
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          data = null;
        }
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
      } else if (xhr.status === 401) {
        redirectToLogin();
        reject(new Error('登录已过期，请重新登录'));
      } else {
        const msg =
          data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : `上传失败（${xhr.status}）`;
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('网络错误，上传失败'));
    xhr.ontimeout = () => reject(new Error('上传超时'));
    xhr.send(form);
  });
}

// 便捷封装
export const api = {
  post: <T>(path: string, body?: unknown) => request<T>(path, body),
};

export type { LoginResponse };
