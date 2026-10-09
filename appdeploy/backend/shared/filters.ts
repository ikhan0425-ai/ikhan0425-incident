// URL 쿼리스트링 ↔ 필터 객체 변환. 페이지(서버)와 필터 UI(클라이언트), 목록 API 가 함께 쓴다.

import {
  BASE_MODELS,
  IMAGE_SORTS,
  MODEL_SORTS,
  MODEL_TYPES,
  PERIODS,
  normalizeTag,
  type ImageSort,
  type ModelSort,
  type Period,
} from './constants';

type RawParams = URLSearchParams | Record<string, string | string[] | undefined>;

function get(sp: RawParams, key: string): string {
  if (sp instanceof URLSearchParams) return sp.get(key) ?? '';
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

function list(sp: RawParams, key: string): string[] {
  return get(sp, key)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface ModelFilters {
  types: string[];
  baseModels: string[];
  tags: string[];
  sort: ModelSort;
  period: Period;
  q: string;
}

export interface ImageFilters {
  sort: ImageSort;
  period: Period;
  q: string;
}

const TYPE_VALUES = new Set<string>(MODEL_TYPES.map((t) => t.value));
const BASE_VALUES = new Set<string>(BASE_MODELS);

export function parseModelFilters(sp: RawParams): ModelFilters {
  const sort = get(sp, 'sort');
  const period = get(sp, 'period');
  return {
    types: list(sp, 'types').filter((t) => TYPE_VALUES.has(t)),
    baseModels: list(sp, 'base').filter((b) => BASE_VALUES.has(b)),
    tags: [...new Set(list(sp, 'tags').map(normalizeTag))].slice(0, 10),
    sort: (MODEL_SORTS.some((s) => s.value === sort) ? sort : 'newest') as ModelSort,
    period: (PERIODS.some((p) => p.value === period) ? period : 'all') as Period,
    q: get(sp, 'q').trim().slice(0, 100),
  };
}

export function modelFiltersToQuery(f: ModelFilters): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set('q', f.q);
  if (f.types.length) sp.set('types', f.types.join(','));
  if (f.baseModels.length) sp.set('base', f.baseModels.join(','));
  if (f.tags.length) sp.set('tags', f.tags.join(','));
  if (f.sort !== 'newest') sp.set('sort', f.sort);
  if (f.period !== 'all') sp.set('period', f.period);
  return sp.toString();
}

export function parseImageFilters(sp: RawParams): ImageFilters {
  const sort = get(sp, 'sort');
  const period = get(sp, 'period');
  return {
    sort: (IMAGE_SORTS.some((s) => s.value === sort) ? sort : 'newest') as ImageSort,
    period: (PERIODS.some((p) => p.value === period) ? period : 'all') as Period,
    q: get(sp, 'q').trim().slice(0, 100),
  };
}

export function imageFiltersToQuery(f: ImageFilters): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set('q', f.q);
  if (f.sort !== 'newest') sp.set('sort', f.sort);
  if (f.period !== 'all') sp.set('period', f.period);
  return sp.toString();
}

export function periodStart(period: Period, now = Date.now()): number {
  const days = PERIODS.find((p) => p.value === period)?.days ?? 0;
  return days ? now - days * 24 * 60 * 60 * 1000 : 0;
}

export function parsePage(sp: RawParams): number {
  const n = Number.parseInt(get(sp, 'page'), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : 1;
}
