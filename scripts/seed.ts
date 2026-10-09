// 개발용 샘플 데이터 생성: npm run seed (기존 데이터가 있으면 npm run seed -- --force)
// 이미지는 SVG 로 절차적으로 만든 추상/풍경 그림이고, 모델 파일은 텐서가 없는 빈 safetensors 파일이다.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { BASE_MODELS, type ModelType } from "@/lib/constants";
import { emptyParams, formatA1111, type GenerationParams, type MetadataSource } from "@/lib/generation";
import { DATA_DIR, getDb } from "@/lib/server/db";
import { hashPassword } from "@/lib/server/password";
import { DIRS, randomName, saveImage } from "@/lib/server/storage";
import { artSvg, rng, type ArtStyle } from "./lib/art";
import { insertPngText } from "./lib/png-text";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const R = rng(20261009);
const DEMO_PASSWORD = "demo1234";

type Base = (typeof BASE_MODELS)[number];

interface VersionDef {
  name: string;
  base: Base;
  trigger?: string[];
  notes?: string;
  /** 모델 생성 후 며칠 뒤에 올렸는지 */
  after?: number;
}

interface ModelDef {
  name: string;
  type: ModelType;
  creator: string;
  tags: string[];
  description: string;
  styles: ArtStyle[];
  subjects: string[];
  ageDays: number;
  popularity: number;
  /** 최근에 인기가 몰리는 모델 (기간별 정렬 데모용) */
  trending?: boolean;
  versions: VersionDef[];
}

const CREATORS = [
  { username: "minji_art", displayName: "민지아트", bio: "애니메이션·웹툰 스타일 LoRA 를 주로 만들어요. 피드백 환영!" },
  { username: "doyun_ai", displayName: "도윤", bio: "실사 체크포인트 병합 연구 중. 추천 설정은 모델 설명에 적어 둡니다." },
  { username: "sora_lab", displayName: "소라연구소", bio: "ControlNet · 워크플로 · 업스케일러" },
  { username: "hanbit3d", displayName: "한빛3D", bio: "3D, 클레이, 로우폴리 스타일을 좋아합니다." },
  { username: "pixel_jun", displayName: "픽셀준", bio: "16bit 도트 장인 (지망생)" },
  { username: "mukmuk", displayName: "먹먹", bio: "수묵화와 동양화 느낌을 AI 로 재현해 보고 있어요." },
];

const MEMBER_NAMES = [
  "그림쟁이", "새벽감성", "고양이집사", "밤하늘", "초보작가", "코딩하는화가", "라떼한잔", "구름빵", "봄날",
  "도트러버", "실사덕후", "애니덕", "프롬프트장인", "시드수집가", "느긋한곰", "파란펭귄", "달토끼", "별헤는밤",
];

