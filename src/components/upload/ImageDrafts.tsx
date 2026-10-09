"use client";

import { useEffect, useRef, useState } from "react";
import { LIMITS, SAMPLERS, SCHEDULERS } from "@/lib/constants";
import { formatBytes } from "@/lib/format";
import { hasGenerationData, SOURCE_LABELS, type GenerationParams } from "@/lib/generation";
import { CheckIcon, ChevronDownIcon, TrashIcon, UploadIcon } from "../icons";
import { createDraft, parseDraft, validateImageFile, type ImageDraft } from "./upload-utils";

/** 여러 장의 이미지를 끌어다 놓고, 자동 인식된 생성 정보를 확인·수정하는 편집기 */
export function ImageDrafts({
  drafts,
  onChange,
  title = "이미지",
  hint,
}: {
  drafts: ImageDraft[];
  onChange: (fn: (prev: ImageDraft[]) => ImageDraft[]) => void;
  title?: string;
  hint?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());

  // 미리보기용 blob URL 정리
  useEffect(() => {
    const set = urls.current;
    return () => {
      for (const u of set) URL.revokeObjectURL(u);
      set.clear();
    };
  }, []);

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    const errs: string[] = [];
    const accepted: ImageDraft[] = [];
    for (const f of list) {
      const err = validateImageFile(f);
      if (err) errs.push(err);
      else accepted.push(createDraft(f));
    }
    const room = LIMITS.imagesPerUpload - drafts.length;
    if (accepted.length > room) errs.push(`이미지는 한 번에 ${LIMITS.imagesPerUpload}장까지 올릴 수 있어요.`);
    const added = accepted.slice(0, Math.max(0, room));
    for (const d of added) urls.current.add(d.previewUrl);
    setErrors(errs);
    if (!added.length) return;
    onChange((prev) => [...prev, ...added]);
    for (const d of added) {
      parseDraft(d).then((parsed) =>
        onChange((prev) => prev.map((p) => (p.key === d.key ? { ...p, ...parsed, parsing: false } : p))),
      );
    }
  };

  const update = (key: string, patch: Partial<ImageDraft>) =>
    onChange((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const remove = (key: string) =>
    onChange((prev) => {
      const d = prev.find((p) => p.key === key);
      if (d) {
        URL.revokeObjectURL(d.previewUrl);
        urls.current.delete(d.previewUrl);
      }
      return prev.filter((p) => p.key !== key);
    });

  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <span className="label mb-0">
          {title} <span className="font-normal text-subtle">({drafts.length}/{LIMITS.imagesPerUpload})</span>
        </span>
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragging ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-surface-3"
        }`}
      >
        <UploadIcon size={26} className="text-muted" />
        <p className="font-semibold">이미지를 끌어다 놓거나 눌러서 선택하세요</p>
        <p className="text-xs text-muted">
          {hint ?? "PNG · JPEG · WebP, 장당 30MB 이하. A1111/Forge/ComfyUI/NovelAI 로 만든 원본이면 프롬프트와 시드가 자동으로 채워져요."}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {errors.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {drafts.length > 0 && (
        <ul className="mt-4 space-y-3">
          {drafts.map((d, i) => (
            <DraftRow key={d.key} draft={d} index={i} onUpdate={(p) => update(d.key, p)} onRemove={() => remove(d.key)} />
          ))}
        </ul>
      )}
      <datalist id="sampler-list">
        {SAMPLERS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="scheduler-list">
        {SCHEDULERS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

function DraftRow({
  draft,
  index,
  onUpdate,
  onRemove,
}: {
  draft: ImageDraft;
  index: number;
  onUpdate: (patch: Partial<ImageDraft>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const m = draft.meta;
  const set = (patch: Partial<GenerationParams>) => onUpdate({ meta: { ...m, ...patch } });
  const num = (v: string) => (v === "" ? null : Number(v));
  const found = hasGenerationData(m);

  return (
    <li className="card overflow-hidden">
      <div className="flex gap-3 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={draft.previewUrl} alt="" className="h-24 w-24 shrink-0 rounded-lg bg-surface-2 object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {index === 0 && <span className="mr-1.5 rounded bg-accent/20 px-1.5 py-0.5 text-[11px] text-accent">대표</span>}
                {draft.file.name}
              </p>
              <p className="text-xs text-subtle">{formatBytes(draft.file.size)}</p>
            </div>
            <button type="button" onClick={onRemove} className="btn btn-ghost -mr-1 -mt-1 p-1.5" aria-label="이미지 빼기">
              <TrashIcon size={15} />
            </button>
          </div>
          <div className="mt-1.5 text-xs">
            {draft.parsing ? (
              <span className="text-muted">생성 정보 읽는 중…</span>
            ) : found ? (
              <span className="inline-flex items-center gap-1 font-semibold text-success">
                <CheckIcon size={13} /> {draft.source ? `${SOURCE_LABELS[draft.source]} 생성 정보 자동 인식` : "생성 정보 입력됨"}
              </span>
            ) : (
              <span className="text-muted">생성 정보가 없어요 — 직접 입력할 수 있어요</span>
            )}
          </div>
          {m.prompt && !open && <p className="prompt-text mt-1 line-clamp-2 text-xs text-fg/70">{m.prompt}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
            >
              생성 정보 {open ? "접기" : found ? "확인·수정" : "입력"}
              <ChevronDownIcon size={13} className={open ? "rotate-180" : ""} />
            </button>
            <label className="inline-flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={draft.nsfw} onChange={(e) => onUpdate({ nsfw: e.target.checked })} />
              성인(19+) 이미지
            </label>
          </div>
        </div>
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-3 border-t border-line bg-bg/40 p-3 sm:grid-cols-4">
          <Field label="프롬프트" className="col-span-2 sm:col-span-4">
            <textarea
              className="input min-h-20 font-mono text-[13px]"
              value={m.prompt ?? ""}
              onChange={(e) => set({ prompt: e.target.value || null })}
              placeholder="masterpiece, best quality, 1girl, ..."
            />
          </Field>
          <Field label="네거티브 프롬프트" className="col-span-2 sm:col-span-4">
            <textarea
              className="input min-h-14 font-mono text-[13px]"
              value={m.negativePrompt ?? ""}
              onChange={(e) => set({ negativePrompt: e.target.value || null })}
              placeholder="lowres, bad anatomy, ..."
            />
          </Field>
          <Field label="샘플러" className="col-span-2">
            <input className="input" list="sampler-list" value={m.sampler ?? ""} onChange={(e) => set({ sampler: e.target.value || null })} />
          </Field>
          <Field label="스케줄러" className="col-span-2">
            <input className="input" list="scheduler-list" value={m.scheduler ?? ""} onChange={(e) => set({ scheduler: e.target.value || null })} />
          </Field>
          <Field label="스텝">
            <input className="input" type="number" min={1} max={1000} value={m.steps ?? ""} onChange={(e) => set({ steps: num(e.target.value) })} />
          </Field>
          <Field label="CFG Scale">
            <input className="input" type="number" step={0.5} min={0} max={100} value={m.cfgScale ?? ""} onChange={(e) => set({ cfgScale: num(e.target.value) })} />
          </Field>
          <Field label="시드">
            <input className="input" inputMode="numeric" value={m.seed ?? ""} onChange={(e) => set({ seed: e.target.value.replace(/[^\d-]/g, "") || null })} />
          </Field>
          <Field label="Clip skip">
            <input className="input" type="number" min={1} max={12} value={m.clipSkip ?? ""} onChange={(e) => set({ clipSkip: num(e.target.value) })} />
          </Field>
          <Field label="사용한 체크포인트 이름" className="col-span-2 sm:col-span-4">
            <input className="input" value={m.model ?? ""} onChange={(e) => set({ model: e.target.value || null })} />
          </Field>
        </div>
      )}
    </li>
  );
}
