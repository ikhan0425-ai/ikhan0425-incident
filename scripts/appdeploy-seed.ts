// AppDeploy 배포판용 샘플 데이터 생성: npx tsx scripts/appdeploy-seed.ts
// - appdeploy/public/seed/*.webp       샘플 그림 (원본 + 썸네일)
// - appdeploy/public/seed/files/*      샘플 모델 파일 (텐서 없는 빈 safetensors)
// - appdeploy/backend/seed-data.ts     샘플 모델·이미지·통계 (시간은 "며칠 전" 상대값)

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { emptyParams, type GenerationParams, type MetadataSource } from "@/lib/generation";
import { artSvg, rng, type ArtStyle } from "./lib/art";
import {
  BASE_CHECKPOINT,
  CREATORS,
  MODELS,
  NEGATIVES,
  QUALITY,
  SAMPLER_CHOICES,
  SIZES,
  sampleSafetensors,
  slug,
  type Base,
} from "./lib/seed-defs";

const ROOT = path.resolve(__dirname, "..", "appdeploy");
const SEED_DIR = path.join(ROOT, "public", "seed");
const R = rng(20261010);
// 샘플 그림은 넣지 않는다 (요청으로 모두 뺐다). true 로 바꾸면 그림과 그림 좋아요 수가 다시 생긴다.
// false 여도 그림 생성 과정은 그대로 돌려서 난수 순서, 즉 모델 다운로드·좋아요 수가 바뀌지 않게 한다.
const SAMPLE_IMAGES = false;

interface Stat {
  total: number;
  /** 며칠 전 → 횟수 (0~30일) */
  days: Record<number, number>;
  /** 몇 달 전 → 횟수 (0~11달) */
  months: Record<number, number>;
}

function addEvent(stat: Stat, daysAgo: number) {
  stat.total++;
  const d = Math.floor(daysAgo);
  if (d <= 30) stat.days[d] = (stat.days[d] ?? 0) + 1;
  const m = Math.floor(daysAgo / 30.44);
  if (m <= 11) stat.months[m] = (stat.months[m] ?? 0) + 1;
}

const newStat = (): Stat => ({ total: 0, days: {}, months: {} });

/** 생성 시점(며칠 전) 이후에 발생한 이벤트의 "며칠 전" 값. trending 이면 최근에 몰린다. */
function eventAge(createdAgo: number, trending: boolean): number {
  const u = trending ? Math.pow(R.next(), 0.35) : Math.pow(R.next(), 1.4);
  return createdAgo * (1 - u);
}

async function renderImage(id: string, style: ArtStyle) {
  const [w, h] = R.pick(SIZES);
  const seed = R.int(1, 2 ** 32 - 1);
  const base = sharp(Buffer.from(artSvg(style, seed, w, h)));
  const png = await base.png().toBuffer();
  if (SAMPLE_IMAGES) await sharp(png).webp({ quality: 86 }).toFile(path.join(SEED_DIR, `${id}.webp`));
  const { dominant } = await sharp(png).resize(32, 32, { fit: "cover" }).stats();
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return { w, h, seed, color: `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}` };
}

function makeMeta(opts: {
  seed: number;
  w: number;
  h: number;
  subject: string;
  base: Base;
  modelName: string;
  loraName?: string;
  trigger?: string[];
  checkpointHash?: string;
}): { meta: GenerationParams; source: MetadataSource | null } {
  const roll = R.next();
  if (roll < 0.07) return { meta: emptyParams(), source: null };
  const [sampler, scheduler] = R.pick(SAMPLER_CHOICES);
  const quality = [...QUALITY].sort(() => R.next() - 0.5).slice(0, R.int(2, 4));
  const parts = [...quality, ...(opts.trigger ?? []), opts.subject];
  if (opts.loraName) parts.push(`<lora:${opts.loraName}:${R.pick(["0.6", "0.7", "0.8", "1"])}>`);
  const meta = emptyParams();
  meta.prompt = parts.join(", ");
  meta.negativePrompt = R.pick(NEGATIVES);
  meta.sampler = sampler;
  meta.scheduler = scheduler;
  meta.steps = R.pick([20, 24, 25, 28, 30, 35, 40]);
  meta.cfgScale = R.pick([3.5, 4, 5, 5.5, 6, 6.5, 7, 7.5]);
  meta.seed = String(opts.seed);
  meta.size = `${opts.w}x${opts.h}`;
  meta.model = opts.modelName;
  if (roll < 0.22) return { meta, source: "comfyui" };
  meta.modelHash = opts.checkpointHash ?? crypto.createHash("sha256").update(opts.modelName).digest("hex").slice(0, 10);
  if (opts.base.startsWith("SD") || opts.base === "Illustrious" || opts.base === "Pony") meta.clipSkip = R.pick([1, 2, 2]);
  if (R.chance(0.3)) {
    meta.extra["Hires upscale"] = R.pick(["1.5", "2"]);
    meta.extra["Hires upscaler"] = R.pick(["4x-UltraSharp", "R-ESRGAN 4x+ Anime6B", "Latent"]);
    meta.extra["Denoising strength"] = R.pick(["0.35", "0.4", "0.5"]);
  }
  meta.extra["Version"] = R.pick(["v1.10.1", "f2.0.1v1.10.1", "v1.9.4"]);
  return { meta, source: "a1111" };
}

