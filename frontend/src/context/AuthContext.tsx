import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as accountApi from '../api/account';
import {
  clearAuth,
  getAccountId,
  getAccessToken,
  getUsername,
  saveAuth,
  updateTokenAndUsername,
} from '../api/client';
import { resetFollowingStore } from '../hooks/useFollow';

export interface AuthState {
  isLoggedIn: boolean;
  token: string | null;
  accountId: number | null;
  username: string | null;
}

export interface AuthContextValue extends AuthState {
  /** 登录成功后写入本地状态 */
  login: (data: { token: string; refresh_token: string; account_id: number; username: string }) => void;
  /** 调用后端 logout 并清空本地状态 */
  logout: () => Promise<void>;
  /** 改名后更新本地 token 与 username */
  applyRename: (token: string, username: string) => void;
  /** 仅清空本地状态（改密后强制登出等场景） */
  clear: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readState(): AuthState {
  return {
    isLoggedIn: Boolean(getAccessToken()),
    token: getAccessToken(),
    accountId: getAccountId(),
    username: getUsername(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(readState);

  const login = useCallback((data: { token: string; refresh_token: string; account_id: number; username: string }) => {
    saveAuth(data);
    resetFollowingStore();
    setState(readState());
  }, []);

  const clear = useCallback(() => {
    clearAuth();
    resetFollowingStore();
    setState(readState());
  }, []);

  const logout = useCallback(async () => {
    try {
      await accountApi.logout();
    } catch {
      // 即使后端登出失败也继续清本地
    }
    clear();
  }, [clear]);

  const applyRename = useCallback((token: string, username: string) => {
    updateTokenAndUsername(token, username);
    setState(readState());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, applyRename, clear }),
    [state, login, logout, applyRename, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
