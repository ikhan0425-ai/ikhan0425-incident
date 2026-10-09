// 카탈로그 + 샘플 데이터 + 전체 레코드를 합쳐 API 응답 형태로 만든다.

import { db, storage } from '@appdeploy/sdk';
import type { Period } from '../shared/constants';
import type { GenerationParams, MetadataSource } from '../shared/generation';
import type { ImageCardData, ImageDetailData, ModelCardData, ModelDetailData, ModelVersionData, UserRef } from '../shared/types';
import { Catalog, type ImageSummary, type ModelSummary } from './catalog';
import {
  isSeedId,
  seedImageFull,
  seedImageLikes,
  seedImageSummaries,
  seedModel,
  seedModelDownloads,
  seedModelLikes,
  seedModelSummaries,
  seedProfile,
} from './seed';
import { counterInPeriod, seedInPeriod } from './time';

// ---------------------------------------------------------------------------
// DB 전체 레코드
// ---------------------------------------------------------------------------

export interface VersionRecord {
  id: string;
  name: string;
  baseModel: string;
  triggerWords: string[];
  description: string;
  externalUrl: string | null;
  file: { path: string; fileName: string; size: number; sha256: string } | null;
  createdAt: number;
}

export interface ModelRecord {
  ownerId: string;
  ownerName: string;
  name: string;
  type: string;
  description: string;
  nsfw: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  versions: VersionRecord[];
}

export interface ImageRecord {
  ownerId: string;
  modelId: string | null;
  versionId: string | null;
  file: string;
  thumb: string;
  width: number;
  height: number;
  color: string | null;
  meta: GenerationParams;
  source: MetadataSource | null;
  nsfw: boolean;
  createdAt: number;
}

export interface ProfileRecord {
  displayName: string;
  bio: string;
  createdAt: number;
}

export const profileTable = (userId: string) => `profile:${userId}`;
export const likesTable = (userId: string) => `likes:${userId}`;

// ---------------------------------------------------------------------------
// 요청 단위 스냅샷
// ---------------------------------------------------------------------------

export interface World {
  cat: Catalog;
  now: number;
  models: ModelSummary[];
  images: ImageSummary[];
  modelById: Map<string, ModelSummary>;
  imageById: Map<string, ImageSummary>;
  imagesByModel: Map<string, ImageSummary[]>;
}

export async function loadWorld(): Promise<World> {
  const now = Date.now();
  const cat = await Catalog.load();
  const models = [...seedModelSummaries(now), ...cat.models.values()];
  const images = [...seedImageSummaries(now), ...cat.images.values()];
  const imagesByModel = new Map<string, ImageSummary[]>();
  for (const img of images) {
    if (!img.modelId) continue;
    const list = imagesByModel.get(img.modelId);
    if (list) list.push(img);
    else imagesByModel.set(img.modelId, [img]);
  }
  return {
    cat,
    now,
    models,
    images,
    modelById: new Map(models.map((m) => [m.id, m])),
    imageById: new Map(images.map((i) => [i.id, i])),
    imagesByModel,
  };
}

export function modelDownloads(w: World, id: string, period: Period = 'all'): number {
  return seedInPeriod(seedModelDownloads(id), period) + counterInPeriod(w.cat.modelStat(id)?.dl, period, w.now);
}

export function modelLikes(w: World, id: string, period: Period = 'all'): number {
  return seedInPeriod(seedModelLikes(id), period) + counterInPeriod(w.cat.modelStat(id)?.lk, period, w.now);
}

export function imageLikes(w: World, id: string, period: Period = 'all'): number {
  return seedInPeriod(seedImageLikes(id), period) + counterInPeriod(w.cat.imageStat(id)?.lk, period, w.now);
}

/** 로그인한 사용자가 좋아요 한 대상 ('m:<id>' / 'i:<id>') */
export async function viewerLikes(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  const { items } = await db.list<{ k: string; target: string }>(likesTable(userId), { limit: 1000 });
  return new Set(items.map((x) => `${x.k}:${x.target}`));
}

