// 목록·검색·정렬용 카탈로그.
//
// AppDeploy DB 는 키-값 저장소라 정렬·필터 쿼리가 없다. 그래서 모든 모델/이미지의 "요약"을
// 몇 개의 큰 레코드(chunk)에 모아 두고, 요청마다 한 번의 db.list 로 전부 읽어 메모리에서 필터·정렬한다.
// 전체 정보(설명, 전체 프롬프트 등)는 models / images 테이블에 따로 있다.
// 샘플 데이터는 DB 에 넣지 않고 seed.ts 에서 합친다.
//
// 주의: 레코드를 통째로 읽고 쓰므로 동시에 같은 레코드를 바꾸면 마지막 쓰기가 이긴다.
// 소규모 커뮤니티에는 충분하지만, 사용자가 많아지면 전용 DB 로 옮겨야 한다.

import { db } from '@appdeploy/sdk';
import type { MetadataSource } from '../shared/generation';
import { emptyCounter, type Counter } from './time';

export interface VersionSummary {
  id: string;
  name: string;
  baseModel: string;
  /** 모델 파일 SHA256 앞 10자리 (이미지의 Model hash 로 자동 연결) */
  sha10: string | null;
  createdAt: number;
}

export interface ModelSummary {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  type: string;
  nsfw: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  /** 오래된 것 → 최신 순 */
  versions: VersionSummary[];
}

export interface ImageMetaPreview {
  prompt: string | null;
  negativePrompt: string | null;
  sampler: string | null;
  steps: number | null;
  cfgScale: number | null;
  seed: string | null;
}

export interface ImageSummary {
  id: string;
  ownerId: string;
  ownerName: string;
  modelId: string | null;
  versionId: string | null;
  /** 썸네일 경로: 'seed/...' 는 정적 파일, 'u/...' 는 storage */
  thumb: string;
  width: number;
  height: number;
  color: string | null;
  nsfw: boolean;
  createdAt: number;
  meta: ImageMetaPreview;
  source: MetadataSource | null;
}

export interface ModelStat {
  dl?: Counter;
  lk?: Counter;
  /** 버전별 다운로드 수 */
  vdl?: Record<string, number>;
}

export interface ImageStat {
  lk?: Counter;
}

type CatalogRecord =
  | { kind: 'models'; items: ModelSummary[] }
  | { kind: 'images'; items: ImageSummary[] }
  | { kind: 'mstats'; shard: number; stats: Record<string, ModelStat> }
  | { kind: 'istats'; shard: number; stats: Record<string, ImageStat> };

interface Slot {
  id: string | null;
  rec: CatalogRecord;
  dirty: boolean;
}

const TABLE = 'catalog';
const SHARDS = 4;
/** 레코드 최대 256KiB 보다 넉넉히 작게 */
const CHUNK_LIMIT = 170 * 1024;

function shardOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % SHARDS;
}

function byteSize(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v), 'utf8');
}

export const PREVIEW_PROMPT = 400;
export const PREVIEW_NEGATIVE = 200;

export function previewOf(meta: {
  prompt: string | null;
  negativePrompt: string | null;
  sampler: string | null;
  steps: number | null;
  cfgScale: number | null;
  seed: string | null;
}): ImageMetaPreview {
  return {
    prompt: meta.prompt ? meta.prompt.slice(0, PREVIEW_PROMPT) : null,
    negativePrompt: meta.negativePrompt ? meta.negativePrompt.slice(0, PREVIEW_NEGATIVE) : null,
    sampler: meta.sampler,
    steps: meta.steps,
    cfgScale: meta.cfgScale,
    seed: meta.seed,
  };
}

export class Catalog {
  private slots: Slot[] = [];
  readonly models = new Map<string, ModelSummary>();
  readonly images = new Map<string, ImageSummary>();
  private modelSlot = new Map<string, Slot>();
  private imageSlot = new Map<string, Slot>();

  static async load(): Promise<Catalog> {
    const cat = new Catalog();
    let nextToken: string | undefined;
    // 카탈로그 레코드는 수십 개 이하라 몇 페이지면 끝난다
    for (let page = 0; page < 5; page++) {
      const res = await db.list<CatalogRecord>(TABLE, { limit: 100, nextToken });
      for (const item of res.items) {
        const { id, ...rest } = item as unknown as { id: string } & CatalogRecord;
        cat.attach({ id, rec: rest as CatalogRecord, dirty: false });
      }
      nextToken = res.nextToken;
      if (!nextToken) break;
    }
    return cat;
  }

  private attach(slot: Slot) {
    this.slots.push(slot);
    const rec = slot.rec;
    if (rec.kind === 'models') {
      for (const m of rec.items) {
        this.models.set(m.id, m);
        this.modelSlot.set(m.id, slot);
      }
    } else if (rec.kind === 'images') {
      for (const i of rec.items) {
        this.images.set(i.id, i);
        this.imageSlot.set(i.id, slot);
      }
    }
  }

