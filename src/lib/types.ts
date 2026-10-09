// 서버 → 클라이언트로 전달되는 직렬화 가능한 데이터 형태

import type { GenerationParams, MetadataSource } from "./generation";

export interface UserRef {
  username: string;
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
  id: number;
  name: string;
  type: string;
  nsfw: boolean;
  createdAt: number;
  baseModel: string | null;
  creator: UserRef;
  stats: { downloads: number; likes: number; images: number };
  cover: CoverImage | null;
}

export interface ImageCardData {
  id: number;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  color: string | null;
  nsfw: boolean;
  createdAt: number;
  user: UserRef;
  likes: number;
  likedByMe: boolean;
  model: { id: number; name: string; type: string; versionId: number | null; versionName: string | null } | null;
  meta: GenerationParams;
  metaSource: MetadataSource | null;
}

export interface ModelVersionData {
  id: number;
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
  id: number;
  name: string;
  type: string;
  description: string;
  nsfw: boolean;
  createdAt: number;
  updatedAt: number;
  creator: UserRef & { id: number };
  tags: string[];
  versions: ModelVersionData[];
  stats: { downloads: number; likes: number; images: number };
  likedByMe: boolean;
}

export interface Paged<T> {
  items: T[];
  hasMore: boolean;
}

export interface ModelOption {
  id: number;
  name: string;
  type: string;
  versions: { id: number; name: string; baseModel: string }[];
}