/** 'seed/...' 는 프론트엔드 정적 파일이라 그대로, 'u/...' 는 서명된 storage URL 로 바꾼다 */
export async function resolveUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const stored = [...new Set(paths.filter((p) => p.startsWith('u/')))];
  for (const p of paths) if (!p.startsWith('u/')) out.set(p, p);
  for (let i = 0; i < stored.length; i += 100) {
    const res = await storage.url(stored.slice(i, i + 100));
    for (const r of res) out.set(r.path, r.url);
  }
  return out;
}

export function userRef(id: string, displayName: string): UserRef {
  return { id, displayName };
}

/** 대표 이미지: 제작자 이미지 우선 → 최신 버전 → 먼저 올린 이미지 */
function coverOf(w: World, m: ModelSummary): ImageSummary | null {
  const list = w.imagesByModel.get(m.id);
  if (!list?.length) return null;
  const order = new Map(m.versions.map((v, i) => [v.id, i]));
  return [...list].sort((a, b) => {
    const ao = a.ownerId === m.ownerId ? 0 : 1;
    const bo = b.ownerId === m.ownerId ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const av = order.get(a.versionId ?? '') ?? -1;
    const bv = order.get(b.versionId ?? '') ?? -1;
    if (av !== bv) return bv - av;
    return a.createdAt - b.createdAt;
  })[0];
}

export async function toModelCards(w: World, list: ModelSummary[]): Promise<ModelCardData[]> {
  const covers = list.map((m) => coverOf(w, m));
  const urls = await resolveUrls(covers.filter((c): c is ImageSummary => c !== null).map((c) => c.thumb));
  return list.map((m, i) => {
    const c = covers[i];
    return {
      id: m.id,
      name: m.name,
      type: m.type,
      nsfw: m.nsfw,
      createdAt: m.createdAt,
      baseModel: m.versions[m.versions.length - 1]?.baseModel ?? null,
      creator: userRef(m.ownerId, m.ownerName),
      stats: { downloads: modelDownloads(w, m.id), likes: modelLikes(w, m.id), images: w.imagesByModel.get(m.id)?.length ?? 0 },
      cover: c
        ? { thumbUrl: urls.get(c.thumb) ?? c.thumb, width: c.width, height: c.height, color: c.color, nsfw: c.nsfw || m.nsfw }
        : null,
    };
  });
}

function imageModelRef(w: World, img: { modelId: string | null; versionId: string | null }) {
  const m = img.modelId ? w.modelById.get(img.modelId) : undefined;
  if (!m) return { model: null, modelNsfw: false };
  const v = m.versions.find((x) => x.id === img.versionId);
  return {
    model: { id: m.id, name: m.name, type: m.type, versionId: v?.id ?? null, versionName: v?.name ?? null },
    modelNsfw: m.nsfw,
  };
}

function cardOf(w: World, img: ImageSummary, thumbUrl: string, liked: Set<string>): ImageCardData {
  const { model, modelNsfw } = imageModelRef(w, img);
  return {
    id: img.id,
    thumbUrl,
    width: img.width,
    height: img.height,
    color: img.color,
    nsfw: img.nsfw || modelNsfw,
    createdAt: img.createdAt,
    user: userRef(img.ownerId, img.ownerName),
    likes: imageLikes(w, img.id),
    likedByMe: liked.has(`i:${img.id}`),
    model,
    meta: {
      prompt: img.meta.prompt,
      negativePrompt: img.meta.negativePrompt,
      sampler: img.meta.sampler,
      scheduler: null,
      steps: img.meta.steps,
      cfgScale: img.meta.cfgScale,
      seed: img.meta.seed,
      clipSkip: null,
      size: null,
      model: null,
      modelHash: null,
      extra: {},
    },
    metaSource: img.source,
  };
}

export async function toImageCards(w: World, list: ImageSummary[], liked: Set<string>): Promise<ImageCardData[]> {
  const urls = await resolveUrls(list.map((i) => i.thumb));
  return list.map((img) => cardOf(w, img, urls.get(img.thumb) ?? img.thumb, liked));
}

