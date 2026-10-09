"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { modelTypeInfo } from "@/lib/constants";
import type { ModelOption } from "@/lib/types";
import { TypeBadge } from "../Badges";
import { SearchIcon, XIcon } from "../icons";
import { ImageDrafts } from "./ImageDrafts";
import { UploadProgress } from "./Fields";
import { draftsToMeta, uploadWithProgress, type ImageDraft } from "./upload-utils";

function ModelPicker({
  value,
  versionId,
  onChange,
}: {
  value: ModelOption | null;
  versionId: number | null;
  onChange: (model: ModelOption | null, versionId: number | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ModelOption[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/model-options?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        if (res.ok) setResults(((await res.json()) as { items: ModelOption[] }).items);
      } catch {
        // 입력 중 취소됨
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
        <TypeBadge type={value.type} />
        <span className="min-w-0 flex-1 truncate font-semibold">{value.name}</span>
        <select
          className="input w-auto py-1.5"
          value={versionId ?? ""}
          onChange={(e) => onChange(value, Number(e.target.value))}
          aria-label="버전"
        >
          {value.versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} · {v.baseModel}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-ghost p-1.5" aria-label="모델 선택 해제" onClick={() => onChange(null, null)}>
          <XIcon size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <SearchIcon size={15} className="pointer-events-none absolute left-3 top-3 text-subtle" />
      <input
        className="input pl-9"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="모델 이름으로 검색 (선택 사항)"
        aria-label="사용한 모델 검색"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-2xl shadow-black/50">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(m, m.versions[0]?.id ?? null);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: modelTypeInfo(m.type).color }} />
                <span className="min-w-0 flex-1 truncate font-semibold">{m.name}</span>
                <span className="shrink-0 text-xs text-subtle">{m.versions[0]?.baseModel}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ImageUploadForm({ initialModel, initialVersionId }: { initialModel: ModelOption | null; initialVersionId: number | null }) {
  const [instance, setInstance] = useState(0);
  return (
    <FormInner
      key={instance}
      initialModel={initialModel}
      initialVersionId={initialVersionId}
      onDone={() => setInstance((i) => i + 1)}
    />
  );
}

function FormInner({
  initialModel,
  initialVersionId,
  onDone,
}: {
  initialModel: ModelOption | null;
  initialVersionId: number | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [model, setModel] = useState(initialModel);
  const [versionId, setVersionId] = useState(initialVersionId ?? initialModel?.versions[0]?.id ?? null);
  const [drafts, setDrafts] = useState<ImageDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drafts.length) return setError("이미지를 1장 이상 선택해 주세요.");
    if (drafts.some((d) => d.parsing)) return setError("이미지 정보를 읽는 중이에요. 잠시 후 다시 눌러 주세요.");
    setError(null);
    const fd = new FormData();
    if (model && versionId) fd.set("versionId", String(versionId));
    fd.set("imagesMeta", draftsToMeta(drafts));
    for (const d of drafts) fd.append("images", d.file, d.file.name);
    setProgress({ loaded: 0, total: 1 });
    const res = await uploadWithProgress<{ ids: number[] }>("/api/images", fd, (loaded, total) => setProgress({ loaded, total }));
    if (res.ok) {
      const ids = res.data.ids;
      router.push(model ? `/models/${model.id}?v=${versionId}` : ids.length === 1 ? `/images/${ids[0]}` : "/images");
      router.refresh();
      onDone();
      return;
    }
    setProgress(null);
    if (res.status === 401) return router.push(`/login?next=${encodeURIComponent("/images/new")}`);
    setError(res.data.error ?? "업로드하지 못했어요.");
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="card space-y-2 p-5 sm:p-6">
        <h2 className="font-bold">사용한 모델</h2>
        <p className="text-sm text-muted">
          모델을 고르면 그 모델 페이지의 커뮤니티 갤러리에 올라가요. 비워 두면 이미지 속 &ldquo;Model hash&rdquo; 로 등록된 체크포인트를
          자동으로 찾아 연결해요.
        </p>
        <ModelPicker
          value={model}
          versionId={versionId}
          onChange={(m, v) => {
            setModel(m);
            setVersionId(v);
          }}
        />
      </section>
      <section className="card p-5 sm:p-6">
        <ImageDrafts drafts={drafts} onChange={setDrafts} title="이미지" />
      </section>
      <div className="sticky bottom-0 -mx-4 border-t border-line bg-bg/90 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        {error && <p className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {progress ? (
          <UploadProgress loaded={progress.loaded} total={progress.total} />
        ) : (
          <button type="submit" className="btn btn-primary w-full py-3 text-base sm:w-auto sm:px-8">
            이미지 게시하기
          </button>
        )}
      </div>
    </form>
  );
}
