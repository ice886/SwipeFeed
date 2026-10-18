interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-skeleton rounded-lg bg-zinc-800/80 ${className}`} />;
}

/** Feed 沉浸流加载骨架 */
export function FeedSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-6 px-6">
      <Skeleton className="h-[70vh] w-[min(420px,80vw)] rounded-2xl" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    </div>
  );
}

/** 网格卡片加载骨架 */
export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[3/4] w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
