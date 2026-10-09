// 개발용 샘플 데이터 생성: npm run seed (기존 데이터가 있으면 npm run seed -- --force)
// 이미지는 SVG 로 절차적으로 만든 추상/풍경 그림이고, 모델 파일은 텐서가 없는 빈 safetensors 파일이다.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { emptyParams, formatA1111, type GenerationParams, type MetadataSource } from "@/lib/generation";
import { DATA_DIR, getDb } from "@/lib/server/db";
import { hashPassword } from "@/lib/server/password";
import { DIRS, randomName, saveImage } from "@/lib/server/storage";
import { artSvg, rng, type ArtStyle } from "./lib/art";
import {
  BASE_CHECKPOINT,
  CREATORS,
  MEMBER_NAMES,
  MODELS,
  NEGATIVES,
  QUALITY,
  SAMPLER_CHOICES,
  SIZES,
  comfyGraph,
  sampleSafetensors,
  slug,
  type Base,
} from "./lib/seed-defs";
import { insertPngText } from "./lib/png-text";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const R = rng(20261009);
const DEMO_PASSWORD = "demo1234";

interface MadeImage {
  saved: Awaited<ReturnType<typeof saveImage>>;
  meta: GenerationParams;
  source: MetadataSource | null;
}

async function makeImage(opts: {
  style: ArtStyle;
  subject: string;
  base: Base;
  modelName: string;
  loraName?: string;
  trigger?: string[];
  checkpointHash?: string;
}): Promise<MadeImage> {
  const [w, h] = R.pick(SIZES);
  const seed = R.int(1, 2 ** 32 - 1);
  const svg = artSvg(opts.style, seed, w, h);
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 8 }).toBuffer();

  const [sampler, scheduler] = R.pick(SAMPLER_CHOICES);
  const quality = [...QUALITY].sort(() => R.next() - 0.5).slice(0, R.int(2, 4));
  const promptParts = [...quality, ...(opts.trigger ?? []), opts.subject];
  if (opts.loraName) promptParts.push(`<lora:${opts.loraName}:${R.pick(["0.6", "0.7", "0.8", "1"])}>`);
  const meta = emptyParams();
  meta.prompt = promptParts.join(", ");
  meta.negativePrompt = R.pick(NEGATIVES);
  meta.sampler = sampler;
  meta.scheduler = scheduler;
  meta.steps = R.pick([20, 24, 25, 28, 30, 35, 40]);
  meta.cfgScale = R.pick([3.5, 4, 5, 5.5, 6, 6.5, 7, 7.5]);
  meta.seed = String(seed);
  meta.size = `${w}x${h}`;
  meta.model = opts.modelName;
  meta.modelHash = opts.checkpointHash ?? crypto.createHash("sha256").update(opts.modelName).digest("hex").slice(0, 10);
  if (opts.base.startsWith("SD") || opts.base === "Illustrious" || opts.base === "Pony") meta.clipSkip = R.pick([1, 2, 2]);
  if (R.chance(0.3)) {
    meta.extra["Hires upscale"] = R.pick(["1.5", "2"]);
    meta.extra["Hires upscaler"] = R.pick(["4x-UltraSharp", "R-ESRGAN 4x+ Anime6B", "Latent"]);
    meta.extra["Denoising strength"] = R.pick(["0.35", "0.4", "0.5"]);
  }
  meta.extra["Version"] = R.pick(["v1.10.1", "f2.0.1v1.10.1", "v1.9.4"]);

  // 원본 파일에 실제로 메타데이터를 넣어 둔다 (A1111 대부분, 일부 ComfyUI, 일부는 정보 없음)
  const roll = R.next();
  let source: MetadataSource | null;
  let file: Buffer;
  if (roll < 0.07) {
    file = png;
    source = null;
  } else if (roll < 0.22) {
    file = insertPngText(png, { prompt: comfyGraph(meta) });
    source = "comfyui";
    for (const k of Object.keys(meta.extra)) delete meta.extra[k];
    meta.modelHash = null;
    meta.clipSkip = null;
  } else {
    file = insertPngText(png, { parameters: formatA1111(meta) });
    source = "a1111";
  }
  const saved = await saveImage(file);
  return { saved, meta: source ? meta : emptyParams(), source };
}

function spread(created: number, trending: boolean): number {
  const u = trending ? Math.pow(R.next(), 0.35) : Math.pow(R.next(), 1.4);
  return Math.round(created + (NOW - created) * u);
}

