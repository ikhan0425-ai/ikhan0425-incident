import "server-only";
import path from "node:path";
import {
  BASE_MODELS,
  LIMITS,
  MODEL_FILE_EXTENSIONS,
  MODEL_TYPES,
  normalizeTag,
  type BaseModel,
  type ModelType,
} from "@/lib/constants";
import { emptyParams, type GenerationParams, type MetadataSource } from "@/lib/generation";
import { UserError } from "./errors";
import type { DiskFile } from "./multipart";

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function nullableStr(v: unknown, max: number): string | null {
  const s = str(v, max);
  return s === "" ? null : s;
}

function nullableNum(v: unknown, opts: { int?: boolean; min: number; max: number }): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < opts.min || n > opts.max) return null;
  return opts.int ? Math.trunc(n) : Math.round(n * 100) / 100;
}

export interface ModelInput {
  name: string;
  type: ModelType;
  description: string;
  nsfw: boolean;
  tags: string[];
}

export interface VersionInput {
  name: string;
  baseModel: BaseModel;
  triggerWords: string[];
  description: string;
  file: DiskFile | null;
  externalUrl: string | null;
}

export function parseList(raw: string | undefined, maxItems: number, maxLen: number): string[] {
  if (!raw) return [];
  let items: unknown;
  try {
    items = raw.trim().startsWith("[") ? JSON.parse(raw) : raw.split(",");
  } catch {
    items = raw.split(",");
  }
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  for (const it of items) {
    const s = str(it, maxLen).replace(/,/g, " ").trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out.slice(0, maxItems);
}

export function parseModelFields(fields: Record<string, string>): ModelInput {
  const name = str(fields.name, LIMITS.nameLength);
  if (name.length < 2) throw new UserError("모델 이름을 2자 이상 입력해 주세요.");
  const type = fields.type as ModelType;
  if (!MODEL_TYPES.some((t) => t.value === type)) throw new UserError("모델 종류를 선택해 주세요.");
  const tags = [...new Set(parseList(fields.tags, LIMITS.tagsPerModel, 30).map(normalizeTag))].filter(Boolean);
  return {
    name,
    type,
    description: str(fields.description, LIMITS.descriptionLength),
    nsfw: fields.nsfw === "1" || fields.nsfw === "true",
    tags,
  };
}

export function parseVersionFields(fields: Record<string, string>, file: DiskFile | null): VersionInput {
  const name = str(fields.versionName, 50) || "v1.0";
  const baseModel = fields.baseModel as BaseModel;
  if (!BASE_MODELS.includes(baseModel)) throw new UserError("베이스 모델을 선택해 주세요.");

  let externalUrl: string | null = null;
  const rawUrl = str(fields.externalUrl, 2000);
  if (rawUrl) {
    try {
      const u = new URL(rawUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
      externalUrl = u.toString();
    } catch {
      throw new UserError("외부 다운로드 링크는 http(s) 주소여야 합니다.");
    }
  }
  if (file) {
    const ext = path.extname(file.filename).toLowerCase();
    if (!MODEL_FILE_EXTENSIONS.includes(ext)) {
      throw new UserError(`지원하지 않는 모델 파일 형식입니다. (${MODEL_FILE_EXTENSIONS.join(", ")})`);
    }
  }
  if (!file && !externalUrl) throw new UserError("모델 파일을 올리거나 외부 다운로드 링크를 입력해 주세요.");

  return {
    name,
    baseModel,
    triggerWords: parseList(fields.triggerWords, 20, 100),
    description: str(fields.versionDescription, LIMITS.descriptionLength),
    file,
    externalUrl: file ? null : externalUrl,
  };
}

export interface ImageMetaInput {
  meta: GenerationParams;
  source: MetadataSource | null;
  nsfw: boolean;
}

const SOURCES: MetadataSource[] = ["a1111", "comfyui", "novelai", "invokeai", "json", "manual"];

/** 클라이언트가 보낸(또는 서버가 추출한) 생성 정보를 저장 가능한 형태로 정리한다. */
export function sanitizeMeta(raw: unknown): ImageMetaInput {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
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
  if (o.extra && typeof o.extra === "object" && !Array.isArray(o.extra)) {
    for (const [k, v] of Object.entries(o.extra as Record<string, unknown>).slice(0, 40)) {
      const key = str(k, 60);
      const value = typeof v === "string" || typeof v === "number" ? str(String(v), 2000) : "";
      if (key && value) meta.extra[key] = value;
    }
  }
  const source = SOURCES.includes(o.source as MetadataSource) ? (o.source as MetadataSource) : null;
  return { meta, source, nsfw: o.nsfw === true || o.nsfw === "1" };
}

export function parseMetaList(raw: string | undefined): unknown[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    throw new UserError("이미지 정보 형식이 올바르지 않습니다.");
  }
}
