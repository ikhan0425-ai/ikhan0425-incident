import { Link, useSearchParams } from 'react-router-dom';
import { ImageFeed } from '../components/ImageFeed';
import { PlusIcon } from '../components/icons';
import { parseImageFilters } from '../shared/filters';
import { usePageTitle } from './NotFoundPage';

export function ImagesPage() {
  const [searchParams] = useSearchParams();
  const filters = parseImageFilters(searchParams);
  usePageTitle('이미지');

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">이미지</h1>
          <p className="mt-1 text-sm text-muted">
            마우스를 올리면 프롬프트·샘플러·시드가, 클릭하면 전체 생성 정보가 보여요.
          </p>
        </div>
        <Link to="/images/new" className="btn btn-primary">
          <PlusIcon size={15} /> 이미지 올리기
        </Link>
      </div>
      <ImageFeed filters={filters} />
    </div>
  );
}
