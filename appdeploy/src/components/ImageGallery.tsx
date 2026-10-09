import { useCallback, useState } from 'react';
import { useInfiniteList } from '../hooks/useInfiniteList';
import type { ImageCardData, Paged } from '../shared/types';
import { ImageCard } from './ImageCard';
import { Lightbox } from './Lightbox';
import { Masonry } from './Masonry';

function useLightboxState(setItems: (fn: (prev: ImageCardData[]) => ImageCardData[]) => void) {
  const [open, setOpen] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const close = useCallback(() => setOpen(null), []);
  const reveal = useCallback((id: string) => setRevealed((s) => new Set(s).add(id)), []);
  const update = useCallback(
    (item: ImageCardData) => setItems((prev) => prev.map((p) => (p.id === item.id ? item : p))),
    [setItems],
  );
  return { open, setOpen, close, revealed, reveal, update };
}

const SKELETON_HEIGHTS = [320, 240, 380, 280, 300, 360, 260, 340, 300, 250];

export function GallerySkeleton() {
  return (
    <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5" aria-busy="true">
      {SKELETON_HEIGHTS.map((h, i) => (
        <div key={i} className="skeleton mb-3 rounded-xl" style={{ height: h }} />
      ))}
    </div>
  );
}

/** 메이슨리 + 무한 스크롤 + 라이트박스 이미지 갤러리. initial 을 주면 그것으로 시작하고 첫 페이지를 따로 불러오지 않는다. */
export function ImageGallery({
  endpoint,
  empty,
  hideModelLink,
  initial,
}: {
  endpoint: string;
  empty?: React.ReactNode;
  hideModelLink?: boolean;
  initial?: Paged<ImageCardData>;
}) {
  const { items, setItems, hasMore, loading, firstLoading, error, errorText, loadMore, sentinel } =
    useInfiniteList<ImageCardData>(endpoint, initial);
  const lb = useLightboxState(setItems);

  if (firstLoading || (loading && !items.length)) return <GallerySkeleton />;

  if (!items.length) {
    if (error) {
      return (
        <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
          <p className="text-lg font-bold">이미지를 불러오지 못했어요</p>
          <p className="text-sm text-muted">{errorText ?? '잠시 후 다시 시도해 주세요.'}</p>
          <button type="button" className="btn btn-secondary mt-2" onClick={loadMore}>
            다시 시도
          </button>
        </div>
      );
    }
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
        {loading && '불러오는 중…'}
        {error && (
          <button type="button" className="btn btn-secondary" onClick={loadMore}>
            다시 시도
          </button>
        )}
        {!hasMore && items.length > 12 && '모든 이미지를 다 봤어요'}
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
  const [prevImages, setPrevImages] = useState(images);
  if (images !== prevImages) {
    // 버전을 바꾸는 등 부모가 새 목록을 주면 교체한다
    setPrevImages(images);
    setItems(images);
  }
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
