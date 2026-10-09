// 목록·검색·정렬용 카탈로그.
//
// AppDeploy DB 는 키-값 저장소라 정렬·필터 쿼리가 없다. 그래서 모든 모델/이미지의 "요약"을
// 몇 개의 큰 레코드(chunk)에 모아 두고, 요청마다 한 번의 db.list 로 전부 읽어 메모리에서 필터·정렬한다.
// 전체 정보(설명, 전체 프롬프트 등)는 models / images 테이블에 따로 있다.
// 샘플 데이터는 DB 에 넣지 않고 seed.ts 에서 합친다.
//
// 동시 수정: DB 에 원자적 갱신이 없으므로, 요청이 바꾼 내용을 작업 기록(op)으로 남겨 두었다가
// 저장 직전에 카탈로그를 다시 읽고 그 위에 다시 적용한 뒤 쓴다. 충돌 가능 구간이 요청 전체에서
// 수 밀리초로 줄어든다. 사용자가 아주 많아지면 전용 DB 로 옮겨야 한다.

import { db } from '@appdeploy/sdk';
import type { MetadataSource } from '../shared/generation';
import { bump, emptyCounter, pruneCounter, type Counter } from './time';

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
  /** 프롬프트가 미리보기보다 길 때만: 검색용 소문자 프롬프트 (최대 1500자) */
  search?: string;
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
  | { kind: 'mstats'; shard: number; stats: Record<string, ModelStat>; ev?: string[] }
  | { kind: 'istats'; shard: number; stats: Record<string, ImageStat>; ev?: string[] };

interface Slot {
  id: string | null;
  rec: CatalogRecord;
  dirty: boolean;
}

/** 저장 직전에 새로 읽은 카탈로그에 다시 적용할 변경 */
type Op =
  | { t: 'putModel'; m: ModelSummary }
  | { t: 'removeModel'; id: string }
  | { t: 'putImage'; img: ImageSummary }
  | { t: 'removeImage'; id: string }
  | { t: 'bumpModel'; id: string; field: 'dl' | 'lk'; at: number; delta: 1 | -1; versionId?: string; token: string }
  | { t: 'bumpImage'; id: string; at: number; delta: 1 | -1; token: string };

/** 집계 변경마다 붙이는 고유 표시. 샤드에 최근 표시를 남겨 두어 같은 변경이 두 번 적용되지 않게 한다 */
const EV_KEEP = 300;
const newToken = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const SAVE_ATTEMPTS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TABLE = 'catalog';
const SHARDS = 16;
/** 새 항목을 넣을 수 있는 chunk 크기 (레코드 최대 256KiB 보다 넉넉히 작게) */
const CHUNK_LIMIT = 170 * 1024;
/** 기존 항목이 커져서 이 크기를 넘으면 다른 chunk 로 옮긴다 */
const CHUNK_HARD_LIMIT = 220 * 1024;
/** db.add / db.update 한 번에 보내는 양 (호출당 1MiB, 500개 제한) */
const BATCH_BYTES = 900 * 1024;
const BATCH_ITEMS = 500;
const MAX_PAGES = 20;

function shardOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % SHARDS;
}

export function byteSize(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v), 'utf8');
}

export const PREVIEW_PROMPT = 400;
export const PREVIEW_NEGATIVE = 200;
const SEARCH_LENGTH = 1500;

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

/** 미리보기에 잘린 뒷부분까지 검색되도록 긴 프롬프트만 따로 보관 */
export function searchOf(prompt: string | null): string | undefined {
  return prompt && prompt.length > PREVIEW_PROMPT ? prompt.slice(0, SEARCH_LENGTH).toLocaleLowerCase('ko-KR') : undefined;
}

