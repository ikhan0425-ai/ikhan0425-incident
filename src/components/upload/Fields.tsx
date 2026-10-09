"use client";

import { useRef, useState } from "react";
import { LIMITS, MODEL_FILE_EXTENSIONS, normalizeTag, PICKLE_EXTENSIONS, PRESET_TAGS, tagLabel } from "@/lib/constants";
import { formatBytes } from "@/lib/format";
import { AlertIcon, FileIcon, LinkIcon, XIcon } from "../icons";

export function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const next = [...value];
    for (const part of raw.split(",")) {
      const t = normalizeTag(part);
      if (t && t.length <= 30 && !next.includes(t) && next.length < LIMITS.tagsPerModel) next.push(t);
    }
    onChange(next);
    setText("");
  };
  const toggle = (t: string) => (value.includes(t) ? onChange(value.filter((v) => v !== t)) : add(t));

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {PRESET_TAGS.map((t) => (
          <button
            key={t.name}
            type="button"
            aria-pressed={value.includes(t.name)}
            onClick={() => toggle(t.name)}
            className={`chip px-2.5 py-1 text-[13px] ${value.includes(t.name) ? "chip-active" : ""}`}
          >
            #{t.label}
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 focus-within:border-accent">
        {value
          .filter((t) => !PRESET_TAGS.some((p) => p.name === t))
          .map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-md bg-surface-3 py-0.5 pl-2 pr-1 text-sm">
              #{tagLabel(t)}
              <button type="button" aria-label={`${t} 태그 빼기`} onClick={() => toggle(t)} className="text-muted hover:text-fg">
                <XIcon size={12} />
              </button>
            </span>
          ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (text.trim()) add(text);
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => text.trim() && add(text)}
          placeholder={value.length >= LIMITS.tagsPerModel ? "태그는 10개까지" : "직접 입력 후 Enter (예: 한복, 수채화)"}
          disabled={value.length >= LIMITS.tagsPerModel}
          className="min-w-40 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-subtle"
        />
      </div>
    </div>
  );
}

export function ModelFileInput({
  file,
  onFile,
  externalUrl,
  onExternalUrl,
  maxBytes,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  externalUrl: string;
  onExternalUrl: (v: string) => void;
  maxBytes: number;
}) {
  const [mode, setMode] = useState<"file" | "link">(externalUrl ? "link" : "file");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ext = file ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";

  const pick = (f: File | undefined) => {
    if (!f) return;
    const e = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!MODEL_FILE_EXTENSIONS.includes(e)) return setError(`지원하는 형식: ${MODEL_FILE_EXTENSIONS.join(", ")}`);
    if (f.size > maxBytes) return setError(`파일이 너무 커요. (최대 ${formatBytes(maxBytes)})`);
    setError(null);
    onFile(f);
  };

  return (
    <div>
      <div className="mb-2 flex gap-1 rounded-lg border border-line bg-surface p-0.5 text-sm font-semibold sm:w-fit">
        <button
          type="button"
          onClick={() => {
            setMode("file");
            onExternalUrl("");
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 ${mode === "file" ? "bg-surface-3 text-fg" : "text-muted"}`}
        >
          <FileIcon size={14} /> 파일 올리기
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("link");
            onFile(null);
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 ${mode === "link" ? "bg-surface-3 text-fg" : "text-muted"}`}
        >
          <LinkIcon size={14} /> 외부 링크 (Hugging Face 등)
        </button>
      </div>

      {mode === "file" ? (
        file ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <FileIcon size={20} className="shrink-0 text-accent" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{file.name}</span>
                <span className="text-xs text-subtle">{formatBytes(file.size)}</span>
              </span>
            </span>
            <button type="button" className="btn btn-ghost p-1.5" aria-label="파일 빼기" onClick={() => onFile(null)}>
              <XIcon size={16} />
            </button>
          </div>
        ) : (
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
              pick(e.dataTransfer.files[0]);
            }}
            className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors ${
              dragging ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-surface-3"
            }`}
          >
            <FileIcon size={24} className="text-muted" />
            <p className="font-semibold">모델 파일을 끌어다 놓거나 눌러서 선택하세요</p>
            <p className="text-xs text-muted">
              .safetensors 권장 · 최대 {formatBytes(maxBytes)}
            </p>
          </div>
        )
      ) : (
        <input
          type="url"
          className="input"
          value={externalUrl}
          onChange={(e) => onExternalUrl(e.target.value)}
          placeholder="https://huggingface.co/사용자/모델/resolve/main/model.safetensors"
        />
      )}
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={MODEL_FILE_EXTENSIONS.join(",")}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
      {PICKLE_EXTENSIONS.includes(ext) && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warn">
          <AlertIcon size={14} className="mt-0.5 shrink-0" />
          {ext} 는 pickle 형식이라 받는 사람에게 보안 경고가 표시돼요. 가능하면 .safetensors 로 변환해서 올려 주세요.
        </p>
      )}
    </div>
  );
}

export function UploadProgress({ loaded, total }: { loaded: number; total: number }) {
  const pct = total ? Math.round((loaded / total) * 100) : 0;
  return (
    <div className="space-y-1.5" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted">
        {pct < 100 ? `업로드 중 ${pct}% (${formatBytes(loaded)} / ${formatBytes(total)})` : "서버에서 처리하는 중…"}
      </p>
    </div>
  );
}
