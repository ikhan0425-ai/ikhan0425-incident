import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '../lib/api';
import type { Paged } from '../shared/types';

function pageUrl(endpoint: string, page: number): string {
  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}page=${page}`;
}

/**
 * 첫 페이지를 불러오고, 이후는 스크롤에 맞춰 이어 불러온다.
 * initial 을 주면 그것을 첫 페이지로 쓰고 따로 불러오지 않는다.
 * 필터가 바뀌면 부모에서 key 를 바꿔 새로 마운트한다.
 */
export function useInfiniteList<T extends { id: string }>(endpoint: string, initial?: Paged<T>) {
  const [items, setItems] = useState<T[]>(() => initial?.items ?? []);
  const [hasMore, setHasMore] = useState(initial?.hasMore ?? false);
  const [loading, setLoading] = useState(false);
  const [firstLoading, setFirstLoading] = useState(!initial);
  const [error, setError] = useState(false);
  /** 첫 페이지 응답 그대로 (tags 같은 추가 필드용) */
  const [first, setFirst] = useState<unknown>(initial ?? null);
  const page = useRef(initial ? 1 : 0);
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const hasInitial = initial !== undefined;

  useEffect(() => {
    if (hasInitial) return;
    let alive = true;
    page.current = 0;
    apiGet<Paged<T>>(pageUrl(endpoint, 1))
      .then((data) => {
        if (!alive) return;
        page.current = 1;
        setFirst(data);
        setItems(data.items);
        setHasMore(data.hasMore);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setFirstLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [endpoint, hasInitial]);

  const loadMore = useCallback(async () => {
    // 첫 페이지를 못 불러왔으면 다시 시도할 때 1페이지부터
    if (busy.current || firstLoading || (page.current > 0 && !hasMore)) return;
    busy.current = true;
    setLoading(true);
    setError(false);
    try {
      const next = page.current + 1;
      const data = await apiGet<Paged<T>>(pageUrl(endpoint, next));
      page.current = next;
      if (next === 1) setFirst(data);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...data.items.filter((i) => !seen.has(i.id))];
      });
      setHasMore(data.hasMore);
    } catch {
      setError(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [endpoint, hasMore, firstLoading]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || error || firstLoading) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), {
      rootMargin: '1200px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore, error, firstLoading, items.length]);

  return { items, setItems, hasMore, loading, firstLoading, error, loadMore, sentinel, first };
}
