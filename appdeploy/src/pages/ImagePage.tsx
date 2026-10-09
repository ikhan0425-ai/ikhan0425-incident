import { Link, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { TypeBadge } from '../components/Badges';
import { DeleteButton } from '../components/DeleteButton';
import { GenerationInfo } from '../components/GenerationInfo';
import { ImageGallery } from '../components/ImageGallery';
import { LikeButton } from '../components/LikeButton';
import { NsfwReveal } from '../components/NsfwReveal';
import { DownloadIcon } from '../components/icons';
import { useAuth } from '../lib/auth';
import { formatDate } from '../shared/format';
import type { ImageCardData, ImageDetailData, Paged } from '../shared/types';
import { isNotFound, NotFoundPage, PageError, usePageData, usePageTitle } from './NotFoundPage';

function ImageContent({ image }: { image: ImageDetailData }) {
  const { me } = useAuth();
  // 같은 모델(없으면 같은 사용자)의 다른 이미지
  const moreQuery = new URLSearchParams(image.model ? { modelId: image.model.id } : { userId: image.user.id });
  moreQuery.set('pageSize', '12');
  const moreEndpoint = `/api/images?${moreQuery.toString()}`;
  const { data: more } = usePageData<Paged<ImageCardData>>(moreEndpoint);
  const moreItems = more ? more.items.filter((i) => i.id !== image.id) : [];

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex items-start justify-center rounded-2xl bg-surface p-2 sm:p-4">
          <NsfwReveal nsfw={image.nsfw}>
            <img
              src={image.url}
              alt={image.meta.prompt?.slice(0, 120) ?? 'AI 생성 이미지'}
              width={image.width}
              height={image.height}
              className="max-h-[82vh] w-auto max-w-full rounded-lg object-contain"
              style={{ backgroundColor: image.color ?? undefined, aspectRatio: `${image.width} / ${image.height}` }}
            />
          </NsfwReveal>
        </div>

        <aside className="space-y-5">
          <div className="card flex items-center justify-between gap-3 p-4">
            <Link to={`/users/${image.user.id}`} className="flex min-w-0 items-center gap-2.5">
              <Avatar userId={image.user.id} displayName={image.user.displayName} size={38} />
              <span className="min-w-0">
                <span className="block truncate font-bold">{image.user.displayName}</span>
                <span className="block text-xs text-subtle">{formatDate(image.createdAt)}</span>
              </span>
            </Link>
            {/* 로그인 후 다시 불러와 좋아요 여부가 바뀌면 새로 그린다 */}
            <LikeButton
              key={`${image.likedByMe}:${image.likes}`}
              endpoint={`/api/images/${image.id}/like`}
              liked={image.likedByMe}
              count={image.likes}
            />
          </div>

          {image.model && (
            <Link
              to={`/models/${image.model.id}${image.model.versionId ? `?v=${encodeURIComponent(image.model.versionId)}` : ''}`}
              className="card flex items-center justify-between gap-3 p-4 hover:border-surface-3"
            >
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-subtle">사용한 모델</span>
                <span className="block truncate font-bold">{image.model.name}</span>
                {image.model.versionName && <span className="text-xs text-muted">{image.model.versionName}</span>}
              </span>
              <TypeBadge type={image.model.type} />
            </Link>
          )}

          <section className="card p-4">
            <h2 className="mb-3 font-bold">생성 정보</h2>
            <GenerationInfo meta={image.meta} source={image.metaSource} />
          </section>

          <div className="flex flex-wrap gap-2">
            <a href={image.url} className="btn btn-secondary flex-1" download target="_blank" rel="noopener">
              <DownloadIcon size={15} /> 원본 받기 ({image.width}×{image.height})
            </a>
            {me && me.id === image.user.id && (
              <DeleteButton endpoint={`/api/images/${image.id}`} redirectTo={`/users/${me.id}?tab=images`} confirmText="이 이미지를 삭제할까요?" />
            )}
          </div>
        </aside>
      </div>

      {moreItems.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-bold">{image.model ? `${image.model.name} 의 다른 이미지` : `${image.user.displayName}님의 다른 이미지`}</h2>
          <ImageGallery key={moreEndpoint} initial={{ items: moreItems, hasMore: false }} endpoint={moreEndpoint} />
        </section>
      )}
    </>
  );
}

export function ImagePage() {
  const { id = '' } = useParams();
  const { data, error, retry } = usePageData<{ image: ImageDetailData }>(`/api/images/${encodeURIComponent(id)}`, {
    refreshOnSignIn: true,
  });
  const image = data?.image ?? null;
  usePageTitle(
    image
      ? `${image.user.displayName}님의 이미지${image.model ? ` · ${image.model.name}` : ''}`
      : isNotFound(error)
        ? '이미지를 찾을 수 없어요'
        : null,
  );

  if (isNotFound(error)) return <NotFoundPage />;
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      {image ? (
        <ImageContent key={image.id} image={image} />
      ) : error ? (
        <PageError error={error} onRetry={retry} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="skeleton h-[70vh] rounded-2xl" />
          <div className="skeleton h-96 rounded-xl" />
        </div>
      )}
    </div>
  );
}
