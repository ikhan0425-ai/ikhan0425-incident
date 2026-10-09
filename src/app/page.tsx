import { Suspense } from "react";
import { ModelBrowser } from "@/components/ModelBrowser";
import { MODEL_GRID, ModelCardSkeleton } from "@/components/ModelCard";
import { parseModelFilters } from "@/lib/filters";
import { listModels, popularTags } from "@/lib/server/queries";

async function Models({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const filters = parseModelFilters(await searchParams);
  return <ModelBrowser filters={filters} tags={popularTags(40)} initial={listModels(filters)} />;
}

function ModelsSkeleton() {
  return (
    <div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="skeleton h-9 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <div className="skeleton h-10 w-64 rounded-lg" />
        <div className="skeleton h-10 w-72 rounded-lg" />
      </div>
      <div className={`mt-14 ${MODEL_GRID}`}>
        {Array.from({ length: 12 }, (_, i) => (
          <ModelCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">모델 둘러보기</h1>
        <p className="mt-1 text-sm text-muted">
          체크포인트, LoRA, VAE, ControlNet… 사람들이 직접 만든 AI 그림 모델을 찾고, 결과물의 프롬프트까지 확인해 보세요.
        </p>
      </div>
      <Suspense fallback={<ModelsSkeleton />}>
        <Models searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
