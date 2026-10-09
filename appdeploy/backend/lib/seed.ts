// 샘플 데이터(정적)를 카탈로그 요약 형태로 바꾼다. 시간은 요청 시점 기준 "며칠 전"으로 계산한다.

import { SEED } from '../seed-data';
import type { GenerationParams, MetadataSource } from '../shared/generation';
import { previewOf, type ImageSummary, type ModelSummary } from './catalog';
import { DAY } from './time';
import type { SeedImage, SeedModel, SeedProfile, SeedStat } from './seed-types';

export const isSeedId = (id: string) => id.startsWith('seed-');

const profiles = new Map<string, SeedProfile>(SEED.profiles.map((p) => [p.id, p]));
const models = new Map<string, SeedModel>(SEED.models.map((m) => [m.id, m]));
const images = new Map<string, SeedImage>(SEED.images.map((i) => [i.id, i]));

export function seedProfileNames(): string[] {
  return SEED.profiles.map((p) => p.displayName);
}

export function seedProfile(id: string): SeedProfile | undefined {
  return profiles.get(id);
}

export function seedModel(id: string): SeedModel | undefined {
  return models.get(id);
}

export function seedImage(id: string): SeedImage | undefined {
  return images.get(id);
}

const ago = (now: number, days: number) => Math.round(now - days * DAY);

export function seedModelSummaries(now: number): ModelSummary[] {
  return SEED.models.map((m) => ({
    id: m.id,
    ownerId: m.ownerId,
    ownerName: profiles.get(m.ownerId)?.displayName ?? '그림터',
    name: m.name,
    type: m.type,
    nsfw: m.nsfw,
    tags: m.tags,
    createdAt: ago(now, m.ageDays),
    updatedAt: ago(now, m.updatedAgeDays),
    versions: m.versions
      .map((v) => ({
        id: v.id,
        name: v.name,
        baseModel: v.baseModel,
        sha10: v.sha256.slice(0, 10),
        createdAt: ago(now, v.ageDays),
      }))
      .sort((a, b) => a.createdAt - b.createdAt),
  }));
}

export function seedImageSummaries(now: number): ImageSummary[] {
  return SEED.images.map((i) => ({
    id: i.id,
    ownerId: i.ownerId,
    ownerName: profiles.get(i.ownerId)?.displayName ?? '그림터',
    modelId: i.modelId,
    versionId: i.versionId,
    thumb: i.thumb,
    width: i.width,
    height: i.height,
    color: i.color,
    nsfw: i.nsfw,
    createdAt: ago(now, i.ageDays),
    meta: previewOf(i.meta),
    source: i.source,
  }));
}

export function seedImageFull(
  id: string,
): { file: string; meta: GenerationParams; source: MetadataSource | null } | null {
  const i = images.get(id);
  return i ? { file: i.file, meta: i.meta, source: i.source } : null;
}

export function seedModelDownloads(id: string): SeedStat | undefined {
  return SEED.modelDownloads[id];
}

export function seedModelLikes(id: string): SeedStat | undefined {
  return SEED.modelLikes[id];
}

export function seedImageLikes(id: string): SeedStat | undefined {
  return SEED.imageLikes[id];
}
