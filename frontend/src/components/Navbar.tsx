import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import Avatar from './Avatar';
import { useToast } from './Toast';

function NavItem({
  to,
  label,
  badge,
  icon,
}: {
  to: string;
  label: string;
  badge?: number;
  icon: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition ${
          isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-white'
        }`
      }
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
}

const icons = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9z" strokeLinejoin="round" />
      <path d="M9 21v-8h6v8" strokeLinejoin="round" />
    </svg>
  ),
  upload: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M12 9v6m0-6-2.5 2.5M12 9l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  bell: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" strokeLinejoin="round" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" />
    </svg>
  ),
  message: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12a8 8 0 0 1-8 8H4l2.2-3.3A8 8 0 1 1 21 12z" strokeLinejoin="round" />
    </svg>
  ),
  user: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" strokeLinecap="round" />
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.2l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0-1.2-2.9h-.2a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-3l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10 4.6V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.7 1z" strokeLinejoin="round" />
    </svg>
  ),
};

export default function Navbar() {
  const { isLoggedIn, username, accountId, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const { success } = useToast();

  const onLogout = async () => {
    await logout();
    success('已退出登录');
    navigate('/login');
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-7xl items-center gap-2 px-4">
        <NavLink to="/" className="mr-2 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-400 text-lg font-black text-white shadow-lg shadow-rose-500/30">
            F
          </span>
          <span className="hidden bg-gradient-to-r from-rose-400 to-orange-300 bg-clip-text text-lg font-bold text-transparent md:inline">
            FeedStream
          </span>
        </NavLink>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
          {isLoggedIn ? (
            <>
              <NavItem to="/" label="首页" icon={icons.home} />
              <NavItem to="/upload" label="上传" icon={icons.upload} />
              <NavItem to="/notifications" label="通知" icon={icons.bell} badge={unreadCount} />
              <NavItem to="/messages" label="私信" icon={icons.message} />
              <NavItem to={`/user/${accountId}`} label="我的" icon={icons.user} />
              <NavItem to="/settings" label="设置" icon={icons.settings} />
            </>
          ) : (
            <>
              <NavItem to="/" label="首页" icon={icons.home} />
            </>
          )}
        </nav>

        {isLoggedIn ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/user/${accountId}`)}
              className="flex items-center gap-2 rounded-full border border-zinc-800 py-1 pl-1 pr-3 transition hover:border-zinc-700 hover:bg-zinc-900"
            >
              <Avatar userId={accountId ?? 0} username={username ?? '?'} size={28} link={false} />
              <span className="max-w-24 truncate text-sm text-zinc-300">{username}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                void onLogout();
              }}
              className="rounded-full border border-zinc-800 px-3.5 py-1.5 text-sm text-zinc-400 transition hover:border-rose-500/50 hover:text-rose-400"
            >
              退出
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="rounded-full px-4 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-800"
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="rounded-full bg-rose-500 px-4 py-1.5 text-sm font-medium text-white shadow-lg shadow-rose-500/25 transition hover:bg-rose-400"
            >
              注册
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
