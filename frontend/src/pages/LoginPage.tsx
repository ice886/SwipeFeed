import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as accountApi from '../api/account';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import { useToast } from '../components/Toast';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoggedIn } = useAuth();
  const { error, success } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const errs: { username?: string; password?: string } = {};
    if (!username.trim()) errs.username = '请输入用户名';
    else if (username.trim().length < 2) errs.username = '用户名至少 2 个字符';
    if (!password) errs.password = '请输入密码';
    else if (password.length < 6) errs.password = '密码至少 6 位';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await accountApi.login({ username: username.trim(), password });
      login(res);
      success(`欢迎回来，${res.username}`);
      navigate('/', { replace: true });
    } catch (err) {
      error(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoggedIn) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 pt-16">
        <p className="text-zinc-400">你已登录</p>
        <Link to="/" className="rounded-full bg-rose-500 px-6 py-2 text-sm font-medium text-white hover:bg-rose-400">
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 pt-16">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-rose-500/15 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="animate-fade-in-up relative w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl shadow-black/40 backdrop-blur"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-400 text-2xl font-black text-white">
            F
          </div>
          <h1 className="text-2xl font-bold text-white">欢迎回来</h1>
          <p className="mt-1 text-sm text-zinc-500">登录后即可点赞、关注与发布视频</p>
        </div>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm text-zinc-400">用户名</span>
          <input
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setFieldErrors((p) => ({ ...p, username: undefined }));
            }}
            placeholder="请输入用户名"
            autoComplete="username"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-rose-500/70"
          />
          {fieldErrors.username && <span className="mt-1 block text-xs text-rose-400">{fieldErrors.username}</span>}
        </label>

        <label className="mb-6 block">
          <span className="mb-1.5 block text-sm text-zinc-400">密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldErrors((p) => ({ ...p, password: undefined }));
            }}
            placeholder="请输入密码"
            autoComplete="current-password"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-rose-500/70"
          />
          {fieldErrors.password && <span className="mt-1 block text-xs text-rose-400">{fieldErrors.password}</span>}
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:opacity-90 disabled:opacity-60"
        >
          {submitting && <Spinner size={16} />}
          登录
        </button>

        <p className="mt-6 text-center text-sm text-zinc-500">
          还没有账号？
          <Link to="/register" className="ml-1 font-medium text-rose-400 hover:text-rose-300 hover:underline">
            立即注册
          </Link>
        </p>
      </form>
    </div>
  );
}
