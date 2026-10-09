"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatDate } from "@/lib/format";
import type { ImageCardData } from "@/lib/types";
import { Avatar } from "./Avatar";
import { TypeBadge } from "./Badges";
import { GenerationInfo } from "./GenerationInfo";
import { LikeButton } from "./LikeButton";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, ExternalLinkIcon, EyeIcon, XIcon } from "./icons";

function FullImage({ image }: { image: ImageCardData }) {
  const [loaded, setLoaded] = useState(false);
  // 썸네일을 먼저 보여 주고 원본이 로드되면 겹쳐서 교체한다 (둘 다 같은 상자에 object-contain)
  return (
    <div className="relative h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.thumbUrl}
        alt=""
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full object-contain blur-[2px] transition-opacity ${loaded ? "opacity-0" : "opacity-100"}`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={image.meta.prompt?.slice(0, 120) ?? "AI 생성 이미지"}
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

export function Lightbox({
  items,
  index,
  onClose,
  onIndexChange,
  onItemChange,
  revealed,
  onReveal,
  hideModelLink,
}: {
  items: ImageCardData[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  onItemChange?: (item: ImageCardData) => void;
  revealed: Set<number>;
  onReveal: (id: number) => void;
  hideModelLink?: boolean;
}) {
  const image = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1);
      else if (e.key === "ArrowRight" && hasNext) onIndexChange(index + 1);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [index, hasPrev, hasNext, onClose, onIndexChange]);

  if (!image) return null;
  const hidden = image.nsfw && !revealed.has(image.id);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="이미지 상세"
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 lg:flex-row"
    >
      {/* 이미지 영역 */}
      <div className="relative flex min-h-[45vh] flex-1 items-center justify-center p-3 lg:p-8" onClick={onClose}>
        <div className="h-full w-full" onClick={(e) => e.stopPropagation()}>
          {hidden ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-white">
              <span className="rounded-md bg-danger px-2 py-0.5 text-sm font-bold">19+</span>
              <p className="font-semibold">성인 콘텐츠로 표시된 이미지예요</p>
              <button type="button" className="btn btn-secondary" onClick={() => onReveal(image.id)}>
                <EyeIcon size={15} /> 보기
              </button>
            </div>
          ) : (
            <FullImage key={image.id} image={image} />
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <XIcon size={20} />
        </button>
        {hasPrev && (
          <button
            type="button"
            aria-label="이전 이미지"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange(index - 1);
            }}
            className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronLeftIcon size={22} />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            aria-label="다음 이미지"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange(index + 1);
            }}
            className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronRightIcon size={22} />
          </button>
        )}
        <span className="absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-0.5 text-xs text-white/80 backdrop-blur">
          {index + 1} / {items.length}
        </span>
      </div>

      {/* 정보 패널 */}
      <aside className="max-h-[55vh] w-full shrink-0 overflow-y-auto border-t border-line bg-surface lg:max-h-none lg:w-[420px] lg:border-l lg:border-t-0">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
          <Link href={`/users/${image.user.username}`} className="flex min-w-0 items-center gap-2.5 hover:opacity-90">
            <Avatar username={image.user.username} displayName={image.user.displayName} size={34} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{image.user.displayName}</span>
              <span className="block text-xs text-subtle">{formatDate(image.createdAt)}</span>
            </span>
          </Link>
          <LikeButton
            key={image.id}
            endpoint={`/api/images/${image.id}/like`}
            liked={image.likedByMe}
            count={image.likes}
            onChange={(liked, likes) => onItemChange?.({ ...image, likedByMe: liked, likes })}
          />
        </div>

        <div className="space-y-5 p-4">
          {image.model && !hideModelLink && (
            <Link
              href={`/models/${image.model.id}${image.model.versionId ? `?v=${image.model.versionId}` : ""}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 hover:border-surface-3"
            >
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold text-subtle">사용한 모델</span>
                <span className="block truncate text-sm font-bold">{image.model.name}</span>
                {image.model.versionName && <span className="text-xs text-muted">{image.model.versionName}</span>}
              </span>
              <TypeBadge type={image.model.type} />
            </Link>
          )}

          <GenerationInfo meta={image.meta} source={image.metaSource} />

          <div className="flex gap-2 border-t border-line pt-4">
            <Link href={`/images/${image.id}`} className="btn btn-secondary flex-1">
              <ExternalLinkIcon size={15} /> 상세 페이지
            </Link>
            <a href={`${image.url}?download=1`} className="btn btn-secondary flex-1" download>
              <DownloadIcon size={15} /> 원본 받기
            </a>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
