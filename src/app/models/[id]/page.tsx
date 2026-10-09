import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/Avatar";
import { BaseBadge, NsfwBadge, TypeBadge } from "@/components/Badges";
import { CopyButton } from "@/components/CopyButton";
import { DeleteButton } from "@/components/DeleteButton";
import { ImageGallery, ImageStrip } from "@/components/ImageGallery";
import { LikeButton } from "@/components/LikeButton";
import { AlertIcon, DownloadIcon, ExternalLinkIcon, ImageIcon, PlusIcon } from "@/components/icons";
import { modelTypeInfo, PICKLE_EXTENSIONS, tagLabel } from "@/lib/constants";
import { autoV2, formatBytes, formatCount, formatDate } from "@/lib/format";
import { getCurrentUser } from "@/lib/server/auth";
import { getModelDetail, listImages } from "@/lib/server/queries";

type Props = PageProps<"/models/[id]">;

function toId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = toId((await params).id);
  const model = id ? getModelDetail(id, null) : null;
  if (!model) return { title: "모델을 찾을 수 없어요" };
  return {
    title: `${model.name} · ${modelTypeInfo(model.type).label}`,
    description: model.description.slice(0, 160) || `${model.creator.displayName}님이 만든 ${modelTypeInfo(model.type).label} 모델`,
  };
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <span className="flex items-center gap-1" title={label}>
      {icon}
      <span className="font-semibold text-fg">{formatCount(value)}</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-all text-right font-semibold">{children}</dd>
    </div>
  );
}

