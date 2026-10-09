// 요청 본문 검증. 클라이언트가 보낸 값은 모두 여기서 잘라내고 확인한 뒤에만 저장한다.

import {
  BASE_MODELS,
  LIMITS,
  MODEL_FILE_EXTENSIONS,
  MODEL_TYPES,
  normalizeTag,
  type BaseModel,
  type ModelType,
} from '../shared/constants';
import { emptyParams, type GenerationParams, type MetadataSource } from '../shared/generation';
import { badRequest } from './http';

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function nullableStr(v: unknown, max: number): string | null {
  const s = str(v, max);
  return s === '' ? null : s;
}

function nullableNum(v: unknown, opts: { int?: boolean; min: number; max: number }): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < opts.min || n > opts.max) return null;
  return opts.int ? Math.trunc(n) : Math.round(n * 100) / 100;
}

function list(v: unknown, maxItems: number, maxLen: number): string[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  const out: string[] = [];
  for (const it of raw) {
    const s = str(it, maxLen).replace(/,/g, ' ').trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out.slice(0, maxItems);
}

const SOURCES: MetadataSource[] = ['a1111', 'comfyui', 'novelai', 'invokeai', 'json', 'manual'];

export function sanitizeMeta(raw: unknown): GenerationParams {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const meta = emptyParams();
  meta.prompt = nullableStr(o.prompt, LIMITS.promptLength);
  meta.negativePrompt = nullableStr(o.negativePrompt, LIMITS.promptLength);
  meta.sampler = nullableStr(o.sampler, 60);
  meta.scheduler = nullableStr(o.scheduler, 60);
  meta.steps = nullableNum(o.steps, { int: true, min: 1, max: 1000 });
  meta.cfgScale = nullableNum(o.cfgScale, { min: 0, max: 100 });
  const seed = nullableStr(o.seed, 30);
  meta.seed = seed && /^-?\d+$/.test(seed) ? seed : null;
  meta.clipSkip = nullableNum(o.clipSkip, { int: true, min: 1, max: 12 });
  meta.size = nullableStr(o.size, 20);
  meta.model = nullableStr(o.model, 200);
  meta.modelHash = nullableStr(o.modelHash, 64);
  if (o.extra && typeof o.extra === 'object' && !Array.isArray(o.extra)) {
    for (const [k, v] of Object.entries(o.extra as Record<string, unknown>).slice(0, 40)) {
      const key = str(k, 60);
      const value = typeof v === 'string' || typeof v === 'number' ? str(String(v), 2000) : '';
      if (key && value) meta.extra[key] = value;
    }
  }
  return meta;
}

export interface ValidImage {
  path: string;
  thumbPath: string;
  width: number;
  height: number;
  color: string | null;
  meta: GenerationParams;
  source: MetadataSource | null;
  nsfw: boolean;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 업로드 API 가 이 사용자에게 발급한 경로인지 확인 */
export function imagePathRe(userId: string): RegExp {
  return new RegExp(`^u/${escapeRe(userId)}/i/(${UUID})\\.(png|jpg|webp)$`);
}

export function thumbPathRe(userId: string): RegExp {
  return new RegExp(`^u/${escapeRe(userId)}/i/(${UUID})-t\\.(webp|jpg)$`);
}

export function modelFilePathRe(userId: string): RegExp {
  return new RegExp(`^u/${escapeRe(userId)}/f/${UUID}/[A-Za-z0-9._-]{1,120}$`);
}

export function parseImages(raw: unknown, userId: string, defaultNsfw: boolean, required: boolean): ValidImage[] {
  const arr = Array.isArray(raw) ? raw : [];
  if (required && arr.length === 0) throw badRequest('샘플 이미지를 1장 이상 올려 주세요.');
  if (arr.length > LIMITS.imagesPerUpload) throw badRequest(`이미지는 한 번에 ${LIMITS.imagesPerUpload}장까지 올릴 수 있어요.`);
  const imgRe = imagePathRe(userId);
  const thumbRe = thumbPathRe(userId);
  return arr.map((item) => {
    const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const path = str(o.path, 300);
    const thumbPath = str(o.thumbPath, 300);
    const pm = imgRe.exec(path);
    const tm = thumbRe.exec(thumbPath);
    if (!pm || !tm || pm[1] !== tm[1]) throw badRequest('이미지를 다시 올려 주세요.');
    const width = nullableNum(o.width, { int: true, min: 1, max: 20000 });
    const height = nullableNum(o.height, { int: true, min: 1, max: 20000 });
    if (!width || !height) throw badRequest('이미지 크기를 읽지 못했어요.');
    const color = typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : null;
    const source = SOURCES.includes(o.source as MetadataSource) ? (o.source as MetadataSource) : null;
    return {
      path,
      thumbPath,
      width,
      height,
      color,
      meta: sanitizeMeta(o.meta),
      source,
      nsfw: o.nsfw === true || defaultNsfw,
    };
  });
}

export interface ValidModel {
  name: string;
  type: ModelType;
  description: string;
  nsfw: boolean;
  tags: string[];
}

export function parseModel(body: Record<string, unknown>): ValidModel {
  const name = str(body.name, LIMITS.nameLength);
  if (name.length < 2) throw badRequest('모델 이름을 2자 이상 입력해 주세요.');
  const type = body.type as ModelType;
  if (!MODEL_TYPES.some((t) => t.value === type)) throw badRequest('모델 종류를 선택해 주세요.');
  const tags = [...new Set(list(body.tags, LIMITS.tagsPerModel, 30).map(normalizeTag))].filter(Boolean);
  return {
    name,
    type,
    description: str(body.description, LIMITS.descriptionLength),
    nsfw: body.nsfw === true,
    tags,
  };
}

export interface ValidVersion {
  name: string;
  baseModel: BaseModel;
  triggerWords: string[];
  description: string;
  externalUrl: string | null;
  file: { path: string; fileName: string; size: number; sha256: string } | null;
}

export function parseVersion(raw: unknown, userId: string): ValidVersion {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const name = str(o.name, 50) || 'v1.0';
  const baseModel = o.baseModel as BaseModel;
  if (!BASE_MODELS.includes(baseModel)) throw badRequest('베이스 모델을 선택해 주세요.');

  let externalUrl: string | null = null;
  const rawUrl = str(o.externalUrl, 2000);
  if (rawUrl) {
    let u: URL;
    try {
      u = new URL(rawUrl);
    } catch {
      throw badRequest('외부 다운로드 링크는 http(s) 주소여야 해요.');
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw badRequest('외부 다운로드 링크는 http(s) 주소여야 해요.');
    externalUrl = u.toString();
  }

  let file: ValidVersion['file'] = null;
  if (o.file && typeof o.file === 'object') {
    const f = o.file as Record<string, unknown>;
    const path = str(f.path, 400);
    const fileName = str(f.fileName, 120);
    const size = nullableNum(f.size, { int: true, min: 1, max: LIMITS.uploadBytes });
    const sha256 = typeof f.sha256 === 'string' && /^[0-9a-f]{64}$/.test(f.sha256) ? f.sha256 : null;
    const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    if (!modelFilePathRe(userId).test(path) || !size || !sha256 || !MODEL_FILE_EXTENSIONS.includes(ext)) {
      throw badRequest('모델 파일을 다시 올려 주세요.');
    }
    file = { path, fileName, size, sha256 };
  }
  if (!file && !externalUrl) throw badRequest('모델 파일을 올리거나 외부 다운로드 링크를 입력해 주세요.');

  return {
    name,
    baseModel,
    triggerWords: list(o.triggerWords, 20, 100),
    description: str(o.description, LIMITS.descriptionLength),
    externalUrl: file ? null : externalUrl,
    file,
  };
}

export function parseDisplayName(raw: unknown): string {
  const name = str(raw, 40).replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 20) throw badRequest('닉네임은 2~20자로 입력해 주세요.');
  return name;
}

/** 업로드용 base64 디코딩 + 크기 확인 */
export function decodeBase64(data: unknown, maxBytes: number, label: string): Buffer {
  if (typeof data !== 'string' || data.length === 0) throw badRequest(`${label} 파일이 비어 있어요.`);
  if (!/^[A-Za-z0-9+/=\s]+$/.test(data)) throw badRequest(`${label} 파일 형식이 올바르지 않아요.`);
  const buf = Buffer.from(data, 'base64');
  if (buf.length === 0) throw badRequest(`${label} 파일이 비어 있어요.`);
  if (buf.length > maxBytes) throw badRequest(`${label} 파일이 너무 커요. (최대 ${Math.round(maxBytes / 1024 / 1024)}MB)`);
  return buf;
}

export type ImageKind = 'png' | 'jpg' | 'webp';

export function sniffImage(buf: Buffer): ImageKind | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export const MIME: Record<ImageKind, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

export function safeFileName(name: unknown): string {
  const s = typeof name === 'string' ? name : '';
  const dot = s.lastIndexOf('.');
  const ext = dot >= 0 ? s.slice(dot).toLowerCase() : '';
  if (!MODEL_FILE_EXTENSIONS.includes(ext)) {
    throw badRequest(`지원하지 않는 모델 파일 형식이에요. (${MODEL_FILE_EXTENSIONS.join(', ')})`);
  }
  const base = s
    .slice(0, dot)
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 100);
  return `${base || 'model'}${ext}`;
}
