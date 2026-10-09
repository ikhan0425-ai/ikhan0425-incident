import "server-only";
import { PAGE_SIZE } from "@/lib/constants";
import { periodStart, type ImageFilters, type ModelFilters } from "@/lib/filters";
import type { GenerationParams, MetadataSource } from "@/lib/generation";
import type {
  ImageCardData,
  ModelCardData,
  ModelDetailData,
  ModelOption,
  ModelVersionData,
  Paged,
} from "@/lib/types";
import { getDb } from "./db";

// 읽기 전용 쿼리. better-sqlite3 는 동기 API 이므로, 호출하는 서버 컴포넌트는
// 먼저 params/searchParams/cookies 같은 요청 시점 API 를 await 해야 빌드 때 미리 렌더링되지 않는다.

function likeEscape(s: string): string {
  return `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const thumbUrl = (name: string) => `/files/thumbs/${name}`;
const imageUrl = (name: string) => `/files/images/${name}`;

// ---------------------------------------------------------------------------
// 모델 목록
// ---------------------------------------------------------------------------

interface ModelRow {
  id: number;
  name: string;
  type: string;
  nsfw: number;
  created_at: number;
  username: string;
  display_name: string;
  downloads: number;
  likes: number;
  image_count: number;
  base_model: string | null;
  cover_id: number | null;
}

interface CoverRow {
  id: number;
  thumb_name: string;
  width: number;
  height: number;
  dominant_color: string | null;
  nsfw: number;
}

const modelCardSelect = (extraColumns = "") => `
  SELECT m.id, m.name, m.type, m.nsfw, m.created_at, u.username, u.display_name,
    (SELECT COUNT(*) FROM downloads d WHERE d.model_id = m.id) AS downloads,
    (SELECT COUNT(*) FROM model_likes l WHERE l.model_id = m.id) AS likes,
    (SELECT COUNT(*) FROM images i WHERE i.model_id = m.id) AS image_count,
    (SELECT v.base_model FROM model_versions v WHERE v.model_id = m.id ORDER BY v.id DESC LIMIT 1) AS base_model,
    (SELECT i.id FROM images i WHERE i.model_id = m.id
       ORDER BY (i.user_id = m.user_id) DESC, i.version_id DESC, i.id ASC LIMIT 1) AS cover_id
    ${extraColumns}
  FROM models m JOIN users u ON u.id = m.user_id`;

function toModelCards(rows: ModelRow[]): ModelCardData[] {
  const coverIds = rows.map((r) => r.cover_id).filter((id): id is number => id !== null);
  const covers = new Map<number, CoverRow>();
  if (coverIds.length) {
    const found = getDb()
      .prepare(
        `SELECT id, thumb_name, width, height, dominant_color, nsfw FROM images
         WHERE id IN (${coverIds.map(() => "?").join(",")})`,
      )
      .all(...coverIds) as CoverRow[];
    for (const c of found) covers.set(c.id, c);
  }
  return rows.map((r) => {
    const c = r.cover_id !== null ? covers.get(r.cover_id) : undefined;
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      nsfw: Boolean(r.nsfw),
      createdAt: r.created_at,
      baseModel: r.base_model,
      creator: { username: r.username, displayName: r.display_name },
      stats: { downloads: r.downloads, likes: r.likes, images: r.image_count },
      cover: c
        ? {
            thumbUrl: thumbUrl(c.thumb_name),
            width: c.width,
            height: c.height,
            color: c.dominant_color,
            nsfw: Boolean(c.nsfw) || Boolean(r.nsfw),
          }
        : null,
    };
  });
}

export function listModels(
  f: ModelFilters,
  page = 1,
  opts: { userId?: number; pageSize?: number } = {},
): Paged<ModelCardData> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const where: string[] = [];
  const args: (string | number)[] = [];

  if (opts.userId) {
    where.push("m.user_id = ?");
    args.push(opts.userId);
  }
  if (f.types.length) {
    where.push(`m.type IN (${f.types.map(() => "?").join(",")})`);
    args.push(...f.types);
  }
  if (f.baseModels.length) {
    where.push(
      `EXISTS (SELECT 1 FROM model_versions v WHERE v.model_id = m.id AND v.base_model IN (${f.baseModels
        .map(() => "?")
        .join(",")}))`,
    );
    args.push(...f.baseModels);
  }
  // 태그는 모두 포함해야 한다 (AND)
  for (const tag of f.tags) {
    where.push(
      "EXISTS (SELECT 1 FROM model_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.model_id = m.id AND t.name = ?)",
    );
    args.push(tag);
  }
  if (f.q) {
    const like = likeEscape(f.q);
    where.push(`(m.name LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM model_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.model_id = m.id AND t.name LIKE ? ESCAPE '\\'))`);
    args.push(like, like, like, like);
  }

  const since = periodStart(f.period);
  let order: string;
  let scoreSelect = "";
  const scoreArgs: number[] = [];
  if (f.sort === "downloads" || f.sort === "likes") {
    // 기간 정렬: 해당 기간 안에 발생한 다운로드/좋아요 수로 정렬
    const table = f.sort === "downloads" ? "downloads" : "model_likes";
    scoreSelect = `, (SELECT COUNT(*) FROM ${table} x WHERE x.model_id = m.id AND x.created_at >= ?) AS score`;
    scoreArgs.push(since);
    order = "score DESC, m.created_at DESC";
  } else {
    if (since) {
      where.push("m.created_at >= ?");
      args.push(since);
    }
    order = "m.created_at DESC, m.id DESC";
  }

  const sql = `${modelCardSelect(scoreSelect)}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order} LIMIT ? OFFSET ?`;
  const rows = getDb()
    .prepare(sql)
    .all(...scoreArgs, ...args, pageSize + 1, (page - 1) * pageSize) as ModelRow[];
  return { items: toModelCards(rows.slice(0, pageSize)), hasMore: rows.length > pageSize };
}

export function popularTags(limit = 30): { name: string; count: number }[] {
  return getDb()
    .prepare(
      `SELECT t.name, COUNT(*) AS count FROM model_tags mt JOIN tags t ON t.id = mt.tag_id
       GROUP BY t.id ORDER BY count DESC, t.name LIMIT ?`,
    )
    .all(limit) as { name: string; count: number }[];
}

// ---------------------------------------------------------------------------
// 모델 상세
// ---------------------------------------------------------------------------

export function getModelDetail(id: number, viewerId: number | null): ModelDetailData | null {
  const db = getDb();
  const m = db
    .prepare(
      `SELECT m.*, u.username, u.display_name FROM models m JOIN users u ON u.id = m.user_id WHERE m.id = ?`,
    )
    .get(id) as
    | {
        id: number;
        user_id: number;
        name: string;
        type: string;
        description: string;
        nsfw: number;
        created_at: number;
        updated_at: number;
        username: string;
        display_name: string;
      }
    | undefined;
  if (!m) return null;

  const tags = (
    db
      .prepare("SELECT t.name FROM model_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.model_id = ? ORDER BY t.name")
      .all(id) as { name: string }[]
  ).map((t) => t.name);

  const versions = (
    db
      .prepare(
        `SELECT v.*, (SELECT COUNT(*) FROM downloads d WHERE d.version_id = v.id) AS downloads
         FROM model_versions v WHERE v.model_id = ? ORDER BY v.id DESC`,
      )
      .all(id) as {
      id: number;
      name: string;
      base_model: string;
      trigger_words: string;
      description: string;
      file_name: string | null;
      file_size: number | null;
      sha256: string | null;
      external_url: string | null;
      created_at: number;
      downloads: number;
    }[]
  ).map(
    (v): ModelVersionData => ({
      id: v.id,
      name: v.name,
      baseModel: v.base_model,
      triggerWords: safeJsonArray(v.trigger_words),
      description: v.description,
      fileName: v.file_name,
      fileSize: v.file_size,
      sha256: v.sha256,
      externalUrl: v.external_url,
      createdAt: v.created_at,
      downloads: v.downloads,
    }),
  );

  const stats = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM downloads WHERE model_id = ?) AS downloads,
              (SELECT COUNT(*) FROM model_likes WHERE model_id = ?) AS likes,
              (SELECT COUNT(*) FROM images WHERE model_id = ?) AS images`,
    )
    .get(id, id, id) as { downloads: number; likes: number; images: number };

  const likedByMe = viewerId
    ? Boolean(db.prepare("SELECT 1 FROM model_likes WHERE user_id = ? AND model_id = ?").get(viewerId, id))
    : false;

  return {
    id: m.id,
    name: m.name,
    type: m.type,
    description: m.description,
    nsfw: Boolean(m.nsfw),
    createdAt: m.created_at,
    updatedAt: m.updated_at,
    creator: { id: m.user_id, username: m.username, displayName: m.display_name },
    tags,
    versions,
    stats,
    likedByMe,
  };
}

