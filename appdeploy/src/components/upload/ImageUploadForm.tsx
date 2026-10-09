import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiGet, apiPost, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { modelTypeInfo } from '../../shared/constants';
import type { ModelOption, PostImagesRequest } from '../../shared/types';
import { TypeBadge } from '../Badges';
import { SearchIcon, XIcon } from '../icons';
import { ImageDrafts } from './ImageDrafts';
import { UploadProgress } from './Fields';
import { createUploadCache, uploadDrafts, type ImageDraft, type UploadStep } from './upload-utils';

function ModelPicker({
  value,
  versionId,
  onChange,
}: {
  value: ModelOption | null;
  versionId: string | null;
  onChange: (model: ModelOption | null, versionId: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ModelOption[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const res = await apiGet<{ items: ModelOption[] }>(`/api/model-options?q=${encodeURIComponent(q.trim())}`);
        if (alive) setResults(res.items);
      } catch {
        // 검색 실패는 조용히 넘긴다
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, open]);

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
        <TypeBadge type={value.type} />
        <span className="min-w-0 flex-1 truncate font-semibold">{value.name}</span>
        <select
          className="input w-auto py-1.5"
          value={versionId ?? ''}
          onChange={(e) => onChange(value, e.target.value)}
          aria-label="버전"
        >
          {value.versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} · {v.baseModel}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-ghost p-1.5"
          aria-label="모델 선택 해제"
          onClick={() => onChange(null, null)}
        >
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

export function ImageUploadForm({
  initialModel,
  initialVersionId,
}: {
  initialModel: ModelOption | null;
  initialVersionId: string | null;
}) {
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
  initialVersionId: string | null;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [model, setModel] = useState(initialModel);
  const [versionId, setVersionId] = useState(initialVersionId ?? initialModel?.versions[0]?.id ?? null);
  const [drafts, setDrafts] = useState<ImageDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadStep | null>(null);
  const busy = useRef(false);
  // 저장에 실패해 다시 누르면 이미 올린 이미지는 건너뛴다
  const cache = useRef(createUploadCache());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    if (!drafts.length) return setError('이미지를 1장 이상 선택해 주세요.');
    if (drafts.some((d) => d.parsing)) return setError('이미지 정보를 읽는 중이에요. 잠시 후 다시 눌러 주세요.');
    setError(null);

    busy.current = true;
    const list = drafts;
    const total = list.length + 1;
    try {
      const images = await uploadDrafts(list, cache.current, (i) =>
        setProgress({ done: i, total, label: `이미지 업로드 중 ${i + 1}/${list.length}` }),
      );
      setProgress({ done: total - 1, total, label: '저장하는 중…' });
      const chosen = model && versionId ? { modelId: model.id, versionId } : null;
      const body: PostImagesRequest = {
        modelId: chosen?.modelId ?? null,
        versionId: chosen?.versionId ?? null,
        images,
      };
      const { ids } = await apiPost<{ ids: string[] }>('/api/images', body);
      navigate(
        chosen ? `/models/${chosen.modelId}?v=${chosen.versionId}` : ids.length === 1 ? `/images/${ids[0]}` : '/images',
      );
      onDone();
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

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={progress !== null} className="min-w-0 space-y-5">
        <section className="card space-y-2 p-5 sm:p-6">
          <h2 className="font-bold">사용한 모델</h2>
          <p className="text-sm text-muted">
            모델을 고르면 그 모델 페이지의 커뮤니티 갤러리에 올라가요. 비워 두면 이미지 속 &ldquo;Model hash&rdquo; 로
            등록된 체크포인트를 자동으로 찾아 연결해요.
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
          <ImageDrafts drafts={drafts} onChange={setDrafts} title="이미지" disabled={progress !== null} />
        </section>
      </fieldset>
      <div className="sticky bottom-0 -mx-4 border-t border-line bg-bg/90 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        {error && (
          <p className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}
        {progress ? (
          <UploadProgress done={progress.done} total={progress.total} label={progress.label} />
        ) : (
          <button type="submit" className="btn btn-primary w-full py-3 text-base sm:w-auto sm:px-8">
            이미지 게시하기
          </button>
        )}
      </div>
    </form>
  );
}
