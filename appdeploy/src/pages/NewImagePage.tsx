import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FormPage, FormSkeleton } from '../components/PageShell';
import { SignInRequired } from '../components/SignInRequired';
import { ImageUploadForm } from '../components/upload/ImageUploadForm';
import { apiGet } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { ModelOption } from '../shared/types';
import { usePageTitle } from './NotFoundPage';

interface Initial {
  key: string;
  model: ModelOption | null;
  versionId: string | null;
}

export function NewImagePage() {
  const { me, ready } = useAuth();
  const [params] = useSearchParams();
  const modelId = params.get('modelId') ?? '';
  const versionId = params.get('versionId') ?? '';
  const key = `${modelId}:${versionId}`;
  const [loaded, setLoaded] = useState<Initial | null>(null);
  usePageTitle('이미지 올리기');

  // 모델 페이지의 "이미지 올리기" 로 들어오면 그 모델·버전을 미리 골라 둔다
  useEffect(() => {
    if (!modelId) return;
    let alive = true;
    apiGet<{ items: ModelOption[] }>(`/api/model-options?modelId=${encodeURIComponent(modelId)}`)
      .then(
        (res) => res.items[0] ?? null,
        () => null,
      )
      .then((model) => {
        if (!alive) return;
        const version = model?.versions.find((v) => v.id === versionId) ?? null;
        setLoaded({ key, model, versionId: version?.id ?? null });
      });
    return () => {
      alive = false;
    };
  }, [key, modelId, versionId]);

  const initial: Initial | null = !modelId
    ? { key, model: null, versionId: null }
    : loaded?.key === key
      ? loaded
      : null;

  return (
    <FormPage
      title="이미지 올리기"
      desc="AI 로 만든 그림을 공유하세요. 원본 PNG 를 올리면 프롬프트·시드·샘플러가 자동으로 채워져요."
    >
      {!ready ? (
        <FormSkeleton />
      ) : !me ? (
        <SignInRequired />
      ) : !initial ? (
        <FormSkeleton />
      ) : (
        <ImageUploadForm key={key} initialModel={initial.model} initialVersionId={initial.versionId} />
      )}
    </FormPage>
  );
}
