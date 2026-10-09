import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { DATA_DIR } from "./db";
import { UserError } from "./errors";

export const DIRS = {
  images: path.join(DATA_DIR, "uploads", "images"),
  thumbs: path.join(DATA_DIR, "uploads", "thumbs"),
  models: path.join(DATA_DIR, "uploads", "models"),
  tmp: path.join(DATA_DIR, "tmp"),
} as const;

export type ServedKind = "images" | "thumbs";

const NAME_RE = /^[a-f0-9]{32}\.(png|jpg|webp)$/;
export const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function randomName(): string {
  return crypto.randomBytes(16).toString("hex");
}

export interface SavedImage {
  fileName: string;
  thumbName: string;
  mime: string;
  width: number;
  height: number;
  dominantColor: string | null;
}

/** 원본은 메타데이터(프롬프트)를 보존하기 위해 그대로 저장하고, 목록용 썸네일(WebP)을 따로 만든다. */
export async function saveImage(buffer: Buffer): Promise<SavedImage> {
  let meta: Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new UserError("이미지 파일을 읽을 수 없습니다.");
  }
  const ext = meta.format === "png" ? "png" : meta.format === "jpeg" ? "jpg" : meta.format === "webp" ? "webp" : null;
  if (!ext) throw new UserError("PNG, JPEG, WebP 이미지만 올릴 수 있습니다.");
  if ((meta.pages ?? 1) > 1) throw new UserError("움직이는 이미지는 아직 지원하지 않습니다.");

  ensureDir(DIRS.images);
  ensureDir(DIRS.thumbs);
  const name = randomName();
  const fileName = `${name}.${ext}`;
  const thumbName = `${name}.webp`;

  const pipeline = sharp(buffer).rotate();
  const [{ dominant }] = await Promise.all([
    pipeline.clone().resize(32, 32, { fit: "cover" }).stats(),
    pipeline
      .clone()
      .resize({ width: 640, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(path.join(DIRS.thumbs, thumbName)),
    fs.promises.writeFile(path.join(/*turbopackIgnore: true*/ DIRS.images, fileName), buffer),
  ]);
  const oriented = meta.autoOrient ?? { width: meta.width, height: meta.height };
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return {
    fileName,
    thumbName,
    mime: MIME_BY_EXT[ext],
    width: oriented.width ?? 0,
    height: oriented.height ?? 0,
    dominantColor: dominant ? `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}` : null,
  };
}

export function deleteImageFiles(fileName: string, thumbName: string): void {
  for (const p of [path.join(DIRS.images, fileName), path.join(DIRS.thumbs, thumbName)]) {
    fs.rmSync(p, { force: true });
  }
}

export function servedFilePath(kind: string, name: string): string | null {
  if (kind !== "images" && kind !== "thumbs") return null;
  if (!NAME_RE.test(name)) return null;
  return path.join(DIRS[kind as ServedKind], name);
}

export function newTempPath(): string {
  ensureDir(DIRS.tmp);
  return path.join(DIRS.tmp, `${randomName()}.part`);
}

/** 업로드가 끝난 임시 파일을 모델 저장소로 옮기고 저장된 파일명을 돌려준다. */
export function storeModelFile(tmpPath: string, originalName: string): string {
  ensureDir(DIRS.models);
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const stored = `${randomName()}${ext}`;
  fs.renameSync(tmpPath, path.join(DIRS.models, stored));
  return stored;
}

export function modelFilePath(stored: string): string | null {
  if (!/^[a-f0-9]{32}(\.[a-z0-9]+)?$/.test(stored)) return null;
  return path.join(DIRS.models, stored);
}

export function deleteModelFile(stored: string | null): void {
  const p = stored ? modelFilePath(stored) : null;
  if (p) fs.rmSync(p, { force: true });
}

/** 모델 파일 최대 크기 (환경변수 MAX_MODEL_SIZE_MB, 기본 8GB) */
export const MAX_MODEL_BYTES = Number(process.env.MAX_MODEL_SIZE_MB ?? 8192) * 1024 * 1024;
