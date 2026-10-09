import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiPost, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { BASE_MODELS, LIMITS, MODEL_TYPES } from '../../shared/constants';
import type { CreateModelRequest, CreateVersionRequest, VersionInput } from '../../shared/types';
import { ImageDrafts } from './ImageDrafts';
import { ModelFileInput, TagInput, UploadProgress } from './Fields';
import { createUploadCache, uploadDrafts, uploadModelFile, type ImageDraft, type UploadStep } from './upload-utils';

type Props = { mode: 'model' } | { mode: 'version'; model: { id: string; name: string; latestBase: string | null } };

function Section({ step, title, desc, children }: { step: number; title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/20 text-sm font-bold text-accent">
          {step}
        </span>
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
 * 업로드가 끝나면 key 를 바꿔 폼을 초기화한다.
 */
export function ModelUploadForm(props: Props) {
  const [instance, setInstance] = useState(0);
  return <FormInner key={instance} {...props} onDone={() => setInstance((i) => i + 1)} />;
}

function FormInner(props: Props & { onDone: () => void }) {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const isVersion = props.mode === 'version';
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [nsfw, setNsfw] = useState(false);
  const [versionName, setVersionName] = useState(isVersion ? '' : 'v1.0');
  const [baseModel, setBaseModel] = useState<string>(isVersion ? (props.model.latestBase ?? '') : '');
  const [triggerWords, setTriggerWords] = useState('');
  const [versionDescription, setVersionDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState('');
  const [drafts, setDrafts] = useState<ImageDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadStep | null>(null);
  const busy = useRef(false);
  // 저장에 실패해 다시 누르면 이미 올린 파일은 건너뛴다
  const cache = useRef(createUploadCache());

  const validate = (): string | null => {
    if (!isVersion) {
      if (name.trim().length < 2) return '모델 이름을 2자 이상 입력해 주세요.';
      if (!type) return '모델 종류를 선택해 주세요.';
    } else if (!versionName.trim()) return '버전 이름을 입력해 주세요.';
    if (!baseModel) return '베이스 모델을 선택해 주세요.';
    if (!file && !externalUrl.trim()) return '모델 파일을 올리거나 외부 다운로드 링크를 입력해 주세요.';
    if (!file && !/^https?:\/\/\S+$/i.test(externalUrl.trim())) return '외부 다운로드 링크는 http(s) 주소여야 해요.';
    if (!drafts.length) return '샘플 이미지를 1장 이상 올려 주세요.';
    if (drafts.some((d) => d.parsing)) return '이미지 정보를 읽는 중이에요. 잠시 후 다시 눌러 주세요.';
    return null;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    const err = validate();
    setError(err);
    if (err) return;

    busy.current = true;
    const list = drafts;
    const total = list.length + (file ? 1 : 0) + 1;
    try {
      // 이미지 → 모델 파일 → 저장 순서로 한 단계씩
      const images = await uploadDrafts(list, cache.current, (i) =>
        setProgress({ done: i, total, label: `이미지 업로드 중 ${i + 1}/${list.length}` }),
      );
      let uploaded: VersionInput['file'] = null;
      if (file) {
        setProgress({ done: list.length, total, label: '모델 파일 업로드 중' });
        uploaded = await uploadModelFile(file, cache.current);
      }
      setProgress({ done: total - 1, total, label: '저장하는 중…' });
      const version: VersionInput = {
        name: versionName.trim(),
        baseModel,
        triggerWords: triggerWords
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        description: versionDescription,
        externalUrl: uploaded ? null : externalUrl.trim() || null,
        file: uploaded,
      };
      if (props.mode === 'version') {
        const body: CreateVersionRequest = { version, images };
        const res = await apiPost<{ id: string; versionId: string }>(
          `/api/models/${encodeURIComponent(props.model.id)}/versions`,
          body,
        );
        navigate(`/models/${res.id}?v=${res.versionId}`);
      } else {
        const body: CreateModelRequest = { name: name.trim(), type, description, tags, nsfw, version, images };
        const res = await apiPost<{ id: string; versionId: string }>('/api/models', body);
        navigate(`/models/${res.id}`);
      }
      props.onDone();
    } catch (e) {
      setProgress(null);
      if (e instanceof ApiError && e.code === 'auth_required') {
        setError('로그인이 필요해요. 로그인한 뒤 다시 눌러 주세요.');
        void signIn();
      } else {
        setError(errorMessage(e) || '업로드하지 못했어요.');
      }
    } finally {
      busy.current = false;
    }
  };

  let step = 0;
  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={progress !== null} className="min-w-0 space-y-5">
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
                      type === t.value ? 'border-accent bg-accent/15' : 'border-line bg-surface hover:border-surface-3'
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
          title={isVersion ? `"${props.model.name}" 새 버전` : '버전 & 파일'}
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
                  className={`chip font-semibold ${baseModel === b ? 'chip-active' : ''}`}
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
              maxBytes={LIMITS.uploadBytes}
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
          <ImageDrafts drafts={drafts} onChange={setDrafts} title="샘플 이미지" disabled={progress !== null} />
        </Section>
      </fieldset>

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-bg/90 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        {error && (
          <p className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}
        {progress ? (
          <UploadProgress done={progress.done} total={progress.total} label={progress.label} />
        ) : (
          <button type="submit" className="btn btn-primary w-full py-3 text-base sm:w-auto sm:px-8">
            {isVersion ? '버전 추가하기' : '모델 올리기'}
          </button>
        )}
      </div>
    </form>
  );
}