async function ModelContent({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ id: rawId }, sp] = await Promise.all([params, searchParams]);
  const viewer = await getCurrentUser();
  const id = toId(rawId);
  const model = id ? getModelDetail(id, viewer?.id ?? null) : null;
  if (!model) notFound();

  const requested = Number(Array.isArray(sp.v) ? sp.v[0] : sp.v);
  const version = model.versions.find((v) => v.id === requested) ?? model.versions[0];
  const viewerId = viewer?.id ?? null;
  const samples = version
    ? listImages({ versionId: version.id, userId: model.creator.id, pageSize: 60, oldestFirst: true }, 1, viewerId).items
    : [];
  const community = listImages({ modelId: model.id, excludeUserId: model.creator.id }, 1, viewerId);
  const isOwner = viewerId === model.creator.id;
  const type = modelTypeInfo(model.type);
  const ext = version?.fileName ? version.fileName.slice(version.fileName.lastIndexOf(".")).toLowerCase() : "";
  const hash = autoV2(version?.sha256);

  return (
    <>
      <nav className="mb-3 flex items-center gap-1.5 text-sm text-muted">
        <Link href="/" className="hover:text-fg">
          모델
        </Link>
        <span>›</span>
        <Link href={`/?types=${model.type}`} className="hover:text-fg">
          {type.label}
        </Link>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <TypeBadge type={model.type} className="text-xs" />
            {version && <BaseBadge base={version.baseModel} className="bg-surface-3 text-xs" />}
            {model.nsfw && <NsfwBadge className="text-xs" />}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{model.name}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            <Link href={`/users/${model.creator.username}`} className="flex items-center gap-2 hover:text-fg">
              <Avatar username={model.creator.username} displayName={model.creator.displayName} size={26} />
              <span className="font-semibold text-fg">{model.creator.displayName}</span>
            </Link>
            <span>업데이트 {formatDate(model.updatedAt)}</span>
            <Stat icon={<DownloadIcon size={14} />} value={model.stats.downloads} label="다운로드" />
            <Stat icon={<ImageIcon size={14} />} value={model.stats.images} label="이미지" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LikeButton
            endpoint={`/api/models/${model.id}/like`}
            liked={model.likedByMe}
            count={model.stats.likes}
            variant="large"
          />
          {version && (
            <Link href={`/images/new?versionId=${version.id}`} className="btn btn-secondary">
              <ImageIcon size={15} /> 이미지 올리기
            </Link>
          )}
          {isOwner && (
            <>
              <Link href={`/models/${model.id}/versions/new`} className="btn btn-secondary">
                <PlusIcon size={15} /> 새 버전
              </Link>
              <DeleteButton
                endpoint={`/api/models/${model.id}`}
                redirectTo="/"
                confirmText={`"${model.name}" 모델을 삭제할까요? 모든 버전과 제작자 샘플 이미지가 함께 삭제됩니다.`}
              />
            </>
          )}
        </div>
      </div>

      {model.versions.length > 0 && (
        <div className="no-scrollbar -mx-4 mt-5 flex gap-1.5 overflow-x-auto px-4" role="tablist" aria-label="버전">
          {model.versions.map((v) => (
            <Link
              key={v.id}
              href={`/models/${model.id}?v=${v.id}`}
              scroll={false}
              role="tab"
              aria-selected={v.id === version?.id}
              className={`chip font-semibold ${v.id === version?.id ? "chip-active" : ""}`}
            >
              {v.name}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-4">
        {samples.length ? (
          <ImageStrip key={version?.id} images={samples} />
        ) : (
          <div className="card px-6 py-10 text-center text-sm text-muted">이 버전에는 샘플 이미지가 없어요.</div>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 text-lg font-bold">모델 소개</h2>
            {model.description ? (
              <p className="whitespace-pre-wrap leading-relaxed text-fg/90">{model.description}</p>
            ) : (
              <p className="text-sm text-muted">설명이 없어요.</p>
            )}
          </section>
          {version?.description && (
            <section className="card p-5">
              <h2 className="mb-3 text-lg font-bold">{version.name} 변경 사항</h2>
              <p className="whitespace-pre-wrap leading-relaxed text-fg/90">{version.description}</p>
            </section>
          )}
        </div>

        {version && (
          <aside className="space-y-4">
            <a
              href={`/api/versions/${version.id}/download`}
              className="btn btn-primary w-full py-3 text-base"
              rel={version.externalUrl ? "noopener noreferrer nofollow" : undefined}
            >
              {version.externalUrl ? (
                <>
                  <ExternalLinkIcon size={18} /> 외부 링크에서 다운로드
                </>
              ) : (
                <>
                  <DownloadIcon size={18} /> 다운로드 ({formatBytes(version.fileSize)})
                </>
              )}
            </a>
            {PICKLE_EXTENSIONS.includes(ext) && (
              <p className="flex gap-2 rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs leading-relaxed text-warn">
                <AlertIcon size={15} className="mt-0.5 shrink-0" />
                {ext} 파일은 pickle 형식이라 악성 코드가 들어 있을 수 있어요. 믿을 수 있는 제작자의 파일만 받고, 가능하면 .safetensors 를 쓰세요.
              </p>
            )}

            <dl className="card divide-y divide-line">
              <DetailRow label="종류">{type.label}</DetailRow>
              <DetailRow label="베이스 모델">{version.baseModel}</DetailRow>
              <DetailRow label="버전">{version.name}</DetailRow>
              <DetailRow label="업로드">{formatDate(version.createdAt)}</DetailRow>
              <DetailRow label="다운로드">{formatCount(version.downloads)}회</DetailRow>
              {version.fileName && <DetailRow label="파일">{version.fileName}</DetailRow>}
              {hash && (
                <DetailRow label="해시 (AutoV2)">
                  <span className="inline-flex items-center gap-1 font-mono">
                    {hash}
                    <CopyButton text={hash} title="해시 복사" className="-my-1" />
                  </span>
                </DetailRow>
              )}
            </dl>

            {version.triggerWords.length > 0 && (
              <section className="card p-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="text-sm font-bold">트리거 단어</h3>
                  <CopyButton text={version.triggerWords.join(", ")} label="모두 복사" />
                </div>
                <p className="mb-2.5 text-xs text-muted">프롬프트에 넣으면 이 모델의 효과가 적용돼요.</p>
                <div className="flex flex-wrap gap-1.5">
                  {version.triggerWords.map((w) => (
                    <span key={w} className="inline-flex items-center gap-0.5 rounded-md bg-accent/15 py-0.5 pl-2 pr-0.5 font-mono text-sm text-fg">
                      {w}
                      <CopyButton text={w} title={`"${w}" 복사`} />
                    </span>
                  ))}
                </div>
              </section>
            )}

            {model.tags.length > 0 && (
              <section className="card p-4">
                <h3 className="mb-2.5 text-sm font-bold">태그</h3>
                <div className="flex flex-wrap gap-1.5">
                  {model.tags.map((t) => (
                    <Link key={t} href={`/?tags=${encodeURIComponent(t)}`} className="chip px-2.5 py-1 text-[13px]">
                      #{tagLabel(t)}
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </aside>
        )}
      </div>

      <section className="mt-12">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">커뮤니티 갤러리</h2>
            <p className="mt-1 text-sm text-muted">다른 사람들이 이 모델로 만든 이미지예요. 마우스를 올리면 프롬프트가 보여요.</p>
          </div>
          {version && (
            <Link href={`/images/new?versionId=${version.id}`} className="btn btn-primary">
              <PlusIcon size={15} /> 내 결과물 올리기
            </Link>
          )}
        </div>
        <ImageGallery
          key={model.id}
          initial={community}
          endpoint={`/api/images?modelId=${model.id}&excludeUserId=${model.creator.id}`}
          hideModelLink
          empty={
            <div className="card px-6 py-12 text-center">
              <p className="font-semibold">아직 올라온 결과물이 없어요</p>
              <p className="mt-1 text-sm text-muted">이 모델로 만든 그림을 처음으로 공유해 보세요.</p>
            </div>
          }
        />
      </section>
    </>
  );
}

function ModelSkeleton() {
  return (
    <div>
      <div className="skeleton h-4 w-32 rounded" />
      <div className="skeleton mt-4 h-9 w-2/3 max-w-xl rounded-lg" />
      <div className="skeleton mt-3 h-5 w-80 max-w-full rounded" />
      <div className="mt-6 flex gap-3 overflow-hidden">
        {[260, 380, 300, 260, 340].map((w, i) => (
          <div key={i} className="skeleton h-[380px] shrink-0 rounded-xl" style={{ width: w }} />
        ))}
      </div>
    </div>
  );
}

export default function ModelPage({ params, searchParams }: Props) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <Suspense fallback={<ModelSkeleton />}>
        <ModelContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