async function main() {
  const force = process.argv.includes("--force");
  const dbPath = path.join(DATA_DIR, "app.db");
  if (fs.existsSync(dbPath)) {
    if (!force) {
      console.error(`이미 데이터가 있습니다 (${dbPath}).\n모두 지우고 다시 만들려면: npm run seed -- --force`);
      process.exit(1);
    }
    for (const p of ["app.db", "app.db-wal", "app.db-shm", "uploads", "tmp"]) {
      fs.rmSync(path.join(DATA_DIR, p), { recursive: true, force: true });
    }
  }

  const db = getDb();
  const insertUser = db.prepare(
    "INSERT INTO users (username, display_name, password_hash, bio, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const pw = hashPassword(DEMO_PASSWORD);
  const userIds = new Map<string, number>();
  for (const c of CREATORS) {
    userIds.set(c.username, Number(insertUser.run(c.username, c.displayName, pw, c.bio, NOW - 240 * DAY).lastInsertRowid));
  }
  const members: number[] = [];
  for (let i = 1; i <= 90; i++) {
    const name = `${MEMBER_NAMES[i % MEMBER_NAMES.length]}${i > MEMBER_NAMES.length ? i : ""}`;
    members.push(Number(insertUser.run(`member${String(i).padStart(2, "0")}`, name, pw, "", NOW - R.range(5, 230) * DAY).lastInsertRowid));
  }

  const insertModel = db.prepare(
    "INSERT INTO models (user_id, name, type, description, nsfw, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
  );
  const insertVersion = db.prepare(
    `INSERT INTO model_versions (model_id, name, base_model, trigger_words, description, file_path, file_name, file_size, sha256, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const upsertTag = db.prepare("INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO UPDATE SET name = name RETURNING id");
  const linkTag = db.prepare("INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)");
  const insertImage = db.prepare(
    `INSERT INTO images (user_id, model_id, version_id, file_name, thumb_name, mime, width, height, dominant_color,
       prompt, negative_prompt, sampler, scheduler, steps, cfg_scale, seed, clip_skip, size, gen_model, gen_model_hash,
       extra, meta_source, nsfw, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  );
  const addImage = (userId: number, modelId: number | null, versionId: number | null, img: MadeImage, at: number) => {
    const m = img.meta;
    return Number(
      insertImage.run(
        userId, modelId, versionId, img.saved.fileName, img.saved.thumbName, img.saved.mime, img.saved.width, img.saved.height,
        img.saved.dominantColor, m.prompt, m.negativePrompt, m.sampler, m.scheduler, m.steps, m.cfgScale, m.seed, m.clipSkip,
        m.size, m.model, m.modelHash, JSON.stringify(m.extra), img.source, at,
      ).lastInsertRowid,
    );
  };
  const insertDownload = db.prepare("INSERT INTO downloads (model_id, version_id, user_id, created_at) VALUES (?, ?, ?, ?)");
  const insertModelLike = db.prepare("INSERT OR IGNORE INTO model_likes (user_id, model_id, created_at) VALUES (?, ?, ?)");
  const insertImageLike = db.prepare("INSERT OR IGNORE INTO image_likes (user_id, image_id, created_at) VALUES (?, ?, ?)");

  fs.mkdirSync(DIRS.models, { recursive: true });
  const allImages: { id: number; at: number; pop: number }[] = [];
  let imageCount = 0;

  for (const [mi, def] of MODELS.entries()) {
    const creatorId = userIds.get(def.creator)!;
    const created = NOW - def.ageDays * DAY;
    const lastVersionAt = created + Math.max(0, ...def.versions.map((v) => (v.after ?? 0) * DAY));
    const modelId = Number(insertModel.run(creatorId, def.name, def.type, def.description, created, lastVersionAt).lastInsertRowid);
    for (const t of def.tags) linkTag.run(modelId, (upsertTag.get(t) as { id: number }).id);

    const versionIds: { id: number; at: number }[] = [];
    for (const v of def.versions) {
      const at = created + (v.after ?? 0) * DAY;
      const fileName = `${slug(def.name, mi)}_${v.name.replace(/[^\w.]/g, "")}.${def.type === "WORKFLOW" ? "json" : "safetensors"}`;
      const content =
        def.type === "WORKFLOW"
          ? Buffer.from(JSON.stringify({ note: "그림터 샘플 데이터 - 실제 워크플로가 아닙니다" }))
          : sampleSafetensors("그림터 샘플 데이터 - 실제 모델이 아닙니다");
      const stored = `${randomName()}${path.extname(fileName)}`;
      fs.writeFileSync(path.join(DIRS.models, stored), content);
      const sha = crypto.createHash("sha256").update(content).digest("hex");
      const versionId = Number(
        insertVersion.run(modelId, v.name, v.base, JSON.stringify(v.trigger ?? []), v.notes ?? "", stored, fileName, content.length, sha, at)
          .lastInsertRowid,
      );
      versionIds.push({ id: versionId, at });

      // 제작자 샘플 이미지
      const isCheckpoint = def.type === "CHECKPOINT";
      const count = R.int(3, 6);
      for (let k = 0; k < count; k++) {
        const img = await makeImage({
          style: R.pick(def.styles),
          subject: R.pick(def.subjects),
          base: v.base,
          modelName: isCheckpoint ? `${slug(def.name, mi)}_${v.name}` : BASE_CHECKPOINT[v.base],
          loraName: def.type === "LORA" || def.type === "LYCORIS" ? `${slug(def.name, mi)}_${v.name}` : undefined,
          trigger: v.trigger,
          checkpointHash: isCheckpoint ? sha.slice(0, 10) : undefined,
        });
        const id = addImage(creatorId, modelId, versionId, img, at + k * 60_000);
        allImages.push({ id, at: at + k * 60_000, pop: def.popularity });
        imageCount++;
      }
    }

    // 커뮤니티 이미지 (다른 제작자들)
    const others = CREATORS.filter((c) => c.username !== def.creator);
    const communityCount = Math.round(def.popularity * R.range(0.2, 0.8));
    for (let k = 0; k < communityCount; k++) {
      const v = R.pick(versionIds);
      const ver = def.versions[versionIds.indexOf(v)];
      const at = spread(v.at, Boolean(def.trending));
      const img = await makeImage({
        style: R.pick(def.styles),
        subject: R.pick(def.subjects),
        base: ver.base,
        modelName: def.type === "CHECKPOINT" ? `${slug(def.name, mi)}_${ver.name}` : BASE_CHECKPOINT[ver.base],
        loraName: def.type === "LORA" || def.type === "LYCORIS" ? `${slug(def.name, mi)}_${ver.name}` : undefined,
        trigger: ver.trigger,
      });
      const id = addImage(userIds.get(R.pick(others).username)!, modelId, v.id, img, at);
      allImages.push({ id, at, pop: def.popularity });
      imageCount++;
    }

    // 다운로드·좋아요 (기간별 정렬이 달라지도록 시점을 퍼뜨린다)
    db.transaction(() => {
      const downloads = Math.round(def.popularity * R.range(25, 70) * (def.trending ? 0.7 : 1));
      for (let d = 0; d < downloads; d++) {
        const v = R.pick(versionIds);
        insertDownload.run(modelId, v.id, R.chance(0.5) ? R.pick(members) : null, spread(v.at, Boolean(def.trending)));
      }
      const likes = Math.min(members.length, Math.round(downloads * R.range(0.12, 0.3)));
      const shuffled = [...members].sort(() => R.next() - 0.5).slice(0, likes);
      for (const u of shuffled) insertModelLike.run(u, modelId, spread(created, Boolean(def.trending)));
    })();
    console.log(`✓ ${def.name}`);
  }

  // 모델과 연결되지 않은 이미지 몇 장
  const freeStyles: ArtStyle[] = ["sunset", "aurora", "waves", "lowpoly", "city", "blossom"];
  for (let k = 0; k < 8; k++) {
    const img = await makeImage({
      style: R.pick(freeStyles),
      subject: R.pick(["wallpaper, scenic view", "dreamy landscape", "abstract shapes, gradient"]),
      base: "SDXL",
      modelName: BASE_CHECKPOINT.SDXL,
    });
    const at = NOW - R.range(0.05, 40) * DAY;
    const id = addImage(userIds.get(R.pick(CREATORS).username)!, null, null, img, at);
    allImages.push({ id, at, pop: 4 });
    imageCount++;
  }

  db.transaction(() => {
    for (const img of allImages) {
      const n = Math.min(members.length, Math.round(img.pop * R.range(0, 4)));
      for (const u of [...members].sort(() => R.next() - 0.5).slice(0, n)) {
        insertImageLike.run(u, img.id, Math.round(img.at + (NOW - img.at) * Math.pow(R.next(), 0.6)));
      }
    }
  })();

  console.log(`\n완료: 모델 ${MODELS.length}개, 이미지 ${imageCount}장, 사용자 ${CREATORS.length + members.length}명`);
  console.log(`데모 계정: ${CREATORS.map((c) => c.username).join(", ")} / 비밀번호 ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
