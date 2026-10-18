import { useCallback, useEffect, useRef } from 'react';

/**
 * 无限滚动：返回挂到底部哨兵元素上的 ref 回调。
 * 哨兵进入视口且 enabled 时触发 onLoadMore。
 */
export function useInfiniteScroll(onLoadMore: () => void, enabled: boolean): (node: HTMLElement | null) => void {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const callbackRef = useRef(onLoadMore);
  callbackRef.current = onLoadMore;

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  return useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node || !enabled) return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) callbackRef.current();
        },
        { rootMargin: '300px 0px' },
      );
      observer.observe(node);
      observerRef.current = observer;
    },
    [enabled],
  );
}
