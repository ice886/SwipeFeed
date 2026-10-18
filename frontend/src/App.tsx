import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import Navbar from './components/Navbar';
import RequireAuth from './components/RequireAuth';
import { ToastProvider } from './components/Toast';
import EmptyState from './components/EmptyState';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import FeedPage from './pages/FeedPage';
import VideoDetailPage from './pages/VideoDetailPage';
import UploadPage from './pages/UploadPage';
import UserProfilePage from './pages/UserProfilePage';
import TagPage from './pages/TagPage';
import NotificationsPage from './pages/NotificationsPage';
import MessagesPage from './pages/MessagesPage';
import SettingsPage from './pages/SettingsPage';

function NotFoundPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-28">
      <EmptyState
        title="页面不存在"
        description="你访问的页面可能已被移除或地址有误"
        action={
          <Link
            to="/"
            className="mt-2 rounded-full bg-rose-500 px-6 py-2 text-sm text-white transition hover:bg-rose-400"
          >
            返回首页
          </Link>
        }
      />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <NotificationProvider>
            <div className="min-h-full bg-[#0f0f0f]">
              <Navbar />
              <main>
                <Routes>
                  <Route path="/" element={<FeedPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/video/:id" element={<VideoDetailPage />} />
                  <Route path="/user/:id" element={<UserProfilePage />} />
                  <Route path="/tag/:name" element={<TagPage />} />
                  <Route
                    path="/upload"
                    element={
                      <RequireAuth>
                        <UploadPage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/notifications"
                    element={
                      <RequireAuth>
                        <NotificationsPage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/messages"
                    element={
                      <RequireAuth>
                        <MessagesPage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <RequireAuth>
                        <SettingsPage />
                      </RequireAuth>
                    }
                  />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </main>
            </div>
          </NotificationProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