const MODELS: ModelDef[] = [
  {
    name: "파스텔 드림 애니 믹스",
    type: "CHECKPOINT",
    creator: "minji_art",
    tags: ["anime", "illustration", "style"],
    description:
      "몽글몽글한 파스텔 톤 애니메이션 체크포인트입니다.\n\n추천 설정\n- 샘플러: Euler a 또는 DPM++ 2M\n- 스텝: 25~30\n- CFG: 5~7\n- Clip skip: 2\n\n밝은 배경과 부드러운 조명에 특히 강해요.",
    styles: ["pastel", "blossom"],
    subjects: ["1girl, sitting by the window, soft light", "magical girl, floating, sparkles", "cozy cafe interior, warm light", "starry sky, dreamy clouds"],
    ageDays: 140,
    popularity: 9,
    versions: [
      { name: "v1.0", base: "SDXL" },
      { name: "v2.0", base: "Illustrious", notes: "Illustrious 기반으로 다시 병합했어요. 손 표현이 좋아졌습니다.", after: 70 },
    ],
  },
  {
    name: "서울 야경 리얼리스틱",
    type: "CHECKPOINT",
    creator: "doyun_ai",
    tags: ["realistic", "landscape", "architecture"],
    description: "서울의 밤 풍경을 사진처럼 표현하는 실사 체크포인트. 네온 사인과 빗길 반사광이 특징입니다.\n\n추천: DPM++ 2M Karras, 30 스텝, CFG 6",
    styles: ["city"],
    subjects: ["seoul night skyline, neon signs, rain", "city street at night, wet asphalt reflections", "rooftop view, han river, bokeh"],
    ageDays: 95,
    popularity: 8,
    versions: [{ name: "v1.0", base: "SDXL" }],
  },
  {
    name: "한복 스타일 LoRA",
    type: "LORA",
    creator: "minji_art",
    tags: ["clothing", "character", "style", "hanbok"],
    description: "전통 한복과 생활 한복을 자연스럽게 입혀 주는 LoRA 입니다. 가중치 0.6~0.8 을 추천해요.\n\n트리거 단어를 프롬프트 앞쪽에 넣어 주세요.",
    styles: ["blossom", "pastel"],
    subjects: ["1girl, wearing hanbok, cherry blossoms", "traditional korean palace garden, spring", "girl in hanbok holding a fan"],
    ageDays: 5,
    popularity: 7,
    trending: true,
    versions: [{ name: "v1.0", base: "Illustrious", trigger: ["hanbok", "korean traditional clothes"] }],
  },
  {
    name: "수묵 산수화 스타일",
    type: "LORA",
    creator: "mukmuk",
    tags: ["traditional", "landscape", "style"],
    description: "먹의 번짐과 여백을 살린 동양 산수화 스타일 LoRA. 풍경 프롬프트와 잘 어울립니다.",
    styles: ["ink"],
    subjects: ["misty mountains, ink wash painting", "lonely boat on a lake, ink painting", "pine trees on cliffs, traditional painting"],
    ageDays: 60,
    popularity: 6,
    versions: [
      { name: "v1.0", base: "SD 1.5", trigger: ["sumukhwa", "ink wash"] },
      { name: "v1.5", base: "Flux.1", trigger: ["sumukhwa style"], notes: "Flux.1 용으로 다시 학습", after: 40 },
    ],
  },
  {
    name: "클레이 피규어 3D",
    type: "LORA",
    creator: "hanbit3d",
    tags: ["3d", "character", "style"],
    description: "찰흙 피규어처럼 말랑한 3D 질감을 만들어 주는 LoRA. 단색 배경 + 스튜디오 조명 조합을 추천합니다.",
    styles: ["spheres"],
    subjects: ["cute clay figure, studio lighting", "claymation style toy, soft shadows", "colorful clay balls, minimal"],
    ageDays: 33,
    popularity: 6,
    versions: [{ name: "v1.0", base: "SDXL", trigger: ["claystyle"] }],
  },
  {
    name: "16bit 픽셀아트",
    type: "LORA",
    creator: "pixel_jun",
    tags: ["pixel art", "style", "background"],
    description: "레트로 게임 느낌의 16bit 도트 그림을 만들어 줍니다. 생성 후 nearest-neighbor 로 축소하면 더 깔끔해요.",
    styles: ["pixel"],
    subjects: ["pixel art landscape, retro game", "16bit forest, sunset, clouds", "pixel art village, morning"],
    ageDays: 120,
    popularity: 7,
    versions: [{ name: "v1.0", base: "SD 1.5", trigger: ["pixel art", "16bit"] }],
  },
  {
    name: "네온 사이버펑크",
    type: "LORA",
    creator: "doyun_ai",
    tags: ["sci-fi", "style", "architecture"],
    description: "보라·핑크 네온과 비 오는 거리. 사이버펑크 분위기를 강하게 넣어 줍니다. Flux.1 [dev] 에서 테스트했어요.",
    styles: ["city"],
    subjects: ["cyberpunk alley, neon lights, rain", "futuristic city, flying cars, night"],
    ageDays: 2,
    popularity: 5,
    trending: true,
    versions: [{ name: "v1.0", base: "Flux.1", trigger: ["neonpunk"] }],
  },
  {
    name: "로우폴리 월드",
    type: "LORA",
    creator: "hanbit3d",
    tags: ["3d", "landscape", "background"],
    description: "삼각형 면으로 이루어진 로우폴리 3D 배경 스타일.",
    styles: ["lowpoly"],
    subjects: ["low poly landscape, gradient sky", "low poly mountains, geometric"],
    ageDays: 75,
    popularity: 4,
    versions: [{ name: "v1.0", base: "SDXL", trigger: ["lowpoly"] }],
  },
  {
    name: "노을 풍경 체크포인트",
    type: "CHECKPOINT",
    creator: "doyun_ai",
    tags: ["realistic", "landscape"],
    description: "골든아워의 산과 하늘을 따뜻하게 표현하는 풍경 전용 체크포인트입니다.",
    styles: ["sunset", "waves"],
    subjects: ["mountain range at sunset, golden hour", "calm ocean, sunset, waves", "layered hills, warm haze"],
    ageDays: 200,
    popularity: 8,
    versions: [
      { name: "v1.0", base: "SD 1.5" },
      { name: "v2.0", base: "SDXL", notes: "해상도와 디테일 개선", after: 90 },
    ],
  },
  {
    name: "오로라 판타지",
    type: "CHECKPOINT",
    creator: "sora_lab",
    tags: ["fantasy", "landscape", "concept art"],
    description: "밤하늘, 오로라, 설경에 특화된 판타지 컨셉아트 체크포인트.",
    styles: ["aurora"],
    subjects: ["aurora borealis over snowy forest", "northern lights, starry night, pine trees"],
    ageDays: 12,
    popularity: 6,
    trending: true,
    versions: [{ name: "v1.0", base: "Flux.1" }],
  },
  {
    name: "부드러운 피부 임베딩",
    type: "EMBEDDING",
    creator: "doyun_ai",
    tags: ["realistic", "portrait"],
    description: "네거티브 프롬프트에 넣어 피부 노이즈와 과한 질감을 줄이는 임베딩입니다.",
    styles: ["pastel"],
    subjects: ["portrait, soft skin, natural light"],
    ageDays: 160,
    popularity: 5,
    versions: [{ name: "v1.0", base: "SD 1.5", trigger: ["smoothskin_neg"] }],
  },
  {
    name: "시네마틱 컬러 VAE",
    type: "VAE",
    creator: "sora_lab",
    tags: ["realistic"],
    description: "채도를 살짝 올리고 대비를 부드럽게 만드는 SDXL VAE. 색이 탁하게 나올 때 바꿔 보세요.",
    styles: ["sunset", "waves"],
    subjects: ["cinematic color grading, landscape"],
    ageDays: 45,
    popularity: 4,
    versions: [{ name: "v1.0", base: "SDXL" }],
  },
  {
    name: "오픈포즈 XL 컨트롤넷",
    type: "CONTROLNET",
    creator: "sora_lab",
    tags: ["character"],
    description: "SDXL 용 OpenPose ControlNet. 포즈 스켈레톤 이미지를 넣으면 같은 자세로 생성합니다.\n\n권장 가중치 0.7, 시작 0, 끝 0.8",
    styles: ["spheres", "lowpoly"],
    subjects: ["pose reference, dynamic pose"],
    ageDays: 110,
    popularity: 7,
    versions: [{ name: "v1.0", base: "SDXL" }],
  },
  {
    name: "4x 애니 업스케일러",
    type: "UPSCALER",
    creator: "sora_lab",
    tags: ["anime"],
    description: "애니메이션 그림 전용 4배 업스케일러. 선이 깨지지 않고 깔끔하게 커집니다. Hires.fix 에서 사용하세요.",
    styles: ["pastel", "blossom"],
    subjects: ["upscaled anime illustration"],
    ageDays: 180,
    popularity: 6,
    versions: [{ name: "v1.0", base: "기타" }],
  },
  {
    name: "Flux 업스케일 워크플로",
    type: "WORKFLOW",
    creator: "sora_lab",
    tags: ["concept art"],
    description: "ComfyUI 용 2단계 업스케일 워크플로(json). 첫 생성 → 타일 업스케일 → 디테일 보정 순서입니다.",
    styles: ["aurora", "lowpoly"],
    subjects: ["detailed fantasy landscape, upscale"],
    ageDays: 20,
    popularity: 4,
    versions: [{ name: "v1.0", base: "Flux.1" }],
  },
  {
    name: "웹툰 채색 스타일",
    type: "LORA",
    creator: "minji_art",
    tags: ["webtoon", "anime", "illustration"],
    description: "한국 웹툰 느낌의 깔끔한 셀 채색과 선화를 만들어 주는 LoRA.",
    styles: ["pastel"],
    subjects: ["webtoon style, school uniform, classroom", "webtoon panel, dramatic lighting"],
    ageDays: 8,
    popularity: 6,
    trending: true,
    versions: [{ name: "v1.0", base: "Illustrious", trigger: ["webtoon style"] }],
  },
  {
    name: "벚꽃 배경 LyCORIS",
    type: "LYCORIS",
    creator: "mukmuk",
    tags: ["background", "landscape", "illustration"],
    description: "벚꽃 가지와 흩날리는 꽃잎 배경을 만들어 주는 LyCORIS(LoCon).",
    styles: ["blossom"],
    subjects: ["cherry blossom branches, falling petals, blue sky", "sakura, spring breeze"],
    ageDays: 26,
    popularity: 5,
    versions: [{ name: "v1.0", base: "Pony", trigger: ["sakura_bg"] }],
  },
  {
    name: "바다 물결 Qwen",
    type: "LORA",
    creator: "hanbit3d",
    tags: ["landscape", "illustration"],
    description: "겹겹이 쌓인 물결을 일러스트처럼 표현하는 Qwen-Image 용 LoRA.",
    styles: ["waves"],
    subjects: ["layered ocean waves, flat illustration", "moonlit sea, calm waves"],
    ageDays: 0.6,
    popularity: 3,
    trending: true,
    versions: [{ name: "v1.0", base: "Qwen-Image", trigger: ["wavestyle"] }],
  },
];

