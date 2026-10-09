"use client";

import { useLayoutEffect, useRef, useState } from "react";

interface Sized {
  id: number;
  width: number;
  height: number;
}

/**
 * 비율이 제각각인 이미지를 가장 짧은 열부터 채우는 메이슨리 레이아웃.
 * 너비를 재기 전(서버 렌더링)에는 CSS columns 로 비슷하게 보여 준다.
 */
export function Masonry<T extends Sized>({
  items,
  render,
  minColumnWidth = 250,
  gap = 12,
}: {
  items: T[];
  render: (item: T, index: number) => React.ReactNode;
  minColumnWidth?: number;
  gap?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (width: number) => setCols(Math.max(2, Math.floor((width + gap) / (minColumnWidth + gap))));
    measure(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [gap, minColumnWidth]);

  if (cols === null) {
    return (
      <div ref={ref} className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
        {items.map((item, i) => (
          <div key={item.id} className="mb-3 break-inside-avoid">
            {render(item, i)}
          </div>
        ))}
      </div>
    );
  }

  const columns: { item: T; index: number }[][] = Array.from({ length: cols }, () => []);
  const heights = new Array<number>(cols).fill(0);
  items.forEach((item, index) => {
    let shortest = 0;
    for (let c = 1; c < cols; c++) if (heights[c] < heights[shortest] - 0.01) shortest = c;
    columns[shortest].push({ item, index });
    heights[shortest] += (item.height || 1) / (item.width || 1) + 0.05;
  });

  return (
    <div ref={ref} className="flex items-start" style={{ gap }}>
      {columns.map((col, c) => (
        <div key={c} className="flex min-w-0 flex-1 flex-col" style={{ gap }}>
          {col.map(({ item, index }) => (
            <div key={item.id}>{render(item, index)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
