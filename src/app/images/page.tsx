import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PlusIcon } from "@/components/icons";
import { ImageFeed } from "@/components/ImageFeed";
import { parseImageFilters } from "@/lib/filters";
import { getCurrentUser } from "@/lib/server/auth";
import { listImages } from "@/lib/server/queries";

export const metadata: Metadata = { title: "이미지" };

async function Feed({ searchParams }: { searchParams: PageProps<"/images">["searchParams"] }) {
  const filters = parseImageFilters(await searchParams);
  const viewer = await getCurrentUser();
  return <ImageFeed filters={filters} initial={listImages(filters, 1, viewer?.id ?? null)} />;
}

function FeedSkeleton() {
  const heights = [320, 240, 380, 280, 300, 360, 260, 340, 300, 250];
  return (
    <div>
      <div className="flex gap-2">
        <div className="skeleton h-10 w-44 rounded-lg" />
        <div className="skeleton h-10 w-72 rounded-lg" />
      </div>
      <div className="mt-5 columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5">
        {heights.map((h, i) => (
          <div key={i} className="skeleton mb-3 rounded-xl" style={{ height: h }} />
        ))}
      </div>
    </div>
  );
}

export default function ImagesPage({ searchParams }: PageProps<"/images">) {
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">이미지</h1>
          <p className="mt-1 text-sm text-muted">마우스를 올리면 프롬프트·샘플러·시드가, 클릭하면 전체 생성 정보가 보여요.</p>
        </div>
        <Link href="/images/new" className="btn btn-primary">
          <PlusIcon size={15} /> 이미지 올리기
        </Link>
      </div>
      <Suspense fallback={<FeedSkeleton />}>
        <Feed searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