const QUALITY = ["masterpiece", "best quality", "highly detailed", "absurdres", "8k", "sharp focus", "beautiful lighting"];
const NEGATIVES = [
  "lowres, bad anatomy, bad hands, text, error, missing fingers, worst quality, low quality, jpeg artifacts, signature, watermark",
  "(worst quality:1.4), (low quality:1.4), blurry, deformed, extra limbs, watermark",
  "nsfw, lowres, blurry, oversaturated, ugly, duplicate",
  "easynegative, bad-hands-5, lowres, text",
];
const SAMPLER_CHOICES = [
  ["DPM++ 2M", "Karras"],
  ["Euler a", "Automatic"],
  ["DPM++ SDE", "Karras"],
  ["Euler", "Simple"],
  ["DPM++ 2M SDE", "Exponential"],
  ["UniPC", "Automatic"],
] as const;
const BASE_CHECKPOINT: Record<string, string> = {
  "SD 1.5": "realisticVisionV60B1",
  SDXL: "sd_xl_base_1.0",
  Pony: "ponyDiffusionV6XL",
  Illustrious: "illustriousXL_v01",
  NoobAI: "noobaiXL_v1.1",
  "SD 3.5": "sd3.5_large",
  "Flux.1": "flux1-dev",
  "Flux.2": "flux2-dev",
  "Qwen-Image": "qwen_image",
  기타: "sd_xl_base_1.0",
};
const SIZES = [
  [640, 960],
  [640, 960],
  [768, 768],
  [960, 640],
  [704, 1024],
] as const;

