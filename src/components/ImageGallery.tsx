"use client";

import { useCallback, useState } from "react";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import type { ImageCardData, Paged } from "@/lib/types";
import { ImageCard } from "./ImageCard";
import { Lightbox } from "./Lightbox";
import { Masonry } from "./Masonry";

function useLightboxState(setItems: (fn: (prev: ImageCardData[]) => ImageCardData[]) => void) {
  const [open, setOpen] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const close = useCallback(() => setOpen(null), []);
  const reveal = useCallback((id: number) => setRevealed((s) => new Set(s).add(id)), []);
  const update = useCallback(
    (item: ImageCardData) => setItems((prev) => prev.map((p) => (p.id === item.id ? item : p))),
    [setItems],
  );
  return { open, setOpen, close, revealed, reveal, update };
}

/** 메이슨리 + 무한 스크롤 + 라이트박스 이미지 갤러리 */
export function ImageGallery({
  initial,
  endpoint,
  empty,
  hideModelLink,
}: {
  initial: Paged<ImageCardData>;
  endpoint: string;
  empty?: React.ReactNode;
  hideModelLink?: boolean;
}) {
  const { items, setItems, hasMore, loading, error, loadMore, sentinel } = useInfiniteList(initial, endpoint);
  const lb = useLightboxState(setItems);

  if (!items.length) {
    return <>{empty ?? <p className="py-10 text-center text-sm text-muted">아직 이미지가 없어요.</p>}</>;
  }

  return (
    <>
      <Masonry
        items={items}
        render={(img, i) => (
          <ImageCard
            image={img}
            onOpen={() => lb.setOpen(i)}
            revealed={lb.revealed.has(img.id)}
            onReveal={() => lb.reveal(img.id)}
          />
        )}
      />
      <div ref={sentinel} className="flex justify-center py-8 text-sm text-muted">
        {loading && "불러오는 중…"}
        {error && (
          <button type="button" className="btn btn-secondary" onClick={loadMore}>
            다시 시도
          </button>
        )}
        {!hasMore && items.length > 12 && "모든 이미지를 다 봤어요"}
      </div>
      {lb.open !== null && (
        <Lightbox
          items={items}
          index={lb.open}
          onClose={lb.close}
          onIndexChange={(i) => {
            lb.setOpen(i);
            if (i >= items.length - 3 && hasMore) loadMore();
          }}
          onItemChange={lb.update}
          revealed={lb.revealed}
          onReveal={lb.reveal}
          hideModelLink={hideModelLink}
        />
      )}
    </>
  );
}

/** 모델 상세 상단의 가로 스크롤 샘플 이미지 목록 */
export function ImageStrip({ images, height = 380 }: { images: ImageCardData[]; height?: number }) {
  const [items, setItems] = useState(images);
  const lb = useLightboxState(setItems);
  if (!items.length) return null;
  return (
    <>
      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {items.map((img, i) => (
          <div key={img.id} className="shrink-0 snap-start">
            <ImageCard
              image={img}
              fixedHeight={height}
              onOpen={() => lb.setOpen(i)}
              revealed={lb.revealed.has(img.id)}
              onReveal={() => lb.reveal(img.id)}
            />
          </div>
        ))}
      </div>
      {lb.open !== null && (
        <Lightbox
          items={items}
          index={lb.open}
          onClose={lb.close}
          onIndexChange={lb.setOpen}
          onItemChange={lb.update}
          revealed={lb.revealed}
          onReveal={lb.reveal}
          hideModelLink
        />
      )}
    </>
  );
}
