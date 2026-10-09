// 프론트엔드 ↔ 백엔드 API 계약. backend/shared/types.ts 와 내용이 같아야 한다.

import type { GenerationParams, MetadataSource } from './generation';

/** 사용자 참조. id 는 AppDeploy userId(UUID) 또는 샘플 사용자 'seed-...' */
export interface UserRef {
  id: string;
  displayName: string;
}

export interface CoverImage {
  thumbUrl: string;
  width: number;
  height: number;
  color: string | null;
  nsfw: boolean;
}

export interface ModelCardData {
  id: string;
  name: string;
  type: string;
  nsfw: boolean;
  createdAt: number;
  baseModel: string | null;
  creator: UserRef;
  stats: { downloads: number; likes: number; images: number };
  cover: CoverImage | null;
}

export interface ImageModelRef {
  id: string;
  name: string;
  type: string;
  versionId: string | null;
  versionName: string | null;
}

/** 목록용 이미지. meta 의 prompt/negativePrompt 는 길면 잘려 있고 extra 는 비어 있다. 전체는 상세 API 로. */
export interface ImageCardData {
  id: string;
  thumbUrl: string;
  width: number;
  height: number;
  color: string | null;
  nsfw: boolean;
  createdAt: number;
  user: UserRef;
  likes: number;
  likedByMe: boolean;
  model: ImageModelRef | null;
  meta: GenerationParams;
  metaSource: MetadataSource | null;
}

/** 상세 이미지: 원본 URL 과 전체 생성 정보 */
export interface ImageDetailData extends ImageCardData {
  url: string;
}

export interface ModelVersionData {
  id: string;
  name: string;
  baseModel: string;
  triggerWords: string[];
  description: string;
  fileName: string | null;
  fileSize: number | null;
  sha256: string | null;
  externalUrl: string | null;
  createdAt: number;
  downloads: number;
}

export interface ModelDetailData {
  id: string;
  name: string;
  type: string;
  description: string;
  nsfw: boolean;
  createdAt: number;
  updatedAt: number;
  creator: UserRef;
  tags: string[];
  versions: ModelVersionData[];
  stats: { downloads: number; likes: number; images: number };
  likedByMe: boolean;
}

export interface Paged<T> {
  items: T[];
  hasMore: boolean;
}

export interface ModelListResponse extends Paged<ModelCardData> {
  /** page=1 일 때만: 많이 쓰인 태그 */
  tags?: { name: string; count: number }[];
}

export interface ModelOption {
  id: string;
  name: string;
  type: string;
  versions: { id: string; name: string; baseModel: string }[];
}

export interface Profile {
  id: string;
  displayName: string;
  bio: string;
  createdAt: number;
  stats: { models: number; images: number; downloads: number; likes: number };
}

export interface Me {
  id: string;
  displayName: string;
}

// ---------------------------------------------------------------------------
// 요청 본문
// ---------------------------------------------------------------------------

export interface UploadImageRequest {
  kind: 'image';
  /** 원본 이미지 base64 (디코딩 후 3MB 이하) */
  data: string;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  /** 목록용 썸네일 WebP base64 */
  thumb: string;
}

export interface UploadModelFileRequest {
  kind: 'model';
  data: string;
  fileName: string;
}

export interface UploadImageResponse {
  path: string;
  thumbPath: string;
}

export interface UploadModelFileResponse {
  path: string;
  size: number;
  sha256: string;
}

export interface ImageInput {
  path: string;
  thumbPath: string;
  width: number;
  height: number;
  color: string | null;
  meta: GenerationParams;
  source: MetadataSource | null;
  nsfw: boolean;
}

export interface VersionInput {
  name: string;
  baseModel: string;
  triggerWords: string[];
  description: string;
  externalUrl: string | null;
  file: { path: string; fileName: string; size: number; sha256: string } | null;
}

export interface CreateModelRequest {
  name: string;
  type: string;
  description: string;
  tags: string[];
  nsfw: boolean;
  version: VersionInput;
  images: ImageInput[];
}

export interface CreateVersionRequest {
  version: VersionInput;
  images: ImageInput[];
}

export interface PostImagesRequest {
  modelId: string | null;
  versionId: string | null;
  images: ImageInput[];
}