// 파일 이름·LoRA 이름에 쓸 영문 슬러그 (MODELS 순서와 같음)
const SLUGS = [
  "pastelDreamMix", "seoulNightRealistic", "hanbokStyle", "sumukSansu", "clayFigure3D", "pixelArt16bit",
  "neonCyberpunk", "lowpolyWorld", "goldenHourScenery", "auroraFantasy", "smoothSkinNeg", "cinematicColorVAE",
  "openposeXL", "4xAnimeUpscaler", "fluxUpscaleWorkflow", "webtoonColoring", "sakuraBackground", "oceanWavesQwen",
];

function slug(_name: string, i: number) {
  return SLUGS[i] ?? `model${i}`;
}

/** 텐서가 없는 유효한 safetensors 파일 (샘플 데이터 표시용) */
function sampleSafetensors(note: string): Buffer {
  const header = Buffer.from(JSON.stringify({ __metadata__: { note } }), "utf8");
  const len = Buffer.alloc(8);
  len.writeBigUInt64LE(BigInt(header.length));
  return Buffer.concat([len, header]);
}

function comfyGraph(p: GenerationParams): string {
  const [w, h] = (p.size ?? "768x768").split("x").map(Number);
  return JSON.stringify({
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: Number(p.seed),
        steps: p.steps,
        cfg: p.cfgScale,
        sampler_name: (p.sampler ?? "euler").toLowerCase().replace(/[+ ]+/g, "_").replace(/_a$/, "_ancestral"),
        scheduler: (p.scheduler ?? "normal").toLowerCase(),
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: `${p.model}.safetensors` } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: w, height: h, batch_size: 1 } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: p.prompt, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: p.negativePrompt, clip: ["4", 1] } },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: "ComfyUI", images: ["8", 0] } },
  });
}

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
