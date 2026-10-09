"use client";

import { useState } from "react";
import { formatA1111, hasGenerationData, SOURCE_LABELS, type GenerationParams, type MetadataSource } from "@/lib/generation";
import { CopyButton } from "./CopyButton";

function PromptBlock({ label, text, negative }: { label: string; text: string; negative?: boolean }) {
  const long = text.length > 360;
  const [expanded, setExpanded] = useState(false);
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className={`text-xs font-bold uppercase tracking-wide ${negative ? "text-danger/90" : "text-muted"}`}>{label}</h4>
        <CopyButton text={text} label="복사" title={`${label} 복사`} />
      </div>
      <div
        className={`prompt-text rounded-lg border border-line bg-bg/60 p-3 font-mono text-[13px] leading-relaxed text-fg/90 ${
          long && !expanded ? "line-clamp-6" : ""
        }`}
      >
        {text}
      </div>
      {long && (
        <button type="button" onClick={() => setExpanded(!expanded)} className="mt-1 text-xs font-semibold text-accent hover:underline">
          {expanded ? "접기" : "더 보기"}
        </button>
      )}
    </section>
  );
}

function Param({ label, value, copy, wide }: { label: string; value: string | number | null; copy?: boolean; wide?: boolean }) {
  if (value === null || value === "") return null;
  return (
    <div className={`rounded-lg bg-surface-2 px-3 py-2 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-[11px] font-semibold text-subtle">{label}</dt>
      <dd className="mt-0.5 flex items-center justify-between gap-1 text-sm font-semibold text-fg">
        <span className="min-w-0 break-all">{value}</span>
        {copy && <CopyButton text={String(value)} title={`${label} 복사`} className="-my-1 -mr-1.5" />}
      </dd>
    </div>
  );
}

export function GenerationInfo({ meta, source }: { meta: GenerationParams; source: MetadataSource | null }) {
  if (!hasGenerationData(meta)) {
    return (
      <div className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
        이 이미지에는 생성 정보(프롬프트, 시드 등)가 없어요.
      </div>
    );
  }
  const extra = Object.entries(meta.extra);
  return (
    <div className="space-y-4">
      {meta.prompt && <PromptBlock label="프롬프트" text={meta.prompt} />}
      {meta.negativePrompt && <PromptBlock label="네거티브 프롬프트" text={meta.negativePrompt} negative />}
      <dl className="grid grid-cols-2 gap-2">
        <Param label="샘플러 (Sampler)" value={meta.sampler} />
        <Param label="스케줄러" value={meta.scheduler} />
        <Param label="스텝 (Steps)" value={meta.steps} />
        <Param label="CFG Scale" value={meta.cfgScale} />
        <Param label="시드 (Seed)" value={meta.seed} copy />
        <Param label="크기" value={meta.size} />
        <Param label="Clip skip" value={meta.clipSkip} />
        <Param label="모델 해시" value={meta.modelHash} />
        <Param label="모델" value={meta.model} wide />
      </dl>
      {extra.length > 0 && (
        <details className="group rounded-lg border border-line">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold text-muted hover:text-fg">
            기타 파라미터 {extra.length}개
          </summary>
          <dl className="divide-y divide-line border-t border-line text-xs">
            {extra.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 px-3 py-1.5">
                <dt className="text-subtle">{k}</dt>
                <dd className="prompt-text text-fg/90">{v}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CopyButton
          text={formatA1111(meta)}
          label="전체 생성 정보 복사"
          title="A1111 / Forge 의 PNG Info 형식으로 복사"
          className="border border-line bg-surface-2 px-2.5 py-1.5"
        />
        {source && <span className="text-[11px] text-subtle">출처: {SOURCE_LABELS[source]}</span>}
      </div>
    </div>
  );
}
