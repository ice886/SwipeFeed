import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import * as accountApi from '../api/account';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import Spinner from '../components/Spinner';
import { useToast } from '../components/Toast';

function Section({
  title,
  description,
  children,
  accent = 'rose',
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  accent?: 'rose' | 'cyan' | 'amber' | 'zinc';
}) {
  const accentBar =
    accent === 'rose'
      ? 'bg-rose-500'
      : accent === 'cyan'
        ? 'bg-cyan-500'
        : accent === 'amber'
          ? 'bg-amber-500'
          : 'bg-zinc-600';
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${accentBar}`} />
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { username, accountId, applyRename, clear, logout } = useAuth();
  const navigate = useNavigate();
  const { error: toastError, success, toast } = useToast();

  // 改名
  const [newUsername, setNewUsername] = useState('');
  const [renaming, setRenaming] = useState(false);

  // 改密
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  // 资料
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 退出
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await accountApi.getProfile(accountId);
        if (cancelled) return;
        setBio(res.account.bio ?? '');
        setAvatarUrl(res.account.avatar_url ?? null);
      } catch {
        // 静默
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const onRename = async (e: FormEvent) => {
    e.preventDefault();
    const u = newUsername.trim();
    if (!u) {
      toast('请输入新用户名', 'error');
      return;
    }
    if (u.length < 2 || u.length > 20) {
      toast('用户名长度需在 2-20 个字符之间', 'error');
      return;
    }
    if (u === username) {
      toast('新用户名与当前相同', 'info');
      return;
    }
    setRenaming(true);
    try {
      const res = await accountApi.rename(u);
      applyRename(res.token, u); // 旧 token 立即失效，换成新 token
      setNewUsername('');
      success('改名成功');
    } catch (err) {
      toastError(err instanceof Error ? err.message : '改名失败');
    } finally {
      setRenaming(false);
    }
  };

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast('新密码至少 6 位', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast('两次输入的新密码不一致', 'error');
      return;
    }
    setChangingPwd(true);
    try {
      await accountApi.changePassword({
        username: username ?? '',
        old_password: oldPassword,
        new_password: newPassword,
      });
      success('密码修改成功，请重新登录');
      clear(); // 改密后所有 token 失效，强制登出
      navigate('/login', { replace: true });
    } catch (err) {
      toastError(err instanceof Error ? err.message : '密码修改失败');
    } finally {
      setChangingPwd(false);
    }
  };

  const onPickAvatar = async (file: File | null | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast('头像仅支持 jpg/png/webp', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast('头像不能超过 10MB', 'error');
      return;
    }
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setAvatarUploading(true);
    try {
      const res = await accountApi.uploadAvatar(file);
      setAvatarUrl(res.avatar_url);
      success('头像上传成功，记得保存资料');
    } catch (err) {
      setAvatarPreview(null);
      toastError(err instanceof Error ? err.message : '头像上传失败');
    } finally {
      setAvatarUploading(false);
    }
  };

  const onSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      await accountApi.updateProfile(avatarUrl ?? '', bio);
      success('资料已保存');
    } catch (err) {
      toastError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingProfile(false);
    }
  };

  const onLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      success('已退出登录');
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-24">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-white">设置</h1>
        <p className="mt-1 text-sm text-zinc-500">管理你的账号、资料与安全</p>
      </div>

      {/* 编辑资料 */}
      <div className="animate-fade-in-up">
        <Section title="编辑资料" description="头像与个人简介会展示在你的主页" accent="cyan">
          <form onSubmit={(e) => void onSaveProfile(e)} className="space-y-5">
            <div className="flex items-center gap-5">
              <Avatar
                userId={accountId ?? 0}
                username={username ?? '?'}
                avatarUrl={avatarUrl}
                size={72}
                link={false}
              />
              {avatarPreview && (
                <img
                  src={avatarPreview}
                  alt="头像预览"
                  className="h-[72px] w-[72px] rounded-full object-cover ring-2 ring-cyan-500/50"
                />
              )}
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/80 px-4 py-2 text-sm text-zinc-200 transition hover:border-cyan-500/60 hover:text-cyan-300 disabled:opacity-50"
                >
                  {avatarUploading && <Spinner size={14} />}
                  {avatarUploading ? '上传中…' : '更换头像'}
                </button>
                <p className="mt-1.5 text-xs text-zinc-600">jpg/png/webp，最大 10MB</p>
                {avatarUrl && (
                  <p className="mt-0.5 max-w-52 truncate text-[10px] text-zinc-600">{avatarUrl}</p>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  void onPickAvatar(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm text-zinc-400">个人简介</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={200}
                placeholder="介绍一下自己吧…"
                className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-cyan-500/60"
              />
              <span className="mt-1 block text-right text-xs text-zinc-600">{bio.length}/200</span>
            </label>

            <button
              type="submit"
              disabled={savingProfile || avatarUploading}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {savingProfile && <Spinner size={15} />}
              保存资料
            </button>
          </form>
        </Section>
      </div>

      {/* 改名 */}
      <div className="animate-fade-in-up">
        <Section title="修改用户名" description="修改后需要使用新用户名登录，旧登录态会立即失效" accent="rose">
          <form onSubmit={(e) => void onRename(e)} className="flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1">
              <span className="mb-1.5 block text-sm text-zinc-400">新用户名</span>
              <input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder={username ?? '请输入新用户名'}
                maxLength={20}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-rose-500/60"
              />
            </label>
            <button
              type="submit"
              disabled={renaming || !newUsername.trim()}
              className="flex items-center gap-2 rounded-full bg-rose-500 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-rose-400 disabled:opacity-50"
            >
              {renaming && <Spinner size={15} />}
              修改
            </button>
          </form>
        </Section>
      </div>

      {/* 改密 */}
      <div className="animate-fade-in-up">
        <Section title="修改密码" description="修改成功后所有设备都会被强制登出" accent="amber">
          <form onSubmit={(e) => void onChangePassword(e)} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm text-zinc-400">当前密码</span>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="请输入当前密码"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-amber-500/60"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm text-zinc-400">新密码</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="至少 6 位"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-amber-500/60"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-zinc-400">确认新密码</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="再次输入新密码"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-amber-500/60"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={changingPwd || !oldPassword || !newPassword || !confirmPassword}
              className="flex items-center gap-2 rounded-full bg-amber-500 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-amber-400 disabled:opacity-50"
            >
              {changingPwd && <Spinner size={15} />}
              修改密码
            </button>
          </form>
        </Section>
      </div>

      {/* 退出登录 */}
      <div className="animate-fade-in-up">
        <Section title="退出登录" description="退出当前账号在本设备的登录状态" accent="zinc">
          <button
            type="button"
            onClick={() => void onLogout()}
            disabled={loggingOut}
            className="flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-6 py-2.5 text-sm font-medium text-rose-400 transition hover:bg-rose-500/20 disabled:opacity-50"
          >
            {loggingOut && <Spinner size={15} />}
            退出登录
          </button>
        </Section>
      </div>
    </div>
  );
}
