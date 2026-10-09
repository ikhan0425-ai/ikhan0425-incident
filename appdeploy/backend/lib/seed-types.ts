// 샘플 데이터(backend/seed-data.ts)의 형태. 시간 값은 모두 "며칠 전" 상대값이다.

import type { GenerationParams, MetadataSource } from '../shared/generation';

export interface SeedProfile {
  id: string;
  displayName: string;
  bio: string;
  ageDays: number;
}

export interface SeedVersion {
  id: string;
  name: string;
  baseModel: string;
  triggerWords: string[];
  description: string;
  fileName: string;
  fileSize: number;
  sha256: string;
  externalUrl: string | null;
  /** 프론트엔드 정적 파일 경로 (예: seed/files/x.safetensors) */
  file: string;
  ageDays: number;
}

export interface SeedModel {
  id: string;
  ownerId: string;
  name: string;
  type: string;
  description: string;
  nsfw: boolean;
  tags: string[];
  ageDays: number;
  updatedAgeDays: number;
  versions: SeedVersion[];
}

export interface SeedImage {
  id: string;
  ownerId: string;
  modelId: string | null;
  versionId: string | null;
  /** 프론트엔드 정적 파일 경로 */
  file: string;
  thumb: string;
  width: number;
  height: number;
  color: string | null;
  meta: GenerationParams;
  source: MetadataSource | null;
  nsfw: boolean;
  ageDays: number;
}

export interface SeedStat {
  total: number;
  /** 며칠 전(0~30) → 횟수 */
  days: Record<string, number>;
  /** 몇 달 전(0~11) → 횟수 */
  months: Record<string, number>;
}

export interface SeedData {
  profiles: SeedProfile[];
  models: SeedModel[];
  images: SeedImage[];
  modelDownloads: Record<string, SeedStat>;
  modelLikes: Record<string, SeedStat>;
  imageLikes: Record<string, SeedStat>;
}
