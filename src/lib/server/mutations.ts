import "server-only";
import { extractGenerationFromImage } from "@/lib/image-metadata";
import { hasGenerationData } from "@/lib/generation";
import { getDb } from "./db";
import { UserError } from "./errors";
import type { MemoryFile } from "./multipart";
import { deleteImageFiles, deleteModelFile, saveImage, storeModelFile, type SavedImage } from "./storage";
import { sanitizeMeta, type ImageMetaInput, type ModelInput, type VersionInput } from "./validate";

export interface PreparedImage extends ImageMetaInput {
  saved: SavedImage;
}

/**
 * 업로드된 이미지들을 저장하고 생성 정보를 붙인다.
 * 클라이언트가 보낸 정보(자동 인식 후 사용자가 수정한 값)를 우선하고, 없으면 파일에서 직접 읽는다.
 */
export async function prepareImages(
  files: MemoryFile[],
  metaList: unknown[],
  defaultNsfw: boolean,
): Promise<PreparedImage[]> {
  const out: PreparedImage[] = [];
  try {
    for (const [i, file] of files.entries()) {
      const saved = await saveImage(file.buffer);
      let input = sanitizeMeta(metaList[i]);
      if (!metaList[i] || (!hasGenerationData(input.meta) && input.source === null)) {
        const extracted = await extractGenerationFromImage(new Uint8Array(file.buffer));
        if (extracted) input = { ...sanitizeMeta({ ...extracted.params, source: extracted.source }), nsfw: input.nsfw };
      }
      out.push({ ...input, nsfw: input.nsfw || defaultNsfw, saved });
    }
  } catch (err) {
    discardPreparedImages(out);
    throw err;
  }
  return out;
}

export function discardPreparedImages(images: PreparedImage[]): void {
  for (const img of images) deleteImageFiles(img.saved.fileName, img.saved.thumbName);
}

function insertImages(
  userId: number,
  modelId: number | null,
  versionId: number | null,
  images: PreparedImage[],
  now: number,
): number[] {
  const stmt = getDb().prepare(
    `INSERT INTO images (user_id, model_id, version_id, file_name, thumb_name, mime, width, height, dominant_color,
       prompt, negative_prompt, sampler, scheduler, steps, cfg_scale, seed, clip_skip, size, gen_model, gen_model_hash,
       extra, meta_source, nsfw, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  return images.map((img, i) => {
    const m = img.meta;
    const r = stmt.run(
      userId,
      modelId,
      versionId,
      img.saved.fileName,
      img.saved.thumbName,
      img.saved.mime,
      img.saved.width,
      img.saved.height,
      img.saved.dominantColor,
      m.prompt,
      m.negativePrompt,
      m.sampler,
      m.scheduler,
      m.steps,
      m.cfgScale,
      m.seed,
      m.clipSkip,
      m.size,
      m.model,
      m.modelHash,
      JSON.stringify(m.extra),
      img.source,
      img.nsfw ? 1 : 0,
      now + i, // 같은 묶음 안에서 올린 순서를 유지
    );
    return Number(r.lastInsertRowid);
  });
}

function setTags(modelId: number, tags: string[]): void {
  const db = getDb();
  db.prepare("DELETE FROM model_tags WHERE model_id = ?").run(modelId);
  const upsert = db.prepare("INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO UPDATE SET name = name RETURNING id");
  const link = db.prepare("INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)");
  for (const t of tags) {
    const { id } = upsert.get(t) as { id: number };
    link.run(modelId, id);
  }
}

function insertVersion(modelId: number, v: VersionInput, now: number): { versionId: number; storedFile: string | null } {
  const storedFile = v.file ? storeModelFile(v.file.tmpPath, v.file.filename) : null;
  try {
    const r = getDb()
      .prepare(
        `INSERT INTO model_versions (model_id, name, base_model, trigger_words, description, file_path, file_name, file_size,
           sha256, external_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        modelId,
        v.name,
        v.baseModel,
        JSON.stringify(v.triggerWords),
        v.description,
        storedFile,
        v.file?.filename ?? null,
        v.file?.size ?? null,
        v.file?.sha256 ?? null,
        v.externalUrl,
        now,
      );
    return { versionId: Number(r.lastInsertRowid), storedFile };
  } catch (err) {
    deleteModelFile(storedFile);
    throw err;
  }
}

