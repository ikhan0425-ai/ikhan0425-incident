import { useState } from 'react';
import { EyeIcon } from './icons';

export function NsfwReveal({ nsfw, children }: { nsfw: boolean; children: React.ReactNode }) {
  const [shown, setShown] = useState(!nsfw);
  if (shown) return <>{children}</>;
  return (
    <div className="relative overflow-hidden rounded-lg">
      <div className="pointer-events-none select-none blur-3xl" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 text-white">
        <span className="rounded-md bg-danger px-2 py-0.5 text-sm font-bold">19+</span>
        <p className="font-semibold">성인 콘텐츠로 표시된 이미지예요</p>
        <button type="button" className="btn btn-secondary" onClick={() => setShown(true)}>
          <EyeIcon size={15} /> 보기
        </button>
      </div>
    </div>
  );
}