function safeJsonArray(s: string): string[] {
  try {
    const v: unknown = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function getModelOwner(id: number): number | null {
  const row = getDb().prepare("SELECT user_id FROM models WHERE id = ?").get(id) as { user_id: number } | undefined;
  return row?.user_id ?? null;
}

export function searchModelOptions(q: string, limit = 10): ModelOption[] {
  const db = getDb();
  const models = db
    .prepare(
      `SELECT id, name, type FROM models WHERE name LIKE ? ESCAPE '\\'
       ORDER BY (SELECT COUNT(*) FROM downloads d WHERE d.model_id = models.id) DESC LIMIT ?`,
    )
    .all(likeEscape(q), limit) as { id: number; name: string; type: string }[];
  const versionStmt = db.prepare(
    "SELECT id, name, base_model AS baseModel FROM model_versions WHERE model_id = ? ORDER BY id DESC",
  );
  return models.map((m) => ({ ...m, versions: versionStmt.all(m.id) as ModelOption["versions"] }));
}

export function getModelOption(versionId: number): ModelOption | null {
  const row = getDb().prepare("SELECT model_id FROM model_versions WHERE id = ?").get(versionId) as
    | { model_id: number }
    | undefined;
  if (!row) return null;
  const db = getDb();
  const m = db.prepare("SELECT id, name, type FROM models WHERE id = ?").get(row.model_id) as
    | { id: number; name: string; type: string }
    | undefined;
  if (!m) return null;
  const versions = db
    .prepare("SELECT id, name, base_model AS baseModel FROM model_versions WHERE model_id = ? ORDER BY id DESC")
    .all(m.id) as ModelOption["versions"];
  return { ...m, versions };
}

// ---------------------------------------------------------------------------
// 이미지
// ---------------------------------------------------------------------------

interface ImageRow {
  id: number;
  file_name: string;
  thumb_name: string;
  width: number;
  height: number;
  dominant_color: string | null;
  nsfw: number;
  created_at: number;
  prompt: string | null;
  negative_prompt: string | null;
  sampler: string | null;
  scheduler: string | null;
  steps: number | null;
  cfg_scale: number | null;
  seed: string | null;
  clip_skip: number | null;
  size: string | null;
  gen_model: string | null;
  gen_model_hash: string | null;
  extra: string;
  meta_source: string | null;
  username: string;
  display_name: string;
  model_id: number | null;
  model_name: string | null;
  model_type: string | null;
  model_nsfw: number | null;
  version_id: number | null;
  version_name: string | null;
  likes: number;
  liked_by_me: number;
}

function imageSelect(viewerId: number | null, extraColumns = "") {
  return {
    sql: `SELECT i.*, u.username, u.display_name, m.name AS model_name, m.type AS model_type, m.nsfw AS model_nsfw,
        v.name AS version_name,
        (SELECT COUNT(*) FROM image_likes l WHERE l.image_id = i.id) AS likes,
        ${viewerId ? "EXISTS (SELECT 1 FROM image_likes l WHERE l.image_id = i.id AND l.user_id = ?)" : "0"} AS liked_by_me
        ${extraColumns}
      FROM images i
      JOIN users u ON u.id = i.user_id
      LEFT JOIN models m ON m.id = i.model_id
      LEFT JOIN model_versions v ON v.id = i.version_id`,
    args: viewerId ? [viewerId] : [],
  };
}

function toImageCard(r: ImageRow): ImageCardData {
  let extra: Record<string, string> = {};
  try {
    extra = JSON.parse(r.extra) as Record<string, string>;
  } catch {
    // 무시
  }
  const meta: GenerationParams = {
    prompt: r.prompt,
    negativePrompt: r.negative_prompt,
    sampler: r.sampler,
    scheduler: r.scheduler,
    steps: r.steps,
    cfgScale: r.cfg_scale,
    seed: r.seed,
    clipSkip: r.clip_skip,
    size: r.size,
    model: r.gen_model,
    modelHash: r.gen_model_hash,
    extra,
  };
  return {
    id: r.id,
    url: imageUrl(r.file_name),
    thumbUrl: thumbUrl(r.thumb_name),
    width: r.width,
    height: r.height,
    color: r.dominant_color,
    nsfw: Boolean(r.nsfw) || Boolean(r.model_nsfw),
    createdAt: r.created_at,
    user: { username: r.username, displayName: r.display_name },
    likes: r.likes,
    likedByMe: Boolean(r.liked_by_me),
    model:
      r.model_id !== null && r.model_name !== null
        ? {
            id: r.model_id,
            name: r.model_name,
            type: r.model_type ?? "OTHER",
            versionId: r.version_id,
            versionName: r.version_name,
          }
        : null,
    meta,
    metaSource: (r.meta_source as MetadataSource | null) ?? null,
  };
}

export interface ImageQuery extends Partial<ImageFilters> {
  modelId?: number;
  versionId?: number;
  userId?: number;
  excludeUserId?: number;
  pageSize?: number;
  /** 업로드 순서대로 (모델 제작자 샘플처럼 첫 장이 대표 이미지일 때) */
  oldestFirst?: boolean;
}

export function listImages(q: ImageQuery, page: number, viewerId: number | null): Paged<ImageCardData> {
  const pageSize = q.pageSize ?? PAGE_SIZE;
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (q.modelId) {
    where.push("i.model_id = ?");
    args.push(q.modelId);
  }
  if (q.versionId) {
    where.push("i.version_id = ?");
    args.push(q.versionId);
  }
  if (q.userId) {
    where.push("i.user_id = ?");
    args.push(q.userId);
  }
  if (q.excludeUserId) {
    where.push("i.user_id != ?");
    args.push(q.excludeUserId);
  }
  if (q.q) {
    const like = likeEscape(q.q);
    where.push("(i.prompt LIKE ? ESCAPE '\\' OR m.name LIKE ? ESCAPE '\\')");
    args.push(like, like);
  }
  const since = periodStart(q.period ?? "all");
  let order = q.oldestFirst ? "i.created_at ASC, i.id ASC" : "i.created_at DESC, i.id DESC";
  let scoreSelect = "";
  const scoreArgs: number[] = [];
  if (q.sort === "likes") {
    scoreSelect = ", (SELECT COUNT(*) FROM image_likes x WHERE x.image_id = i.id AND x.created_at >= ?) AS score";
    scoreArgs.push(since);
    order = "score DESC, i.created_at DESC";
  } else if (since) {
    where.push("i.created_at >= ?");
    args.push(since);
  }
  const { sql, args: selectArgs } = imageSelect(viewerId, scoreSelect);
  const full = `${sql}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order} LIMIT ? OFFSET ?`;
  const rows = getDb()
    .prepare(full)
    .all(...selectArgs, ...scoreArgs, ...args, pageSize + 1, (page - 1) * pageSize) as ImageRow[];
  return { items: rows.slice(0, pageSize).map(toImageCard), hasMore: rows.length > pageSize };
}

export function getImage(id: number, viewerId: number | null): (ImageCardData & { userId: number }) | null {
  const { sql, args } = imageSelect(viewerId);
  const row = getDb()
    .prepare(`${sql} WHERE i.id = ?`)
    .get(...args, id) as (ImageRow & { user_id: number }) | undefined;
  return row ? { ...toImageCard(row), userId: row.user_id } : null;
}

// ---------------------------------------------------------------------------
// 사용자
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: number;
  username: string;
  displayName: string;
  bio: string;
  createdAt: number;
  stats: { models: number; images: number; downloads: number; likes: number };
}

export function getUserProfile(username: string): UserProfile | null {
  const db = getDb();
  const u = db
    .prepare("SELECT id, username, display_name, bio, created_at FROM users WHERE username = ?")
    .get(username) as
    | { id: number; username: string; display_name: string; bio: string; created_at: number }
    | undefined;
  if (!u) return null;
  const stats = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM models WHERE user_id = @id) AS models,
              (SELECT COUNT(*) FROM images WHERE user_id = @id) AS images,
              (SELECT COUNT(*) FROM downloads d JOIN models m ON m.id = d.model_id WHERE m.user_id = @id) AS downloads,
              (SELECT COUNT(*) FROM model_likes l JOIN models m ON m.id = l.model_id WHERE m.user_id = @id)
                + (SELECT COUNT(*) FROM image_likes l JOIN images i ON i.id = l.image_id WHERE i.user_id = @id) AS likes`,
    )
    .get({ id: u.id }) as UserProfile["stats"];
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    bio: u.bio,
    createdAt: u.created_at,
    stats,
  };
}
