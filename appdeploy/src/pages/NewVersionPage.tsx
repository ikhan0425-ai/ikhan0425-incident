import { useParams } from 'react-router-dom';
import { FormPage, FormSkeleton } from '../components/PageShell';
import { SignInRequired } from '../components/SignInRequired';
import { ModelUploadForm } from '../components/upload/ModelUploadForm';
import { useAuth } from '../lib/auth';
import type { ModelDetailData } from '../shared/types';
import { isNotFound, NotFoundPage, PageError, usePageData, usePageTitle } from './NotFoundPage';

export function NewVersionPage() {
  const { id = '' } = useParams();
  const { me, ready } = useAuth();
  // 로그인한 뒤에만 모델을 불러와 제작자인지 확인한다
  const { data, error, retry } = usePageData<{ model: ModelDetailData }>(
    ready && me ? `/api/models/${encodeURIComponent(id)}` : null,
  );
  usePageTitle('새 버전 추가');

  if (me && isNotFound(error)) return <NotFoundPage />;

  const model = data?.model ?? null;
  let body;
  if (!ready) body = <FormSkeleton />;
  else if (!me) body = <SignInRequired />;
  else if (error) body = <PageError error={error} onRetry={retry} />;
  else if (!model) body = <FormSkeleton />;
  else if (model.creator.id !== me.id)
    body = <p className="card p-6 text-sm text-muted">모델 제작자만 새 버전을 추가할 수 있어요.</p>;
  else {
    body = (
      <ModelUploadForm
        key={model.id}
        mode="version"
        model={{ id: model.id, name: model.name, latestBase: model.versions[0]?.baseModel ?? null }}
      />
    );
  }

  return (
    <FormPage title="새 버전 추가" desc="개선한 모델을 새 버전으로 올리면 기존 다운로드·좋아요는 그대로 유지돼요.">
      {body}
    </FormPage>
  );
}
