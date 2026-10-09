import { useState } from 'react';
import { formatCount } from '../shared/format';
import { hasGenerationData } from '../shared/generation';
import type { ImageCardData } from '../shared/types';
import { CopyButton } from './CopyButton';
import { EyeIcon, HeartIcon, InfoIcon } from './icons';

function Chip({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === '') return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-white/12 px-1.5 py-0.5 text-[11px] text-white/90 backdrop-blur">
      <span className="text-white/55">{label}</span>
      <span className="truncate font-semibold">{value}</span>
    </span>
  );
}

/**
 * 갤러리 이미지 카드. 마우스를 올리면(터치 기기는 ⓘ 버튼) 프롬프트·네거티브·샘플러·스텝·CFG·시드가 겹쳐 보인다.
 * 클릭하면 라이트박스가 열린다.
 */
export function ImageCard({
  image,
  onOpen,
  revealed,
  onReveal,
  fixedHeight,
}: {
  image: ImageCardData;
  onOpen: () => void;
  revealed: boolean;
  onReveal: () => void;
  /** 가로 스크롤 목록처럼 높이를 고정할 때 (px) */
  fixedHeight?: number;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const m = image.meta;
  const hidden = image.nsfw && !revealed;
  const hasMeta = hasGenerationData(m);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={m.prompt ? `이미지: ${m.prompt.slice(0, 60)}` : '이미지 크게 보기'}
      onClick={() => (hidden ? onReveal() : onOpen())}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (hidden) onReveal();
          else onOpen();
        }
      }}
      onMouseLeave={() => setShowInfo(false)}
      className="group relative block w-full cursor-zoom-in overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line"
      style={
        fixedHeight
          ? {
              height: fixedHeight,
              width: (fixedHeight * image.width) / image.height,
              backgroundColor: image.color ?? undefined,
            }
          : { aspectRatio: `${image.width} / ${image.height}`, backgroundColor: image.color ?? undefined }
      }
    >
      <img
        src={image.thumbUrl}
        alt=""
        loading="lazy"
        decoding="async"
        width={image.width}
        height={image.height}
        className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] ${
          hidden ? 'scale-110 blur-2xl' : ''
        }`}
      />

      {hidden ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 p-3 text-center text-white">
          <span className="rounded-md bg-danger px-2 py-0.5 text-xs font-bold">19+</span>
          <span className="text-sm font-semibold">성인 콘텐츠</span>
          <span className="flex items-center gap-1 text-xs text-white/75">
            <EyeIcon size={13} /> 눌러서 보기
          </span>
        </div>
      ) : (
        <>
          {/* 생성 정보 오버레이 */}
          <div
            className={`pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/65 to-transparent p-3 transition-opacity duration-200 ${
              showInfo ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            {hasMeta ? (
              <div className="max-h-full space-y-1.5 overflow-hidden">
                {m.prompt && <p className="prompt-text line-clamp-4 text-xs leading-snug text-white">{m.prompt}</p>}
                {m.negativePrompt && (
                  <p className="prompt-text line-clamp-2 text-[11px] leading-snug text-white/65">
                    <span className="mr-1 font-bold text-[#ff8f8f]">Negative</span>
                    {m.negativePrompt}
                  </p>
                )}
                <div className="flex flex-wrap gap-1 pt-0.5">
                  <Chip label="Sampler" value={m.sampler} />
                  <Chip label="Steps" value={m.steps} />
                  <Chip label="CFG" value={m.cfgScale} />
                  <Chip label="Seed" value={m.seed} />
                </div>
                {m.prompt && (
                  <div className="pointer-events-auto pt-0.5">
                    <CopyButton
                      text={m.prompt}
                      label="프롬프트 복사"
                      className="bg-white/12 text-white hover:bg-white/25 hover:text-white"
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-white/70">생성 정보 없음</p>
            )}
          </div>

          {/* 터치 기기용 정보 버튼 */}
          <button
            type="button"
            aria-label="생성 정보 보기"
            aria-pressed={showInfo}
            onClick={(e) => {
              e.stopPropagation();
              setShowInfo((s) => !s);
            }}
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <InfoIcon size={15} />
          </button>

          {image.likes > 0 && (
            <span
              className={`pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur transition-opacity ${
                showInfo ? 'opacity-0' : 'group-hover:opacity-0'
              }`}
            >
              <HeartIcon size={11} filled={image.likedByMe} /> {formatCount(image.likes)}
            </span>
          )}
        </>
      )}
    </div>
  );
}
