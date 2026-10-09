import { apiPost } from '../../lib/api';
import { LIMITS } from '../../shared/constants';
import { emptyParams, hasGenerationData, type GenerationParams, type MetadataSource } from '../../shared/generation';
import { extractGenerationFromImage } from '../../shared/image-metadata';
import type {
  ImageInput,
  UploadImageRequest,
  UploadImageResponse,
  UploadModelFileRequest,
  UploadModelFileResponse,
  VersionInput,
} from '../../shared/types';
import { blobToBase64, prepareImage } from './image-prep';

export interface ImageDraft {
  key: string;
  file: File;
  previewUrl: string;
  meta: GenerationParams;
  source: MetadataSource | null;
  nsfw: boolean;
  parsing: boolean;
}

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

export function validateImageFile(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return `"${file.name}": PNG, JPEG, WebP 이미지만 올릴 수 있어요.`;
  if (file.size > LIMITS.imageBytes)
    return `"${file.name}": 이미지는 ${LIMITS.imageBytes / 1024 / 1024}MB 이하여야 해요.`;
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
export async function parseDraft(draft: ImageDraft): Promise<Pick<ImageDraft, 'meta' | 'source'>> {
  try {
    const bytes = new Uint8Array(await draft.file.arrayBuffer());
    const found = await extractGenerationFromImage(bytes);
    if (found) return { meta: found.params, source: found.source };
  } catch {
    // 읽지 못해도 직접 입력하면 된다
  }
  return { meta: emptyParams(), source: null };
}

/** 올라간 이미지 파일 정보 (생성 정보·성인 여부는 제출할 때 초안에서 다시 읽는다) */
export type UploadedImage = UploadImageResponse & { width: number; height: number; color: string | null };

/** 같은 폼에서 다시 제출할 때 이미 올린 파일은 다시 올리지 않도록 기억해 둔다 */
export interface UploadCache {
  images: Map<string, UploadedImage>;
  model: { file: File; result: UploadModelFileResponse } | null;
}

export function createUploadCache(): UploadCache {
  return { images: new Map(), model: null };
}

export interface UploadStep {
  done: number;
  total: number;
  label: string;
}

async function uploadImage(draft: ImageDraft): Promise<UploadedImage> {
  const prepared = await prepareImage(draft.file);
  const body: UploadImageRequest = {
    kind: 'image',
    data: prepared.data,
    contentType: prepared.contentType,
    thumb: prepared.thumb,
  };
  const res = await apiPost<UploadImageResponse>('/api/uploads', body);
  return {
    path: res.path,
    thumbPath: res.thumbPath,
    width: prepared.width,
    height: prepared.height,
    color: prepared.color,
  };
}

function draftToInput(d: ImageDraft, up: UploadedImage): ImageInput {
  return {
    path: up.path,
    thumbPath: up.thumbPath,
    width: up.width,
    height: up.height,
    color: up.color,
    meta: d.meta,
    source: d.source ?? (hasGenerationData(d.meta) ? 'manual' : null),
    nsfw: d.nsfw,
  };
}

/** 이미지를 한 장씩 차례로 준비·업로드한다. onStep(i) 는 i 번째 이미지를 시작할 때 불린다. */
export async function uploadDrafts(
  drafts: ImageDraft[],
  cache: UploadCache,
  onStep: (index: number) => void,
): Promise<ImageInput[]> {
  const out: ImageInput[] = [];
  for (const [i, d] of drafts.entries()) {
    onStep(i);
    let up = cache.images.get(d.key);
    if (!up) {
      up = await uploadImage(d);
      cache.images.set(d.key, up);
    }
    out.push(draftToInput(d, up));
  }
  return out;
}

/** 작은 모델 파일(임베딩, 워크플로 등)을 올린다 */
export async function uploadModelFile(file: File, cache: UploadCache): Promise<NonNullable<VersionInput['file']>> {
  if (file.size > LIMITS.uploadBytes) {
    throw new Error(
      `모델 파일은 ${LIMITS.uploadBytes / 1024 / 1024}MB 이하만 올릴 수 있어요. 용량이 큰 파일은 외부 링크로 등록해 주세요.`,
    );
  }
  let result = cache.model?.file === file ? cache.model.result : null;
  if (!result) {
    const body: UploadModelFileRequest = { kind: 'model', data: await blobToBase64(file), fileName: file.name };
    result = await apiPost<UploadModelFileResponse>('/api/uploads', body);
    cache.model = { file, result };
  }
  return { path: result.path, fileName: shortFileName(file.name), size: result.size, sha256: result.sha256 };
}

/** 서버는 파일 이름을 120자까지 받으므로 확장자를 남기고 줄인다 */
function shortFileName(name: string): string {
  if (name.length <= 120) return name;
  const ext = name.slice(name.lastIndexOf('.'));
  return name.slice(0, 120 - ext.length) + ext;
}
