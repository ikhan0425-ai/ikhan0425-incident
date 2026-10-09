import { useSearchParams } from 'react-router-dom';
import { ModelBrowser } from '../components/ModelBrowser';
import { parseModelFilters } from '../shared/filters';
import { usePageTitle } from './NotFoundPage';

export function HomePage() {
  const [searchParams] = useSearchParams();
  const filters = parseModelFilters(searchParams);
  usePageTitle(null);

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">모델 둘러보기</h1>
        <p className="mt-1 text-sm text-muted">
          체크포인트, LoRA, VAE, ControlNet… 사람들이 직접 만든 AI 그림 모델을 찾고, 결과물의 프롬프트까지 확인해 보세요.
        </p>
      </div>
      {/* ModelBrowser 가 필터별로 결과를 다시 불러오므로 key 를 주지 않는다 (드롭다운·태그 스크롤 유지) */}
      <ModelBrowser filters={filters} />
    </div>
  );
}
