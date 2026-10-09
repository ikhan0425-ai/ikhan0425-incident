import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/Avatar";
import { ImageGallery } from "@/components/ImageGallery";
import { ModelResults } from "@/components/ModelBrowser";
import { formatCount, formatDate } from "@/lib/format";
import { parseModelFilters } from "@/lib/filters";
import { getCurrentUser } from "@/lib/server/auth";
import { getUserProfile, listImages, listModels } from "@/lib/server/queries";

type Props = PageProps<"/users/[username]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = getUserProfile(decodeURIComponent((await params).username));
  return { title: profile ? `${profile.displayName} (@${profile.username})` : "사용자를 찾을 수 없어요" };
}

async function Profile({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ username }, sp] = await Promise.all([params, searchParams]);
  const profile = getUserProfile(decodeURIComponent(username));
  if (!profile) notFound();
  const viewer = await getCurrentUser();
  const tab = sp.tab === "images" ? "images" : "models";
  const isMe = viewer?.id === profile.id;
  const base = `/users/${profile.username}`;

  const stats = [
    { label: "모델", value: profile.stats.models },
    { label: "이미지", value: profile.stats.images },
    { label: "받은 다운로드", value: profile.stats.downloads },
    { label: "받은 좋아요", value: profile.stats.likes },
  ];

  return (
    <>
      <div className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar username={profile.username} displayName={profile.displayName} size={72} />
          <div>
            <h1 className="text-2xl font-extrabold">{profile.displayName}</h1>
            <p className="text-sm text-muted">
              @{profile.username} · {formatDate(profile.createdAt)} 가입
            </p>
            {profile.bio && <p className="mt-2 max-w-xl text-sm text-fg/90">{profile.bio}</p>}
          </div>
        </div>
        <dl className="grid grid-cols-4 gap-2 text-center sm:gap-6">
          {stats.map((s) => (
            <div key={s.label}>
              <dd className="text-xl font-extrabold">{formatCount(s.value)}</dd>
              <dt className="text-xs text-muted">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-6 flex gap-1.5" role="tablist">
        <Link href={base} scroll={false} role="tab" aria-selected={tab === "models"} className={`chip font-semibold ${tab === "models" ? "chip-active" : ""}`}>
          모델 {profile.stats.models}
        </Link>
        <Link
          href={`${base}?tab=images`}
          scroll={false}
          role="tab"
          aria-selected={tab === "images"}
          className={`chip font-semibold ${tab === "images" ? "chip-active" : ""}`}
        >
          이미지 {profile.stats.images}
        </Link>
      </div>

      <div className="mt-5">
        {tab === "models" ? (
          <ModelResults
            key={`m-${profile.id}`}
            initial={listModels(parseModelFilters({}), 1, { userId: profile.id })}
            query={`userId=${profile.id}`}
            empty={
              <div className="card px-6 py-12 text-center text-sm text-muted">
                아직 올린 모델이 없어요.
                {isMe && (
                  <Link href="/models/new" className="btn btn-primary mx-auto mt-4 flex w-fit">
                    첫 모델 올리기
                  </Link>
                )}
              </div>
            }
          />
        ) : (
          <ImageGallery
            key={`i-${profile.id}`}
            initial={listImages({ userId: profile.id }, 1, viewer?.id ?? null)}
            endpoint={`/api/images?userId=${profile.id}`}
            empty={
              <div className="card px-6 py-12 text-center text-sm text-muted">
                아직 올린 이미지가 없어요.
                {isMe && (
                  <Link href="/images/new" className="btn btn-primary mx-auto mt-4 flex w-fit">
                    이미지 올리기
                  </Link>
                )}
              </div>
            }
          />
        )}
      </div>
    </>
  );
}

export default function UserPage({ params, searchParams }: Props) {
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6">
      <Suspense fallback={<div className="skeleton h-32 rounded-xl" />}>
        <Profile params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