  private chunkFor(kind: 'models' | 'images', item: unknown): Slot {
    const extra = byteSize(item);
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const s = this.slots[i];
      if (s.rec.kind === kind && byteSize(s.rec) + extra < CHUNK_LIMIT) return s;
    }
    const slot: Slot = { id: null, rec: kind === 'models' ? { kind, items: [] } : { kind, items: [] }, dirty: true };
    this.slots.push(slot);
    return slot;
  }

  putModel(m: ModelSummary): void {
    const existing = this.modelSlot.get(m.id);
    if (existing && existing.rec.kind === 'models') {
      existing.rec.items = existing.rec.items.map((x) => (x.id === m.id ? m : x));
      existing.dirty = true;
    } else {
      const slot = this.chunkFor('models', m);
      if (slot.rec.kind === 'models') slot.rec.items.push(m);
      slot.dirty = true;
      this.modelSlot.set(m.id, slot);
    }
    this.models.set(m.id, m);
  }

  removeModel(id: string): void {
    const slot = this.modelSlot.get(id);
    if (slot && slot.rec.kind === 'models') {
      slot.rec.items = slot.rec.items.filter((x) => x.id !== id);
      slot.dirty = true;
    }
    this.models.delete(id);
    this.modelSlot.delete(id);
    const st = this.statsSlot('mstats', id, false);
    if (st && st.rec.kind === 'mstats' && st.rec.stats[id]) {
      delete st.rec.stats[id];
      st.dirty = true;
    }
  }

  putImage(img: ImageSummary): void {
    const existing = this.imageSlot.get(img.id);
    if (existing && existing.rec.kind === 'images') {
      existing.rec.items = existing.rec.items.map((x) => (x.id === img.id ? img : x));
      existing.dirty = true;
    } else {
      const slot = this.chunkFor('images', img);
      if (slot.rec.kind === 'images') slot.rec.items.push(img);
      slot.dirty = true;
      this.imageSlot.set(img.id, slot);
    }
    this.images.set(img.id, img);
  }

  removeImage(id: string): void {
    const slot = this.imageSlot.get(id);
    if (slot && slot.rec.kind === 'images') {
      slot.rec.items = slot.rec.items.filter((x) => x.id !== id);
      slot.dirty = true;
    }
    this.images.delete(id);
    this.imageSlot.delete(id);
    const st = this.statsSlot('istats', id, false);
    if (st && st.rec.kind === 'istats' && st.rec.stats[id]) {
      delete st.rec.stats[id];
      st.dirty = true;
    }
  }

  private statsSlot(kind: 'mstats' | 'istats', id: string, create: boolean): Slot | null {
    const shard = shardOf(id);
    const found = this.slots.find((s) => s.rec.kind === kind && s.rec.shard === shard);
    if (found || !create) return found ?? null;
    const slot: Slot = { id: null, rec: kind === 'mstats' ? { kind, shard, stats: {} } : { kind, shard, stats: {} }, dirty: true };
    this.slots.push(slot);
    return slot;
  }

  modelStat(id: string): ModelStat | undefined {
    const s = this.statsSlot('mstats', id, false);
    return s && s.rec.kind === 'mstats' ? s.rec.stats[id] : undefined;
  }

  imageStat(id: string): ImageStat | undefined {
    const s = this.statsSlot('istats', id, false);
    return s && s.rec.kind === 'istats' ? s.rec.stats[id] : undefined;
  }

  /** 수정할 통계 객체 (없으면 만든다). 바꾼 뒤 save() 해야 저장된다 */
  editModelStat(id: string): ModelStat {
    const s = this.statsSlot('mstats', id, true)!;
    s.dirty = true;
    if (s.rec.kind !== 'mstats') throw new Error('bad stats slot');
    return (s.rec.stats[id] ??= {});
  }

  editImageStat(id: string): ImageStat {
    const s = this.statsSlot('istats', id, true)!;
    s.dirty = true;
    if (s.rec.kind !== 'istats') throw new Error('bad stats slot');
    return (s.rec.stats[id] ??= {});
  }

  async save(): Promise<void> {
    const dirty = this.slots.filter((s) => s.dirty);
    const updates = dirty.filter((s) => s.id !== null);
    const adds = dirty.filter((s) => s.id === null);
    if (updates.length) {
      const ok = await db.update(
        TABLE,
        updates.map((s) => ({ id: s.id!, record: s.rec as unknown as Record<string, unknown> })),
      );
      if (ok.some((x) => !x)) throw new Error('catalog update failed');
    }
    if (adds.length) {
      const ids = await db.add(
        TABLE,
        adds.map((s) => s.rec as unknown as Record<string, unknown>),
      );
      ids.forEach((id, i) => {
        if (!id) throw new Error('catalog add failed');
        adds[i].id = id;
      });
    }
    for (const s of dirty) s.dirty = false;
  }
}

export function counterOf(c: Counter | undefined): Counter {
  return c ?? emptyCounter();
}
