"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BASE_MODELS, LIMITS, MODEL_TYPES } from "@/lib/constants";
import { ImageDrafts } from "./ImageDrafts";
import { ModelFileInput, TagInput, UploadProgress } from "./Fields";
import { draftsToMeta, uploadWithProgress, type ImageDraft } from "./upload-utils";

type Props =
  | { mode: "model"; maxModelBytes: number }
  | { mode: "version"; maxModelBytes: number; model: { id: number; name: string; latestBase: string | null } };

function Section({ step, title, desc, children }: { step: number; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/20 text-sm font-bold text-accent">{step}</span>
        <div>
          <h2 className="font-bold">{title}</h2>
          {desc && <p className="mt-0.5 text-sm text-muted">{desc}</p>}
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

/**
 * 모델 업로드 (새 모델 + 첫 버전) / 기존 모델에 새 버전 추가 공용 폼.
 * 페이지를 떠나도 화면 상태가 보존되므로(Activity), 업로드가 끝나면 key 를 바꿔 폼을 초기화한다.
 */
export function ModelUploadForm(props: Props) {
  const [instance, setInstance] = useState(0);
  return <FormInner key={instance} {...props} onDone={() => setInstance((i) => i + 1)} />;
}

function FormInner(props: Props & { onDone: () => void }) {
  const router = useRouter();
  const isVersion = props.mode === "version";
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [nsfw, setNsfw] = useState(false);
  const [versionName, setVersionName] = useState(isVersion ? "" : "v1.0");
  const [baseModel, setBaseModel] = useState<string>(isVersion ? (props.model.latestBase ?? "") : "");
  const [triggerWords, setTriggerWords] = useState("");
  const [versionDescription, setVersionDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [drafts, setDrafts] = useState<ImageDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);

  const validate = (): string | null => {
    if (!isVersion) {
      if (name.trim().length < 2) return "모델 이름을 2자 이상 입력해 주세요.";
      if (!type) return "모델 종류를 선택해 주세요.";
    } else if (!versionName.trim()) return "버전 이름을 입력해 주세요.";
    if (!baseModel) return "베이스 모델을 선택해 주세요.";
    if (!file && !externalUrl.trim()) return "모델 파일을 올리거나 외부 다운로드 링크를 입력해 주세요.";
    if (!drafts.length) return "샘플 이미지를 1장 이상 올려 주세요.";
    if (drafts.some((d) => d.parsing)) return "이미지 정보를 읽는 중이에요. 잠시 후 다시 눌러 주세요.";
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    setError(err);
    if (err) return;

    const fd = new FormData();
    if (!isVersion) {
      fd.set("name", name.trim());
      fd.set("type", type);
      fd.set("description", description);
      fd.set("tags", JSON.stringify(tags));
      fd.set("nsfw", nsfw ? "1" : "0");
    }
    fd.set("versionName", versionName.trim());
    fd.set("baseModel", baseModel);
    fd.set("triggerWords", triggerWords);
    fd.set("versionDescription", versionDescription);
    if (externalUrl.trim()) fd.set("externalUrl", externalUrl.trim());
    fd.set("imagesMeta", draftsToMeta(drafts));
    // 텍스트 필드를 먼저 보내고 파일은 마지막에
    for (const d of drafts) fd.append("images", d.file, d.file.name);
    if (file) fd.append("modelFile", file, file.name);

    setProgress({ loaded: 0, total: 1 });
    const url = isVersion ? `/api/models/${props.model.id}/versions` : "/api/models";
    const res = await uploadWithProgress<{ id: number; versionId?: number }>(url, fd, (loaded, total) =>
      setProgress({ loaded, total }),
    );
    if (res.ok) {
      router.push(`/models/${res.data.id}${res.data.versionId ? `?v=${res.data.versionId}` : ""}`);
      router.refresh();
      props.onDone();
      return;
    }
    setProgress(null);
    if (res.status === 401) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setError(res.data.error ?? "업로드하지 못했어요.");
  };

  let step = 0;
  return (
    <form onSubmit={submit} className="space-y-5">
      {!isVersion && (
        <Section step={++step} title="기본 정보" desc="어떤 모델인지 알려 주세요.">
          <div>
            <label className="label" htmlFor="name">
              모델 이름
            </label>
            <input
              id="name"
              className="input"
              value={name}
              maxLength={LIMITS.nameLength}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 한복 스타일 LoRA"
            />
          </div>
          <div>
            <span className="label">종류</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MODEL_TYPES.map((t) => (
                <label
                  key={t.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                    type === t.value ? "border-accent bg-accent/15" : "border-line bg-surface hover:border-surface-3"
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value={t.value}
                    checked={type === t.value}
                    onChange={() => setType(t.value)}
                    className="sr-only"
                  />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <span className="label">태그</span>
            <TagInput value={tags} onChange={setTags} />
          </div>
          <div>
            <label className="label" htmlFor="description">
              설명
            </label>
            <textarea
              id="description"
              className="input min-h-32"
              value={description}
              maxLength={LIMITS.descriptionLength}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="추천 설정(샘플러, CFG, 가중치), 학습 데이터, 사용 시 주의할 점 등을 적어 주세요."
            />
          </div>
          <label className="flex items-start gap-2.5 rounded-lg border border-line bg-surface p-3 text-sm">
            <input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="font-semibold">성인(19+) 콘텐츠를 포함해요</span>
              <span className="block text-xs text-muted">체크하면 목록에서 썸네일이 흐리게 보여요.</span>
            </span>
          </label>
        </Section>
      )}

      <Section
        step={++step}
        title={isVersion ? `"${props.model.name}" 새 버전` : "버전 & 파일"}
        desc="버전별로 베이스 모델과 트리거 단어를 다르게 지정할 수 있어요."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="versionName">
              버전 이름
            </label>
            <input
              id="versionName"
              className="input"
              value={versionName}
              maxLength={50}
              onChange={(e) => setVersionName(e.target.value)}
              placeholder="예: v2.0"
            />
          </div>
          <div>
            <label className="label" htmlFor="triggerWords">
              트리거 단어 <span className="font-normal text-subtle">(쉼표로 구분)</span>
            </label>
            <input
              id="triggerWords"
              className="input font-mono"
              value={triggerWords}
              onChange={(e) => setTriggerWords(e.target.value)}
              placeholder="hanbok, korean traditional clothes"
            />
          </div>
        </div>
        <div>
          <span className="label">베이스 모델</span>
          <div className="flex flex-wrap gap-1.5">
            {BASE_MODELS.map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={baseModel === b}
                onClick={() => setBaseModel(b)}
                className={`chip font-semibold ${baseModel === b ? "chip-active" : ""}`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">모델 파일</span>
          <ModelFileInput
            file={file}
            onFile={setFile}
            externalUrl={externalUrl}
            onExternalUrl={setExternalUrl}
            maxBytes={props.maxModelBytes}
          />
        </div>
        <div>
          <label className="label" htmlFor="versionDescription">
            버전 메모 <span className="font-normal text-subtle">(선택)</span>
          </label>
          <textarea
            id="versionDescription"
            className="input min-h-20"
            value={versionDescription}
            onChange={(e) => setVersionDescription(e.target.value)}
            placeholder="이전 버전과 달라진 점"
          />
        </div>
      </Section>

      <Section
        step={++step}
        title="샘플 이미지"
        desc="이 모델로 만든 결과물을 올려 주세요. 첫 번째 이미지가 대표 썸네일이 돼요."
      >
        <ImageDrafts drafts={drafts} onChange={setDrafts} title="샘플 이미지" />
      </Section>

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-bg/90 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        {error && <p className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {progress ? (
          <UploadProgress loaded={progress.loaded} total={progress.total} />
        ) : (
          <button type="submit" className="btn btn-primary w-full py-3 text-base sm:w-auto sm:px-8">
            {isVersion ? "버전 추가하기" : "모델 올리기"}
          </button>
        )}
      </div>
    </form>
  );
}
