"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Paged } from "@/lib/types";

/**
 * 서버에서 받은 첫 페이지 이후를 스크롤에 맞춰 이어 불러온다.
 * 필터가 바뀌면 부모에서 key 를 바꿔 새로 마운트한다.
 */
export function useInfiniteList<T extends { id: number }>(initial: Paged<T>, endpoint: string) {
  const [items, setItems] = useState(initial.items);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const page = useRef(1);
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore) return;
    busy.current = true;
    setLoading(true);
    setError(false);
    try {
      const sep = endpoint.includes("?") ? "&" : "?";
      const res = await fetch(`${endpoint}${sep}page=${page.current + 1}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Paged<T>;
      page.current += 1;
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
  }, [endpoint, hasMore]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || error) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), {
      rootMargin: "1200px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore, error, items.length]);

  return { items, setItems, hasMore, loading, error, loadMore, sentinel };
}
