import { Link } from 'react-router-dom';
import { formatCount } from '../shared/format';
import type { ModelCardData } from '../shared/types';
import { Avatar } from './Avatar';
import { BaseBadge, NsfwBadge, TypeBadge } from './Badges';
import { DownloadIcon, HeartIcon, ImageIcon } from './icons';

export function ModelCard({ model }: { model: ModelCardData }) {
  const { cover } = model;
  const blur = model.nsfw || cover?.nsfw;
  return (
    <Link
      to={`/models/${model.id}`}
      className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line transition-shadow hover:ring-surface-3 hover:shadow-xl hover:shadow-black/40"
    >
      {cover ? (
        <img
          src={cover.thumbUrl}
          alt={model.name}
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] ${blur ? 'scale-110 blur-2xl' : ''}`}
          style={{ backgroundColor: cover.color ?? undefined }}
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-subtle">
          <ImageIcon size={32} />
        </div>
      )}

      <div className="absolute left-2 top-2 flex flex-wrap gap-1">
        <TypeBadge type={model.type} />
        {model.baseModel && <BaseBadge base={model.baseModel} />}
        {blur && <NsfwBadge />}
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-3 pt-14">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-white drop-shadow">{model.name}</h3>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-white/80">
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar userId={model.creator.id} displayName={model.creator.displayName} size={18} />
            <span className="truncate">{model.creator.displayName}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 font-semibold">
            <span className="flex items-center gap-0.5" title="다운로드">
              <DownloadIcon size={12} />
              {formatCount(model.stats.downloads)}
            </span>
            <span className="flex items-center gap-0.5" title="좋아요">
              <HeartIcon size={12} />
              {formatCount(model.stats.likes)}
            </span>
            <span className="flex items-center gap-0.5" title="이미지">
              <ImageIcon size={12} />
              {formatCount(model.stats.images)}
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ModelCardSkeleton() {
  return <div className="skeleton aspect-[3/4] rounded-xl" />;
}

export const MODEL_GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';
