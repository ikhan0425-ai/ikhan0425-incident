import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, errorMessage } from '../lib/api';
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
  /** 마지막 오류 메시지 (요청 과다 등 서버가 준 안내) */
  const [errorText, setErrorText] = useState<string | null>(null);
  /** 첫 페이지 응답 그대로 (tags 같은 추가 필드용) */
  const [first, setFirst] = useState<unknown>(initial ?? null);
  /** loadMore 가 성공한 횟수. 바뀔 때마다 감시를 새로 걸어, 감시 요소가 계속 보이는 채로 멈추지 않게 한다 */
  const [loads, setLoads] = useState(0);
  const page = useRef(initial ? 1 : 0);
  const busy = useRef(false);
  /** 지금 목록 (loadMore 안에서 새 항목이 있었는지 확인용) */
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
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
      .catch((e: unknown) => {
        if (!alive) return;
        setError(true);
        setErrorText(errorMessage(e));
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
    setErrorText(null);
    try {
      const seen = new Set(itemsRef.current.map((i) => i.id));
      // 새 항목이 하나도 없는 페이지(그 사이 새 글이 올라와 목록이 밀린 경우 등)면 바로 다음 페이지를 받는다 (최대 3쪽 더)
      for (let extra = 0; ; extra++) {
        const next = page.current + 1;
        const data = await apiGet<Paged<T>>(pageUrl(endpoint, next));
        page.current = next;
        if (next === 1) setFirst(data);
        const added = data.items.filter((i) => !seen.has(i.id));
        for (const i of added) seen.add(i.id);
        setItems((prev) => {
          const have = new Set(prev.map((i) => i.id));
          return [...prev, ...added.filter((i) => !have.has(i.id))];
        });
        setHasMore(data.hasMore);
        if (added.length > 0 || !data.hasMore || extra >= 3) break;
      }
      setLoads((n) => n + 1);
    } catch (e) {
      setError(true);
      setErrorText(errorMessage(e));
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
  }, [loadMore, hasMore, error, firstLoading, items.length, loads]);

  return { items, setItems, hasMore, loading, firstLoading, error, errorText, loadMore, sentinel, first };
}
