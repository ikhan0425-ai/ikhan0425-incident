"use client";

import { LIMITS } from "@/lib/constants";
import { emptyParams, hasGenerationData, type GenerationParams, type MetadataSource } from "@/lib/generation";
import { extractGenerationFromImage } from "@/lib/image-metadata";

export interface ImageDraft {
  key: string;
  file: File;
  previewUrl: string;
  meta: GenerationParams;
  source: MetadataSource | null;
  nsfw: boolean;
  parsing: boolean;
}

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export function validateImageFile(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return `"${file.name}": PNG, JPEG, WebP 이미지만 올릴 수 있어요.`;
  if (file.size > LIMITS.imageBytes) return `"${file.name}": 이미지는 ${LIMITS.imageBytes / 1024 / 1024}MB 이하여야 해요.`;
  return null;
}

let counter = 0;
export function createDraft(file: File): ImageDraft {
  return {
    key: `${Date.now()}-${counter++}`,
    file,
    previewUrl: URL.createObjectURL(file),
    meta: emptyParams(),
    source: null,
    nsfw: false,
    parsing: true,
  };
}

/** 브라우저에서 바로 PNG/EXIF 메타데이터를 읽어 프롬프트·시드 등을 자동으로 채운다. */
export async function parseDraft(draft: ImageDraft): Promise<Pick<ImageDraft, "meta" | "source">> {
  try {
    const bytes = new Uint8Array(await draft.file.arrayBuffer());
    const found = await extractGenerationFromImage(bytes);
    if (found) return { meta: found.params, source: found.source };
  } catch {
    // 읽지 못해도 직접 입력하면 된다
  }
  return { meta: emptyParams(), source: null };
}

export function draftsToMeta(drafts: ImageDraft[]) {
  return JSON.stringify(
    drafts.map((d) => ({
      ...d.meta,
      source: d.source ?? (hasGenerationData(d.meta) ? "manual" : null),
      nsfw: d.nsfw,
    })),
  );
}

export interface UploadResult<T> {
  ok: boolean;
  status: number;
  data: T & { error?: string };
}

/** fetch 는 업로드 진행률을 알 수 없어서 XHR 을 쓴다. */
export function uploadWithProgress<T>(
  url: string,
  body: FormData,
  onProgress: (loaded: number, total: number) => void,
): Promise<UploadResult<T>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded, e.total);
    xhr.onload = () => {
      let data: T & { error?: string };
      try {
        data = JSON.parse(xhr.responseText) as T & { error?: string };
      } catch {
        data = { error: "서버 응답을 읽을 수 없어요." } as T & { error?: string };
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () =>
      resolve({ ok: false, status: 0, data: { error: "네트워크 오류로 업로드하지 못했어요." } as T & { error?: string } });
    xhr.send(body);
  });
}
