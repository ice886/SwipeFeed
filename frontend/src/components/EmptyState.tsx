import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-800/70 bg-zinc-900/40 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800/80 text-zinc-400">
        {icon ?? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <path d="m10 9 5 3-5 3V9z" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="text-base font-semibold text-zinc-200">{title}</div>
      {description ? <div className="max-w-sm text-sm text-zinc-500">{description}</div> : null}
      {action}
    </div>
  );
}
