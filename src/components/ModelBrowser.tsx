"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import { BASE_MODELS, MODEL_SORTS, MODEL_TYPES, PERIODS, PRESET_TAGS, tagLabel } from "@/lib/constants";
import { modelFiltersToQuery, type ModelFilters } from "@/lib/filters";
import type { ModelCardData, Paged } from "@/lib/types";
import { ModelCard, MODEL_GRID } from "./ModelCard";
import { Popover } from "./Popover";
import { CheckIcon, ChevronDownIcon, SlidersIcon, XIcon } from "./icons";

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function ModelBrowser({
  filters,
  tags,
  initial,
}: {
  filters: ModelFilters;
  tags: { name: string; count: number }[];
  initial: Paged<ModelCardData>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const query = modelFiltersToQuery(filters);

  const apply = (next: Partial<ModelFilters>) => {
    const qs = modelFiltersToQuery({ ...filters, ...next });
    startTransition(() => router.push(qs ? `/?${qs}` : "/", { scroll: false }));
  };

  // 프리셋 태그를 먼저, 그 다음 많이 쓰인 사용자 태그
  const tagNames = [
    ...new Set([...filters.tags, ...PRESET_TAGS.map((t) => t.name), ...tags.map((t) => t.name)]),
  ].slice(0, 40);
  const activeCount = filters.types.length + filters.baseModels.length + filters.tags.length + (filters.q ? 1 : 0);

  return (
    <div>
      {/* 카테고리 */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="모델 종류">
        <button
          type="button"
          onClick={() => apply({ types: [] })}
          className={`chip font-semibold ${filters.types.length === 0 ? "chip-active" : ""}`}
        >
          전체
        </button>
        {MODEL_TYPES.map((t) => {
          const active = filters.types.includes(t.value);
          return (
            <button
              key={t.value}
              type="button"
              aria-pressed={active}
              onClick={() => apply({ types: toggle(filters.types, t.value) })}
              className={`chip font-semibold ${active ? "chip-active" : ""}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 정렬 / 기간 / 베이스 모델 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="정렬">
          {MODEL_SORTS.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={filters.sort === s.value}
              onClick={() => apply({ sort: s.value })}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                filters.sort === s.value ? "bg-surface-3 text-fg" : "text-muted hover:text-fg"
              }`}
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
              className={`rounded-md px-2.5 py-1.5 text-sm font-semibold transition-colors ${
                filters.period === p.value ? "bg-surface-3 text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <Popover
          align="left"
          closeOnClick={false}
          label="베이스 모델"
          button={(open) => (
            <span
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold ${
                filters.baseModels.length ? "border-accent bg-accent/15 text-fg" : "border-line bg-surface text-muted hover:text-fg"
              }`}
            >
              <SlidersIcon size={14} />
              베이스 모델{filters.baseModels.length ? ` ${filters.baseModels.length}` : ""}
              <ChevronDownIcon size={14} className={open ? "rotate-180" : ""} />
            </span>
          )}
        >
          <div className="grid w-64 grid-cols-2 gap-1 p-1">
            {BASE_MODELS.map((b) => {
              const active = filters.baseModels.includes(b);
              return (
                <button
                  key={b}
                  type="button"
                  aria-pressed={active}
                  onClick={() => apply({ baseModels: toggle(filters.baseModels, b) })}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${
                    active ? "bg-accent/15 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
                  }`}
                >
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                      active ? "border-accent bg-accent text-white" : "border-surface-3"
                    }`}
                  >
                    {active && <CheckIcon size={11} strokeWidth={3} />}
                  </span>
                  {b}
                </button>
              );
            })}
          </div>
        </Popover>

        {activeCount > 0 && (
          <Link href="/" scroll={false} className="btn btn-ghost px-2.5 py-2 text-sm">
            <XIcon size={14} /> 필터 초기화
          </Link>
        )}
      </div>

      {/* 태그 (다중 선택: 모두 포함하는 모델만) */}
      <div className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1" role="group" aria-label="태그">
        {tagNames.map((name) => {
          const active = filters.tags.includes(name);
          return (
            <button
              key={name}
              type="button"
              aria-pressed={active}
              onClick={() => apply({ tags: toggle(filters.tags, name) })}
              className={`chip px-2.5 py-1 text-[13px] ${active ? "chip-active" : ""}`}
            >
              #{tagLabel(name)}
              {active && <XIcon size={12} />}
            </button>
          );
        })}
      </div>

      {(filters.q || filters.tags.length > 1) && (
        <p className="mt-3 text-sm text-muted">
          {filters.q && (
            <>
              <strong className="text-fg">&ldquo;{filters.q}&rdquo;</strong> 검색 결과
            </>
          )}
          {filters.q && filters.tags.length > 1 && " · "}
          {filters.tags.length > 1 && <>선택한 태그를 모두 가진 모델</>}
        </p>
      )}

      <div className={`mt-5 transition-opacity ${pending ? "opacity-50" : ""}`} aria-busy={pending}>
        <ModelResults key={query} initial={initial} query={query} />
      </div>
    </div>
  );
}

export function ModelResults({ initial, query, empty }: { initial: Paged<ModelCardData>; query: string; empty?: React.ReactNode }) {
  const { items, hasMore, loading, error, loadMore, sentinel } = useInfiniteList(
    initial,
    `/api/models${query ? `?${query}` : ""}`,
  );

  if (!items.length) {
    if (empty) return <>{empty}</>;
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-lg font-bold">조건에 맞는 모델이 없어요</p>
        <p className="text-sm text-muted">필터를 줄이거나 다른 검색어로 찾아보세요. 직접 만든 모델이 있다면 첫 번째로 올려 주세요!</p>
        <div className="mt-2 flex gap-2">
          <Link href="/" className="btn btn-secondary">
            필터 초기화
          </Link>
          <Link href="/models/new" className="btn btn-primary">
            모델 업로드
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={MODEL_GRID}>
        {items.map((m) => (
          <ModelCard key={m.id} model={m} />
        ))}
      </div>
      <div ref={sentinel} className="flex justify-center py-8 text-sm text-muted">
        {loading && "불러오는 중…"}
        {error && (
          <button type="button" className="btn btn-secondary" onClick={loadMore}>
            다시 시도
          </button>
        )}
        {!hasMore && items.length > 12 && "모든 모델을 다 봤어요"}
      </div>
    </>
  );
}
