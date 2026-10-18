import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastType = 'error' | 'success' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
      window.setTimeout(() => remove(id), 3200);
    },
    [remove],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (m: string) => toast(m, 'success'),
      error: (m: string) => toast(m, 'error'),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-20 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`animate-toast-in pointer-events-auto rounded-full px-5 py-2.5 text-sm font-medium shadow-lg backdrop-blur ${
              t.type === 'error'
                ? 'bg-rose-500/90 text-white'
                : t.type === 'success'
                  ? 'bg-emerald-500/90 text-white'
                  : 'bg-zinc-800/95 text-zinc-100'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用');
  return ctx;
}
