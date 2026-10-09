import { FormPage, FormSkeleton } from '../components/PageShell';
import { SignInRequired } from '../components/SignInRequired';
import { ModelUploadForm } from '../components/upload/ModelUploadForm';
import { useAuth } from '../lib/auth';
import { usePageTitle } from './NotFoundPage';

export function NewModelPage() {
  const { me, ready } = useAuth();
  usePageTitle('모델 업로드');
  return (
    <FormPage
      title="모델 업로드"
      desc="직접 학습하거나 병합한 모델을 공유해 보세요. 샘플 이미지의 프롬프트는 파일에서 자동으로 읽어요."
    >
      {!ready ? <FormSkeleton /> : me ? <ModelUploadForm mode="model" /> : <SignInRequired />}
    </FormPage>
  );
}