export function createModel(userId: number, model: ModelInput, version: VersionInput, images: PreparedImage[]): number {
  const db = getDb();
  const now = Date.now();
  let storedFile: string | null = null;
  try {
    return db.transaction(() => {
      const r = db
        .prepare(
          "INSERT INTO models (user_id, name, type, description, nsfw, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(userId, model.name, model.type, model.description, model.nsfw ? 1 : 0, now, now);
      const modelId = Number(r.lastInsertRowid);
      setTags(modelId, model.tags);
      const v = insertVersion(modelId, version, now);
      storedFile = v.storedFile;
      insertImages(userId, modelId, v.versionId, images, now);
      return modelId;
    })();
  } catch (err) {
    deleteModelFile(storedFile);
    throw err;
  }
}

export function createVersion(modelId: number, userId: number, version: VersionInput, images: PreparedImage[]): number {
  const db = getDb();
  const now = Date.now();
  let storedFile: string | null = null;
  try {
    return db.transaction(() => {
      const v = insertVersion(modelId, version, now);
      storedFile = v.storedFile;
      insertImages(userId, modelId, v.versionId, images, now);
      db.prepare("UPDATE models SET updated_at = ? WHERE id = ?").run(now, modelId);
      return v.versionId;
    })();
  } catch (err) {
    deleteModelFile(storedFile);
    throw err;
  }
}

/** 이미지 게시. 모델을 고르지 않았으면 이미지의 "Model hash" 로 등록된 체크포인트를 찾아 연결한다. */
export function postImages(userId: number, versionId: number | null, images: PreparedImage[]): number[] {
  const db = getDb();
  const now = Date.now();
  const versionModel = db.prepare("SELECT model_id FROM model_versions WHERE id = ?");
  const byHash = db.prepare(
    "SELECT id, model_id FROM model_versions WHERE sha256 LIKE ? ORDER BY id DESC LIMIT 1",
  );
  return db.transaction(() => {
    if (versionId !== null) {
      const row = versionModel.get(versionId) as { model_id: number } | undefined;
      if (!row) throw new UserError("선택한 모델 버전을 찾을 수 없습니다.");
      return insertImages(userId, row.model_id, versionId, images, now);
    }
    return images.flatMap((img, i) => {
      const hash = img.meta.modelHash?.toLowerCase();
      const match =
        hash && /^[a-f0-9]{8,64}$/.test(hash)
          ? (byHash.get(`${hash}%`) as { id: number; model_id: number } | undefined)
          : undefined;
      return insertImages(userId, match?.model_id ?? null, match?.id ?? null, [img], now + i);
    });
  })();
}

export function toggleModelLike(userId: number, modelId: number): { liked: boolean; likes: number } {
  const db = getDb();
  return db.transaction(() => {
    if (!db.prepare("SELECT 1 FROM models WHERE id = ?").get(modelId)) throw new UserError("찾을 수 없습니다.", 404);
    const removed = db.prepare("DELETE FROM model_likes WHERE user_id = ? AND model_id = ?").run(userId, modelId);
    if (!removed.changes) {
      db.prepare("INSERT INTO model_likes (user_id, model_id, created_at) VALUES (?, ?, ?)").run(userId, modelId, Date.now());
    }
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM model_likes WHERE model_id = ?").get(modelId) as { n: number };
    return { liked: !removed.changes, likes: n };
  })();
}

export function toggleImageLike(userId: number, imageId: number): { liked: boolean; likes: number } {
  const db = getDb();
  return db.transaction(() => {
    if (!db.prepare("SELECT 1 FROM images WHERE id = ?").get(imageId)) throw new UserError("찾을 수 없습니다.", 404);
    const removed = db.prepare("DELETE FROM image_likes WHERE user_id = ? AND image_id = ?").run(userId, imageId);
    if (!removed.changes) {
      db.prepare("INSERT INTO image_likes (user_id, image_id, created_at) VALUES (?, ?, ?)").run(userId, imageId, Date.now());
    }
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM image_likes WHERE image_id = ?").get(imageId) as { n: number };
    return { liked: !removed.changes, likes: n };
  })();
}

export interface DownloadTarget {
  modelId: number;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  externalUrl: string | null;
}

/** 다운로드 기록. 로그인한 사용자가 1시간 안에 같은 버전을 다시 받으면 중복으로 세지 않는다. */
export function recordDownload(versionId: number, userId: number | null): DownloadTarget | null {
  const db = getDb();
  const v = db
    .prepare("SELECT model_id, file_path, file_name, file_size, external_url FROM model_versions WHERE id = ?")
    .get(versionId) as
    | { model_id: number; file_path: string | null; file_name: string | null; file_size: number | null; external_url: string | null }
    | undefined;
  if (!v) return null;
  const now = Date.now();
  const recent =
    userId !== null &&
    db
      .prepare("SELECT 1 FROM downloads WHERE version_id = ? AND user_id = ? AND created_at > ?")
      .get(versionId, userId, now - 60 * 60 * 1000);
  if (!recent) {
    db.prepare("INSERT INTO downloads (model_id, version_id, user_id, created_at) VALUES (?, ?, ?, ?)").run(
      v.model_id,
      versionId,
      userId,
      now,
    );
  }
  return {
    modelId: v.model_id,
    filePath: v.file_path,
    fileName: v.file_name,
    fileSize: v.file_size,
    externalUrl: v.external_url,
  };
}

/** 모델 삭제: 제작자가 올린 샘플 이미지와 모델 파일은 지우고, 다른 사용자의 이미지는 연결만 끊는다. */
export function deleteModel(modelId: number, userId: number): void {
  const db = getDb();
  const owner = db.prepare("SELECT user_id FROM models WHERE id = ?").get(modelId) as { user_id: number } | undefined;
  if (!owner) throw new UserError("찾을 수 없습니다.", 404);
  if (owner.user_id !== userId) throw new UserError("권한이 없습니다.", 403);
  const images = db
    .prepare("SELECT file_name, thumb_name FROM images WHERE model_id = ? AND user_id = ?")
    .all(modelId, userId) as { file_name: string; thumb_name: string }[];
  const files = db.prepare("SELECT file_path FROM model_versions WHERE model_id = ?").all(modelId) as {
    file_path: string | null;
  }[];
  db.transaction(() => {
    db.prepare("DELETE FROM images WHERE model_id = ? AND user_id = ?").run(modelId, userId);
    db.prepare("DELETE FROM models WHERE id = ?").run(modelId);
  })();
  for (const img of images) deleteImageFiles(img.file_name, img.thumb_name);
  for (const f of files) deleteModelFile(f.file_path);
}

export function deleteImage(imageId: number, userId: number): void {
  const db = getDb();
  const img = db.prepare("SELECT user_id, file_name, thumb_name FROM images WHERE id = ?").get(imageId) as
    | { user_id: number; file_name: string; thumb_name: string }
    | undefined;
  if (!img) throw new UserError("찾을 수 없습니다.", 404);
  if (img.user_id !== userId) throw new UserError("권한이 없습니다.", 403);
  db.prepare("DELETE FROM images WHERE id = ?").run(imageId);
  deleteImageFiles(img.file_name, img.thumb_name);
}
