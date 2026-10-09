// 샘플 데이터 정의 (모델·제작자·프롬프트 재료). scripts/seed.ts 와 scripts/appdeploy-seed.ts 가 함께 쓴다.

import { BASE_MODELS, type ModelType } from "@/lib/constants";
import type { GenerationParams } from "@/lib/generation";
import type { ArtStyle } from "./art";

export type Base = (typeof BASE_MODELS)[number];

export interface VersionDef {
  name: string;
  base: Base;
  trigger?: string[];
  notes?: string;
  /** 모델 생성 후 며칠 뒤에 올렸는지 */
  after?: number;
}

export interface ModelDef {
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

export const CREATORS = [
  { username: "minji_art", displayName: "민지아트", bio: "애니메이션·웹툰 스타일 LoRA 를 주로 만들어요. 피드백 환영!" },
  { username: "doyun_ai", displayName: "도윤", bio: "실사 체크포인트 병합 연구 중. 추천 설정은 모델 설명에 적어 둡니다." },
  { username: "sora_lab", displayName: "소라연구소", bio: "ControlNet · 워크플로 · 업스케일러" },
  { username: "hanbit3d", displayName: "한빛3D", bio: "3D, 클레이, 로우폴리 스타일을 좋아합니다." },
  { username: "pixel_jun", displayName: "픽셀준", bio: "16bit 도트 장인 (지망생)" },
  { username: "mukmuk", displayName: "먹먹", bio: "수묵화와 동양화 느낌을 AI 로 재현해 보고 있어요." },
];

export const MEMBER_NAMES = [
  "그림쟁이", "새벽감성", "고양이집사", "밤하늘", "초보작가", "코딩하는화가", "라떼한잔", "구름빵", "봄날",
  "도트러버", "실사덕후", "애니덕", "프롬프트장인", "시드수집가", "느긋한곰", "파란펭귄", "달토끼", "별헤는밤",
];

export const MODELS: ModelDef[] = [
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

export const QUALITY = ["masterpiece", "best quality", "highly detailed", "absurdres", "8k", "sharp focus", "beautiful lighting"];
export const NEGATIVES = [
  "lowres, bad anatomy, bad hands, text, error, missing fingers, worst quality, low quality, jpeg artifacts, signature, watermark",
  "(worst quality:1.4), (low quality:1.4), blurry, deformed, extra limbs, watermark",
  "nsfw, lowres, blurry, oversaturated, ugly, duplicate",
  "easynegative, bad-hands-5, lowres, text",
];
export const SAMPLER_CHOICES = [
  ["DPM++ 2M", "Karras"],
  ["Euler a", "Automatic"],
  ["DPM++ SDE", "Karras"],
  ["Euler", "Simple"],
  ["DPM++ 2M SDE", "Exponential"],
  ["UniPC", "Automatic"],
] as const;
export const BASE_CHECKPOINT: Record<string, string> = {
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
export const SIZES = [
  [640, 960],
  [640, 960],
  [768, 768],
  [960, 640],
  [704, 1024],
] as const;

// 파일 이름·LoRA 이름에 쓸 영문 슬러그 (MODELS 순서와 같음)
export const SLUGS = [
  "pastelDreamMix", "seoulNightRealistic", "hanbokStyle", "sumukSansu", "clayFigure3D", "pixelArt16bit",
  "neonCyberpunk", "lowpolyWorld", "goldenHourScenery", "auroraFantasy", "smoothSkinNeg", "cinematicColorVAE",
  "openposeXL", "4xAnimeUpscaler", "fluxUpscaleWorkflow", "webtoonColoring", "sakuraBackground", "oceanWavesQwen",
];

export function slug(_name: string, i: number) {
  return SLUGS[i] ?? `model${i}`;
}

/** 텐서가 없는 유효한 safetensors 파일 (샘플 데이터 표시용) */
export function sampleSafetensors(note: string): Buffer {
  const header = Buffer.from(JSON.stringify({ __metadata__: { note } }), "utf8");
  const len = Buffer.alloc(8);
  len.writeBigUInt64LE(BigInt(header.length));
  return Buffer.concat([len, header]);
}

export function comfyGraph(p: GenerationParams): string {
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