export async function imageDetail(w: World, id: string, liked: Set<string>): Promise<ImageDetailData | null> {
  const summary = w.imageById.get(id);
  if (!summary) return null;
  let file: string;
  let meta: GenerationParams;
  let source: MetadataSource | null;
  if (isSeedId(id)) {
    const full = seedImageFull(id);
    if (!full) return null;
    ({ file, meta, source } = full);
  } else {
    const [rec] = await db.get<ImageRecord>('images', [id]);
    if (!rec) return null;
    ({ file, meta, source } = rec);
  }
  const urls = await resolveUrls([summary.thumb, file]);
  const card = cardOf(w, summary, urls.get(summary.thumb) ?? summary.thumb, liked);
  return { ...card, meta, metaSource: source, url: urls.get(file) ?? file };
}

/** 버전 정보 (최신 → 오래된 순) */
export async function modelDetail(w: World, id: string, liked: Set<string>): Promise<(ModelDetailData & { files: Map<string, VersionFile> }) | null> {
  const summary = w.modelById.get(id);
  if (!summary) return null;
  let description: string;
  let versions: (Omit<ModelVersionData, 'downloads'> & { file: VersionFile })[];
  if (isSeedId(id)) {
    const s = seedModel(id);
    if (!s) return null;
    description = s.description;
    versions = s.versions.map((v) => ({
      id: v.id,
      name: v.name,
      baseModel: v.baseModel,
      triggerWords: v.triggerWords,
      description: v.description,
      fileName: v.fileName,
      fileSize: v.fileSize,
      sha256: v.sha256,
      externalUrl: v.externalUrl,
      createdAt: summary.versions.find((x) => x.id === v.id)?.createdAt ?? summary.createdAt,
      file: { path: v.file, external: false },
    }));
  } else {
    const [rec] = await db.get<ModelRecord>('models', [id]);
    if (!rec) return null;
    description = rec.description;
    versions = rec.versions.map((v) => ({
      id: v.id,
      name: v.name,
      baseModel: v.baseModel,
      triggerWords: v.triggerWords,
      description: v.description,
      fileName: v.file?.fileName ?? null,
      fileSize: v.file?.size ?? null,
      sha256: v.file?.sha256 ?? null,
      externalUrl: v.externalUrl,
      createdAt: v.createdAt,
      file: v.file ? { path: v.file.path, external: false } : { path: v.externalUrl ?? '', external: true },
    }));
  }
  versions.sort((a, b) => b.createdAt - a.createdAt);
  const total = seedModelDownloads(id)?.total ?? 0;
  const vdl = w.cat.modelStat(id)?.vdl ?? {};
  const files = new Map<string, VersionFile>();
  const out: ModelVersionData[] = versions.map((v, i) => {
    files.set(v.id, v.file);
    // 샘플 데이터는 모델 전체 다운로드 수만 있으므로 최신 버전에 60% 를 몰아 준다
    const share = versions.length === 1 ? 1 : i === 0 ? 0.6 : 0.4 / (versions.length - 1);
    const { file: _file, ...rest } = v;
    void _file;
    return { ...rest, downloads: Math.round(total * share) + (vdl[v.id] ?? 0) };
  });
  return {
    id,
    name: summary.name,
    type: summary.type,
    description,
    nsfw: summary.nsfw,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    creator: userRef(summary.ownerId, summary.ownerName),
    tags: summary.tags,
    versions: out,
    stats: {
      downloads: modelDownloads(w, id),
      likes: modelLikes(w, id),
      images: w.imagesByModel.get(id)?.length ?? 0,
    },
    likedByMe: liked.has(`m:${id}`),
    files,
  };
}

export interface VersionFile {
  /** 정적 파일 경로, storage 경로, 또는 외부 URL */
  path: string;
  external: boolean;
}

export async function profileOf(userId: string): Promise<{ id: string | null; rec: ProfileRecord } | null> {
  const seed = seedProfile(userId);
  if (seed) return { id: null, rec: { displayName: seed.displayName, bio: seed.bio, createdAt: Date.now() - seed.ageDays * 86400000 } };
  const { items } = await db.list<ProfileRecord>(profileTable(userId), { limit: 1 });
  const first = items[0];
  if (!first) return null;
  const { id, ...rec } = first;
  return { id, rec: rec as ProfileRecord };
}
