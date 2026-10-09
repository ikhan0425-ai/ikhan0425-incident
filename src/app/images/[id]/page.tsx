import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/Avatar";
import { TypeBadge } from "@/components/Badges";
import { DeleteButton } from "@/components/DeleteButton";
import { GenerationInfo } from "@/components/GenerationInfo";
import { ImageGallery } from "@/components/ImageGallery";
import { LikeButton } from "@/components/LikeButton";
import { NsfwReveal } from "@/components/NsfwReveal";
import { DownloadIcon } from "@/components/icons";
import { formatDate } from "@/lib/format";
import { getCurrentUser } from "@/lib/server/auth";
import { getImage, listImages } from "@/lib/server/queries";

type Props = PageProps<"/images/[id]">;

function toId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = toId((await params).id);
  const image = id ? getImage(id, null) : null;
  if (!image) return { title: "이미지를 찾을 수 없어요" };
  return {
    title: `${image.user.displayName}님의 이미지${image.model ? ` · ${image.model.name}` : ""}`,
    description: image.meta.prompt?.slice(0, 160) ?? undefined,
  };
}

async function ImageContent({ params }: Pick<Props, "params">) {
  const id = toId((await params).id);
  const viewer = await getCurrentUser();
  const image = id ? getImage(id, viewer?.id ?? null) : null;
  if (!image) notFound();
  const more = image.model
    ? listImages({ modelId: image.model.id, pageSize: 12 }, 1, viewer?.id ?? null)
    : listImages({ userId: image.userId, pageSize: 12 }, 1, viewer?.id ?? null);
  more.items = more.items.filter((i) => i.id !== image.id);

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex items-start justify-center rounded-2xl bg-surface p-2 sm:p-4">
          <NsfwReveal nsfw={image.nsfw}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={image.meta.prompt?.slice(0, 120) ?? "AI 생성 이미지"}
              width={image.width}
              height={image.height}
              className="max-h-[82vh] w-auto max-w-full rounded-lg object-contain"
              style={{ backgroundColor: image.color ?? undefined, aspectRatio: `${image.width} / ${image.height}` }}
            />
          </NsfwReveal>
        </div>

        <aside className="space-y-5">
          <div className="card flex items-center justify-between gap-3 p-4">
            <Link href={`/users/${image.user.username}`} className="flex min-w-0 items-center gap-2.5">
              <Avatar username={image.user.username} displayName={image.user.displayName} size={38} />
              <span className="min-w-0">
                <span className="block truncate font-bold">{image.user.displayName}</span>
                <span className="block text-xs text-subtle">{formatDate(image.createdAt)}</span>
              </span>
            </Link>
            <LikeButton endpoint={`/api/images/${image.id}/like`} liked={image.likedByMe} count={image.likes} />
          </div>

          {image.model && (
            <Link
              href={`/models/${image.model.id}${image.model.versionId ? `?v=${image.model.versionId}` : ""}`}
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
            <a href={`${image.url}?download=1`} className="btn btn-secondary flex-1" download>
              <DownloadIcon size={15} /> 원본 받기 ({image.width}×{image.height})
            </a>
            {viewer?.id === image.userId && (
              <DeleteButton endpoint={`/api/images/${image.id}`} redirectTo={`/users/${image.user.username}?tab=images`} confirmText="이 이미지를 삭제할까요?" />
            )}
          </div>
        </aside>
      </div>

      {more.items.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-bold">{image.model ? `${image.model.name} 의 다른 이미지` : `${image.user.displayName}님의 다른 이미지`}</h2>
          <ImageGallery initial={{ items: more.items, hasMore: false }} endpoint="/api/images" />
        </section>
      )}
    </>
  );
}

export default function ImagePage({ params }: Props) {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      <Suspense
        fallback={
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="skeleton h-[70vh] rounded-2xl" />
            <div className="skeleton h-96 rounded-xl" />
          </div>
        }
      >
        <ImageContent params={params} />
      </Suspense>
    </div>
  );
}
