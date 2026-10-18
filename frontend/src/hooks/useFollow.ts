import { useCallback, useEffect, useSyncExternalStore } from 'react';
import * as socialApi from '../api/social';

// 轻量全局「我关注的人」集合（模块级 store + useSyncExternalStore 订阅），
// 避免每个关注按钮各发一次查询。

let followingSet: ReadonlySet<number> = new Set<number>();
let loaded = false;
let loading = false;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetFollowingStore(): void {
  followingSet = new Set<number>();
  loaded = false;
  loading = false;
  emit();
}

async function loadFollowing(): Promise<void> {
  if (loaded || loading) return;
  loading = true;
  try {
    const res = await socialApi.getAllVloggers();
    followingSet = new Set(res.vloggers.map((v) => v.id));
    loaded = true;
    emit();
  } catch {
    // 拿不到就当没关注，不阻塞 UI
  } finally {
    loading = false;
  }
}

export interface FollowingStore {
  /** 是否已关注该用户（未知/未登录返回 false） */
  isFollowing: (vloggerId: number) => boolean;
  /** 切换关注状态，返回切换后的状态；失败回滚并抛错 */
  toggleFollow: (vloggerId: number) => Promise<boolean>;
  ready: boolean;
}

export function useFollow(enabled = true): FollowingStore {
  const set = useSyncExternalStore(subscribe, () => followingSet, () => followingSet);

  useEffect(() => {
    if (enabled) void loadFollowing();
  }, [enabled]);

  const isFollowing = useCallback((vloggerId: number) => set.has(vloggerId), [set]);

  const toggleFollow = useCallback(
    async (vloggerId: number): Promise<boolean> => {
      const next = !followingSet.has(vloggerId);
      const prev = followingSet;
      const optimistic = new Set(followingSet);
      if (next) optimistic.add(vloggerId);
      else optimistic.delete(vloggerId);
      followingSet = optimistic;
      loaded = true;
      emit();
      try {
        if (next) await socialApi.follow(vloggerId);
        else await socialApi.unfollow(vloggerId);
        return next;
      } catch (err) {
        followingSet = prev;
        emit();
        throw err;
      }
    },
    [],
  );

  return { isFollowing, toggleFollow, ready: loaded };
}