async function main() {
  fs.rmSync(SEED_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(SEED_DIR, "files"), { recursive: true });

  const profiles = CREATORS.map((c) => ({
    id: `seed-${c.username}`,
    displayName: c.displayName,
    bio: c.bio,
    ageDays: 240,
  }));
  const models: unknown[] = [];
  const images: unknown[] = [];
  const modelDownloads: Record<string, Stat> = {};
  const modelLikes: Record<string, Stat> = {};
  const imageLikes: Record<string, Stat> = {};
  let imgNo = 0;

  const addImage = async (o: {
    ownerId: string;
    modelId: string | null;
    versionId: string | null;
    style: ArtStyle;
    subject: string;
    base: Base;
    modelName: string;
    loraName?: string;
    trigger?: string[];
    checkpointHash?: string;
    ageDays: number;
    popularity: number;
  }) => {
    const id = `seed-i${String(++imgNo).padStart(3, "0")}`;
    const r = await renderImage(id, o.style);
    const { meta, source } = makeMeta({ ...o, seed: r.seed, w: r.w, h: r.h });
    images.push({
      id,
      ownerId: o.ownerId,
      modelId: o.modelId,
      versionId: o.versionId,
      file: `seed/${id}.webp`,
      // 배포 파일 수 제한(바이너리 200개) 때문에 샘플은 썸네일을 따로 두지 않고 원본을 쓴다
      thumb: `seed/${id}.webp`,
      width: r.w,
      height: r.h,
      color: r.color,
      meta,
      source,
      nsfw: false,
      ageDays: Number(o.ageDays.toFixed(4)),
    });
    const likes = newStat();
    const n = Math.round(o.popularity * R.range(0, 4));
    for (let k = 0; k < n; k++) addEvent(likes, o.ageDays * (1 - Math.pow(R.next(), 0.6)));
    imageLikes[id] = likes;
  };

  for (const [mi, def] of MODELS.entries()) {
    const modelId = `seed-m${String(mi + 1).padStart(2, "0")}`;
    const ownerId = `seed-${def.creator}`;
    const versions = def.versions.map((v, vi) => {
      const fileName = `${slug(def.name, mi)}_${v.name.replace(/[^\w.]/g, "")}.${def.type === "WORKFLOW" ? "json" : "safetensors"}`;
      const content =
        def.type === "WORKFLOW"
          ? Buffer.from(JSON.stringify({ note: "그림터 샘플 데이터 - 실제 워크플로가 아닙니다" }))
          : sampleSafetensors(`그림터 샘플 데이터 - 실제 모델이 아닙니다 (${fileName})`);
      fs.writeFileSync(path.join(SEED_DIR, "files", fileName), content);
      return {
        id: `${modelId}-v${vi + 1}`,
        name: v.name,
        baseModel: v.base,
        triggerWords: v.trigger ?? [],
        description: v.notes ?? "",
        fileName,
        fileSize: content.length,
        sha256: crypto.createHash("sha256").update(content).digest("hex"),
        externalUrl: null,
        file: `seed/files/${fileName}`,
        ageDays: Number(Math.max(0, def.ageDays - (v.after ?? 0)).toFixed(4)),
      };
    });
    const updatedAgeDays = Math.min(...versions.map((v) => v.ageDays));
    models.push({
      id: modelId,
      ownerId,
      name: def.name,
      type: def.type,
      description: def.description,
      nsfw: false,
      tags: def.tags,
      ageDays: def.ageDays,
      updatedAgeDays,
      versions,
    });

    const isCheckpoint = def.type === "CHECKPOINT";
    const isLora = def.type === "LORA" || def.type === "LYCORIS";
    for (const v of versions) {
      const ver = def.versions[versions.indexOf(v)];
      const count = R.int(2, 4);
      for (let k = 0; k < count; k++) {
        await addImage({
          ownerId,
          modelId,
          versionId: v.id,
          style: R.pick(def.styles),
          subject: R.pick(def.subjects),
          base: ver.base,
          modelName: isCheckpoint ? `${slug(def.name, mi)}_${v.name}` : BASE_CHECKPOINT[ver.base],
          loraName: isLora ? `${slug(def.name, mi)}_${v.name}` : undefined,
          trigger: ver.trigger,
          checkpointHash: isCheckpoint ? v.sha256.slice(0, 10) : undefined,
          ageDays: v.ageDays - k * 0.0007,
          popularity: def.popularity,
        });
      }
    }
    const others = CREATORS.filter((c) => c.username !== def.creator);
    const community = Math.round(def.popularity * R.range(0.15, 0.5));
    for (let k = 0; k < community; k++) {
      const vi = R.int(0, versions.length - 1);
      const v = versions[vi];
      const ver = def.versions[vi];
      await addImage({
        ownerId: `seed-${R.pick(others).username}`,
        modelId,
        versionId: v.id,
        style: R.pick(def.styles),
        subject: R.pick(def.subjects),
        base: ver.base,
        modelName: isCheckpoint ? `${slug(def.name, mi)}_${v.name}` : BASE_CHECKPOINT[ver.base],
        loraName: isLora ? `${slug(def.name, mi)}_${v.name}` : undefined,
        trigger: ver.trigger,
        ageDays: eventAge(v.ageDays, Boolean(def.trending)),
        popularity: def.popularity,
      });
    }

    const dl = newStat();
    const downloads = Math.round(def.popularity * R.range(25, 70) * (def.trending ? 0.7 : 1));
    for (let d = 0; d < downloads; d++) addEvent(dl, eventAge(R.pick(versions).ageDays, Boolean(def.trending)));
    modelDownloads[modelId] = dl;
    const lk = newStat();
    const likes = Math.min(90, Math.round(downloads * R.range(0.12, 0.3)));
    for (let l = 0; l < likes; l++) addEvent(lk, eventAge(def.ageDays, Boolean(def.trending)));
    modelLikes[modelId] = lk;
    console.log(`✓ ${def.name}`);
  }

  const freeStyles: ArtStyle[] = ["sunset", "aurora", "waves", "lowpoly", "city", "blossom"];
  for (let k = 0; k < 6; k++) {
    await addImage({
      ownerId: `seed-${R.pick(CREATORS).username}`,
      modelId: null,
      versionId: null,
      style: R.pick(freeStyles),
      subject: R.pick(["wallpaper, scenic view", "dreamy landscape", "abstract shapes, gradient"]),
      base: "SDXL",
      modelName: BASE_CHECKPOINT.SDXL,
      ageDays: R.range(0.05, 40),
      popularity: 4,
    });
  }

  const data = {
    profiles,
    models,
    images: SAMPLE_IMAGES ? images : [],
    modelDownloads,
    modelLikes,
    imageLikes: SAMPLE_IMAGES ? imageLikes : {},
  };
  const out = `// 자동 생성 파일 (scripts/appdeploy-seed.ts). 직접 고치지 마세요.
// 샘플 그림은 넣지 않았고, 모델 파일은 실제 모델이 아닌 빈 파일입니다.
// 시간은 "며칠 전" 상대값이라 언제 봐도 최근 활동이 있는 것처럼 보입니다.

import type { SeedData } from './lib/seed-types';

export const SEED: SeedData = ${JSON.stringify(data, null, 1)};
`;
  fs.writeFileSync(path.join(ROOT, "backend", "seed-data.ts"), out);
  const bytes = fs.readdirSync(SEED_DIR).reduce((n, f) => {
    const p = path.join(SEED_DIR, f);
    return n + (fs.statSync(p).isFile() ? fs.statSync(p).size : 0);
  }, 0);
  console.log(`\n이미지 ${data.images.length}장, 모델 ${models.length}개, 정적 파일 ${(bytes / 1024 / 1024).toFixed(1)}MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