/** size·count 제한을 지키도록 묶음으로 나눈다 */
function batches<T>(items: T[], size: (t: T) => number): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let bytes = 0;
  for (const it of items) {
    const n = size(it);
    if (cur.length && (bytes + n > BATCH_BYTES || cur.length >= BATCH_ITEMS)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(it);
    bytes += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

function mergeCounter(a: Counter | undefined, b: Counter | undefined): Counter | undefined {
  if (!a) return b;
  if (!b) return a;
  const out: Counter = { t: a.t + b.t, d: { ...a.d }, m: { ...a.m } };
  for (const [k, v] of Object.entries(b.d)) out.d[k] = (out.d[k] ?? 0) + v;
  for (const [k, v] of Object.entries(b.m)) out.m[k] = (out.m[k] ?? 0) + v;
  return out;
}

export class Catalog {
  private slots: Slot[] = [];
  readonly models = new Map<string, ModelSummary>();
  readonly images = new Map<string, ImageSummary>();
  private modelSlot = new Map<string, Slot>();
  private imageSlot = new Map<string, Slot>();
  /** 같은 (kind, shard) 통계 레코드가 동시에 두 개 만들어진 경우 합친 뒤 지울 레코드 */
  private duplicates: string[] = [];
  private ops: Op[] = [];

  static async load(): Promise<Catalog> {
    const cat = new Catalog();
    let nextToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await db.list<CatalogRecord>(TABLE, { limit: 100, nextToken });
      for (const item of res.items) {
        const { id, ...rest } = item as unknown as { id: string } & CatalogRecord;
        cat.attach({ id, rec: rest as CatalogRecord, dirty: false });
      }
      nextToken = res.nextToken;
      if (!nextToken) return cat;
    }
    // 일부만 읽은 채로 쓰면 데이터가 사라지므로 아예 실패시킨다
    throw new Error('catalog has too many records');
  }

  private attach(slot: Slot) {
    const rec = slot.rec;
    if (rec.kind === 'mstats' || rec.kind === 'istats') {
      const existing = this.slots.find((s) => s.rec.kind === rec.kind && 'shard' in s.rec && s.rec.shard === rec.shard);
      if (existing && slot.id) {
        // 동시에 만들어진 같은 샤드: 합친 뒤 다음 저장 때 하나를 지운다
        const target = existing.rec as typeof rec;
        for (const [k, v] of Object.entries(rec.stats as Record<string, ModelStat & ImageStat>)) {
          const cur = (target.stats as Record<string, ModelStat & ImageStat>)[k] ?? {};
          const vdl: Record<string, number> = { ...(cur.vdl ?? {}) };
          for (const [vk, vv] of Object.entries(v.vdl ?? {})) vdl[vk] = (vdl[vk] ?? 0) + vv;
          (target.stats as Record<string, ModelStat & ImageStat>)[k] = {
            ...(mergeCounter(cur.dl, v.dl) ? { dl: mergeCounter(cur.dl, v.dl) } : {}),
            ...(mergeCounter(cur.lk, v.lk) ? { lk: mergeCounter(cur.lk, v.lk) } : {}),
            ...(Object.keys(vdl).length ? { vdl } : {}),
          };
        }
        // 적용된 변경 표시도 합쳐야 같은 변경을 다시 적용하지 않는다
        const ev = [...((target as { ev?: string[] }).ev ?? []), ...((rec as { ev?: string[] }).ev ?? [])];
        (target as { ev?: string[] }).ev = [...new Set(ev)].slice(-EV_KEEP);
        existing.dirty = true;
        this.duplicates.push(slot.id);
        return;
      }
    }
    this.slots.push(slot);
    if (rec.kind === 'models') {
      for (const m of rec.items) {
        if (this.models.has(m.id)) continue;
        this.models.set(m.id, m);
        this.modelSlot.set(m.id, slot);
      }
    } else if (rec.kind === 'images') {
      for (const i of rec.items) {
        if (this.images.has(i.id)) continue;
        this.images.set(i.id, i);
        this.imageSlot.set(i.id, slot);
      }
    }
  }

  private chunkFor(kind: 'models' | 'images', item: unknown, exclude?: Slot): Slot {
    const extra = byteSize(item);
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const s = this.slots[i];
      if (s !== exclude && s.rec.kind === kind && byteSize(s.rec) + extra < CHUNK_LIMIT) return s;
    }
    const slot: Slot = { id: null, rec: kind === 'models' ? { kind, items: [] } : { kind, items: [] }, dirty: true };
    this.slots.push(slot);
    return slot;
  }

  // ---- 변경 (op 기록 + 적용) ----

  putModel(m: ModelSummary): void {
    this.ops.push({ t: 'putModel', m });
    this.applyPutModel(m);
  }

  removeModel(id: string): void {
    this.ops.push({ t: 'removeModel', id });
    this.applyRemoveModel(id);
  }

  putImage(img: ImageSummary): void {
    this.ops.push({ t: 'putImage', img });
    this.applyPutImage(img);
  }

  removeImage(id: string): void {
    this.ops.push({ t: 'removeImage', id });
    this.applyRemoveImage(id);
  }

  /** 모델 다운로드(dl)·좋아요(lk) 집계 +1/-1. versionId 를 주면 버전별 다운로드도 센다 */
  bumpModel(id: string, field: 'dl' | 'lk', at: number, delta: 1 | -1, versionId?: string): void {
    const op: Op = { t: 'bumpModel', id, field, at, delta, versionId, token: newToken() };
    this.ops.push(op);
    this.apply(op);
  }

  bumpImage(id: string, at: number, delta: 1 | -1): void {
    const op: Op = { t: 'bumpImage', id, at, delta, token: newToken() };
    this.ops.push(op);
    this.apply(op);
  }

  private apply(op: Op): void {
    switch (op.t) {
      case 'putModel':
        return this.applyPutModel(op.m);
      case 'removeModel':
        return this.applyRemoveModel(op.id);
      case 'putImage':
        return this.applyPutImage(op.img);
      case 'removeImage':
        return this.applyRemoveImage(op.id);
      case 'bumpModel': {
        if (!this.markEvent('mstats', op.id, op.token)) return;
        const stat = this.statEntry('mstats', op.id) as ModelStat;
        stat[op.field] ??= emptyCounter();
        bump(stat[op.field]!, op.at, op.delta);
        if (op.versionId && op.field === 'dl') {
          stat.vdl = { ...(stat.vdl ?? {}), [op.versionId]: Math.max(0, (stat.vdl?.[op.versionId] ?? 0) + op.delta) };
        }
        return;
      }
      case 'bumpImage': {
        if (!this.markEvent('istats', op.id, op.token)) return;
        const stat = this.statEntry('istats', op.id) as ImageStat;
        stat.lk ??= emptyCounter();
        bump(stat.lk, op.at, op.delta);
        return;
      }
    }
  }

  private applyPutModel(m: ModelSummary): void {
    const existing = this.modelSlot.get(m.id);
    if (existing && existing.rec.kind === 'models') {
      existing.rec.items = existing.rec.items.map((x) => (x.id === m.id ? m : x));
      existing.dirty = true;
      if (byteSize(existing.rec) > CHUNK_HARD_LIMIT) {
        // 항목이 커져서 chunk 가 넘칠 것 같으면 다른 chunk 로 옮긴다
        existing.rec.items = existing.rec.items.filter((x) => x.id !== m.id);
        const slot = this.chunkFor('models', m, existing);
        if (slot.rec.kind === 'models') slot.rec.items.push(m);
        slot.dirty = true;
        this.modelSlot.set(m.id, slot);
      }
    } else {
      const slot = this.chunkFor('models', m);
      if (slot.rec.kind === 'models') slot.rec.items.push(m);
      slot.dirty = true;
      this.modelSlot.set(m.id, slot);
    }
    this.models.set(m.id, m);
  }

  private applyRemoveModel(id: string): void {
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

  private applyPutImage(img: ImageSummary): void {
    const existing = this.imageSlot.get(img.id);
    if (existing && existing.rec.kind === 'images') {
      existing.rec.items = existing.rec.items.map((x) => (x.id === img.id ? img : x));
      existing.dirty = true;
      if (byteSize(existing.rec) > CHUNK_HARD_LIMIT) {
        existing.rec.items = existing.rec.items.filter((x) => x.id !== img.id);
        const slot = this.chunkFor('images', img, existing);
        if (slot.rec.kind === 'images') slot.rec.items.push(img);
        slot.dirty = true;
        this.imageSlot.set(img.id, slot);
      }
    } else {
      const slot = this.chunkFor('images', img);
      if (slot.rec.kind === 'images') slot.rec.items.push(img);
      slot.dirty = true;
      this.imageSlot.set(img.id, slot);
    }
    this.images.set(img.id, img);
  }

  private applyRemoveImage(id: string): void {
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
    const slot: Slot = {
      id: null,
      rec: kind === 'mstats' ? { kind, shard, stats: {} } : { kind, shard, stats: {} },
      dirty: true,
    };
    this.slots.push(slot);
    return slot;
  }

  /** 이 변경을 처음 적용하는 것이면 표시를 남기고 true, 이미 적용된 것이면 false */
  private markEvent(kind: 'mstats' | 'istats', id: string, token: string): boolean {
    const s = this.statsSlot(kind, id, true)!;
    const rec = s.rec as { ev?: string[] };
    if (rec.ev?.includes(token)) return false;
    rec.ev = [...(rec.ev ?? []), token].slice(-EV_KEEP);
    s.dirty = true;
    return true;
  }

  private hasEvent(kind: 'mstats' | 'istats', id: string, token: string): boolean {
    const s = this.statsSlot(kind, id, false);
    return Boolean(s && (s.rec as { ev?: string[] }).ev?.includes(token));
  }

  /** 저장된 카탈로그에 이 요청의 변경이 모두 들어 있는지 */
  private missing(ops: Op[]): Op[] {
    // 같은 항목을 여러 번 바꿨으면 마지막 것만 확인한다
    const last = new Map<string, Op>();
    const bumps: Op[] = [];
    for (const op of ops) {
      if (op.t === 'bumpModel' || op.t === 'bumpImage') bumps.push(op);
      else last.set(`${op.t.endsWith('Model') ? 'm' : 'i'}:${'id' in op ? op.id : op.t === 'putModel' ? op.m.id : op.img.id}`, op);
    }
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const out: Op[] = [];
    for (const op of last.values()) {
      const ok =
        op.t === 'putModel'
          ? same(this.models.get(op.m.id), op.m)
          : op.t === 'removeModel'
            ? !this.models.has(op.id)
            : op.t === 'putImage'
              ? same(this.images.get(op.img.id), op.img)
              : op.t === 'removeImage'
                ? !this.images.has(op.id)
                : true;
      if (!ok) out.push(op);
    }
    for (const op of bumps) {
      if (op.t === 'bumpModel' && !this.hasEvent('mstats', op.id, op.token)) out.push(op);
      if (op.t === 'bumpImage' && !this.hasEvent('istats', op.id, op.token)) out.push(op);
    }
    return out;
  }

  private statEntry(kind: 'mstats' | 'istats', id: string): ModelStat | ImageStat {
    const s = this.statsSlot(kind, id, true)!;
    s.dirty = true;
    const stats = (s.rec as { stats: Record<string, ModelStat | ImageStat> }).stats;
    return (stats[id] ??= {});
  }

  modelStat(id: string): ModelStat | undefined {
    const s = this.statsSlot('mstats', id, false);
    return s && s.rec.kind === 'mstats' ? s.rec.stats[id] : undefined;
  }

  imageStat(id: string): ImageStat | undefined {
    const s = this.statsSlot('istats', id, false);
    return s && s.rec.kind === 'istats' ? s.rec.stats[id] : undefined;
  }

  /**
   * 저장: 카탈로그를 새로 읽고 이 요청의 변경을 다시 적용한 뒤 바뀐 레코드만 묶음으로 쓴다.
   * 그 사이 다른 요청이 쓴 내용은 그대로 남는다.
   */
  async save(): Promise<void> {
    if (!this.ops.length) return;
    for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
      const fresh = await Catalog.load();
      for (const op of this.ops) fresh.apply(op);
      await fresh.writeDirty();
      // 같은 순간 다른 요청이 같은 레코드를 덮어썼는지 다시 읽어 확인하고, 빠졌으면 다시 적용한다
      const check = await Catalog.load();
      if (!check.missing(this.ops).length) {
        this.ops = [];
        return;
      }
      await sleep(30 + Math.random() * 120 * (attempt + 1));
    }
    throw new Error('catalog write conflict');
  }

  private async writeDirty(): Promise<void> {
    const now = Date.now();
    const dirty = this.slots.filter((s) => s.dirty);
    // 통계 샤드는 쓸 때마다 오래된 날짜·0 인 항목을 정리해 크기가 계속 자라지 않게 한다
    for (const s of dirty) {
      if (s.rec.kind !== 'mstats' && s.rec.kind !== 'istats') continue;
      const stats = s.rec.stats as Record<string, ModelStat & ImageStat>;
      for (const [k, v] of Object.entries(stats)) {
        for (const f of ['dl', 'lk'] as const) {
          const c = v[f];
          if (!c) continue;
          pruneCounter(c, now);
          if (c.t <= 0 && !Object.keys(c.d).length && !Object.keys(c.m).length) delete v[f];
        }
        if (v.vdl) for (const [vk, vv] of Object.entries(v.vdl)) if (vv <= 0) delete v.vdl[vk];
        if (v.vdl && !Object.keys(v.vdl).length) delete v.vdl;
        if (!v.dl && !v.lk && !v.vdl) delete stats[k];
      }
    }
    const tooBig = dirty.find((s) => byteSize(s.rec) > 250 * 1024);
    if (tooBig) throw new Error(`catalog record too large (${tooBig.rec.kind})`);

    const updates = dirty.filter((s) => s.id !== null);
    const adds = dirty.filter((s) => s.id === null);
    let failed = 0;
    for (const group of batches(updates, (s) => byteSize(s.rec) + 64)) {
      const ok = await db.update(
        TABLE,
        group.map((s) => ({ id: s.id!, record: s.rec as unknown as Record<string, unknown> })),
      );
      ok.forEach((x, i) => (x ? (group[i].dirty = false) : failed++));
    }
    for (const group of batches(adds, (s) => byteSize(s.rec) + 16)) {
      const ids = await db.add(
        TABLE,
        group.map((s) => s.rec as unknown as Record<string, unknown>),
      );
      ids.forEach((id, i) => {
        if (id) {
          group[i].id = id;
          group[i].dirty = false;
        } else failed++;
      });
    }
    if (failed) throw new Error(`catalog write failed for ${failed} record(s)`);
    if (this.duplicates.length) {
      const dupes = this.duplicates;
      this.duplicates = [];
      for (let i = 0; i < dupes.length; i += BATCH_ITEMS) await db.delete(TABLE, dupes.slice(i, i + BATCH_ITEMS));
    }
  }
}

export function counterOf(c: Counter | undefined): Counter {
  return c ?? emptyCounter();
}
