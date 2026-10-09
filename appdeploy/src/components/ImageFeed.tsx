import { useNavigate } from 'react-router-dom';
import { IMAGE_SORTS, PERIODS } from '../shared/constants';
import { imageFiltersToQuery, type ImageFilters } from '../shared/filters';
import { ImageGallery } from './ImageGallery';

export function ImageFeed({ filters }: { filters: ImageFilters }) {
  const navigate = useNavigate();
  const query = imageFiltersToQuery(filters);
  const apply = (next: Partial<ImageFilters>) => {
    const qs = imageFiltersToQuery({ ...filters, ...next });
    navigate(qs ? `/images?${qs}` : '/images');
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="정렬">
          {IMAGE_SORTS.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={filters.sort === s.value}
              onClick={() => apply({ sort: s.value })}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${filters.sort === s.value ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="기간">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={filters.period === p.value}
              onClick={() => apply({ period: p.value })}
              className={`rounded-md px-2.5 py-1.5 text-sm font-semibold ${filters.period === p.value ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {filters.q && (
          <button type="button" className="chip chip-active" onClick={() => apply({ q: '' })}>
            &ldquo;{filters.q}&rdquo; 검색 해제 ✕
          </button>
        )}
      </div>
      <div className="mt-5">
        <ImageGallery
          key={query}
          endpoint={`/api/images${query ? `?${query}` : ''}`}
          empty={
            <div className="card px-6 py-16 text-center">
              <p className="text-lg font-bold">조건에 맞는 이미지가 없어요</p>
              <p className="mt-1 text-sm text-muted">기간을 넓히거나 다른 검색어를 써 보세요.</p>
            </div>
          }
        />
      </div>
    </div>
  );
}
