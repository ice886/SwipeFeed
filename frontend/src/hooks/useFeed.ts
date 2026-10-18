import { useCallback, useEffect, useRef, useState } from 'react';
import * as feedApi from '../api/feed';
import * as likeApi from '../api/like';
import type {
  FeedCursorValue,
  FeedVideoItem,
} from '../types';

export type FeedTab = 'recommend' | 'following' | 'popular' | 'likes';

export const PAGE_SIZE = 10;

interface CursorState {
  // listLatest / listByFollowing
  latestTime?: number;
  // listLikesCount（复合游标）
  likesBefore?: number;
  idBefore?: number;
  // listByPopularity（快照分页：as_of 固定 + offset + 复合游标）
  asOf?: number;
  offset?: number;
  latestPopularity?: number;
  latestBefore?: FeedCursorValue;
  latestIdBefore?: number;
}

export interface UseFeedResult {
  items: FeedVideoItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  reload: () => void;
  /** 乐观更新点赞状态 */
  setItemLiked: (videoId: number, liked: boolean) => void;
}

/**
 * 主 Feed 数据流：支持四种 tab 的游标分页。
 * - 推荐 / 关注：next_time 游标
 * - 点赞榜：next_likes_count_before + next_id_before 复合游标
 * - 热榜：as_of 快照 + offset，翻页必须回传同一 as_of
 */
export function useFeed(tab: FeedTab, isLoggedIn: boolean): UseFeedResult {
  const [items, setItems] = useState<FeedVideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const cursorRef = useRef<CursorState>({});
  const requestSeq = useRef(0);
  const inFlight = useRef(false);

  const fetchPage = useCallback(
    async (reset: boolean) => {
      if (inFlight.current) return;
      const seq = ++requestSeq.current;
      inFlight.current = true;
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const cursor = reset ? {} : cursorRef.current;
        let page: FeedVideoItem[] = [];
        let more = false;

        if (tab === 'recommend' || tab === 'following') {
          const body = {
            limit: PAGE_SIZE,
            latest_time: cursor.latestTime ?? 0,
          };
          const res =
            tab === 'recommend' ? await feedApi.listLatest(body) : await feedApi.listByFollowing(body);
          page = res.video_list ?? [];
          more = Boolean(res.has_more);
          cursorRef.current = {
            latestTime: res.next_time ?? (page.length ? page[page.length - 1].create_time : cursor.latestTime),
          };
        } else if (tab === 'likes') {
          const res = await feedApi.listLikesCount({
            limit: PAGE_SIZE,
            likes_count_before: cursor.likesBefore,
            id_before: cursor.idBefore,
          });
          page = res.video_list ?? [];
          more = Boolean(res.has_more);
          cursorRef.current = {
            likesBefore: res.next_likes_count_before,
            idBefore: res.next_id_before,
          };
        } else {
          const res = await feedApi.listByPopularity({
            limit: PAGE_SIZE,
            as_of: cursor.asOf,
            offset: cursor.offset,
            latest_popularity: cursor.latestPopularity,
            latest_before: cursor.latestBefore,
            latest_id_before: cursor.latestIdBefore,
          });
          page = res.video_list ?? [];
          more = Boolean(res.has_more);
          cursorRef.current = {
            asOf: res.as_of,
            offset: res.next_offset,
            latestPopularity: res.next_latest_popularity,
            latestBefore: res.next_latest_before,
            latestIdBefore: res.next_latest_id_before,
          };
        }

        if (seq !== requestSeq.current) return;
        setItems((prev) => {
          if (reset) return page;
          const seen = new Set(prev.map((v) => v.id));
          return [...prev, ...page.filter((v) => !seen.has(v.id))];
        });
        setHasMore(more && page.length > 0);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : '加载失败');
        if (reset) {
          setItems([]);
          setHasMore(false);
        }
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setLoadingMore(false);
          inFlight.current = false;
        }
      }
    },
    [tab],
  );

  useEffect(() => {
    cursorRef.current = {};
    setItems([]);
    setHasMore(true);
    fetchPage(true);
    return () => {
      requestSeq.current += 1;
      inFlight.current = false;
    };
  }, [tab, reloadKey, fetchPage]);

  const loadMore = useCallback(() => {
    if (inFlight.current || loading || loadingMore || !hasMore) return;
    void fetchPage(false);
  }, [fetchPage, loading, loadingMore, hasMore]);

  const reload = useCallback(() => {
    cursorRef.current = {};
    setReloadKey((k) => k + 1);
  }, []);

  const setItemLiked = useCallback((videoId: number, liked: boolean) => {
    setItems((prev) =>
      prev.map((v) =>
        v.id === videoId
          ? { ...v, is_liked: liked, likes_count: Math.max(0, v.likes_count + (liked ? 1 : -1)) }
          : v,
      ),
    );
  }, []);

  // 未登录时的关注流只拉一次用于展示提示
  void isLoggedIn;

  return { items, loading, loadingMore, hasMore, error, loadMore, reload, setItemLiked };
}

/** 单个视频点赞切换（详情页复用） */
export async function toggleVideoLike(videoId: number, liked: boolean): Promise<void> {
  if (liked) await likeApi.unlike(videoId);
  else await likeApi.like(videoId);
}
