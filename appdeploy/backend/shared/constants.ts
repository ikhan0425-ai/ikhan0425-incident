// 사이트 전역에서 쓰는 상수. src/shared 와 backend/shared 에 같은 내용으로 둔다.

export const SITE_NAME = "그림터";
export const SITE_DESCRIPTION =
  "AI 그림 모델(체크포인트, LoRA 등)과 생성 이미지를 공유하는 한국 커뮤니티";

export const MODEL_TYPES = [
  { value: "CHECKPOINT", label: "체크포인트", short: "Checkpoint", color: "#7c5cff" },
  { value: "LORA", label: "LoRA", short: "LoRA", color: "#22b8cf" },
  { value: "LYCORIS", label: "LyCORIS", short: "LyCORIS", color: "#20c997" },
  { value: "EMBEDDING", label: "임베딩", short: "Embedding", color: "#fab005" },
  { value: "VAE", label: "VAE", short: "VAE", color: "#fd7e14" },
  { value: "CONTROLNET", label: "ControlNet", short: "ControlNet", color: "#e64980" },
  { value: "UPSCALER", label: "업스케일러", short: "Upscaler", color: "#4dabf7" },
  { value: "WORKFLOW", label: "워크플로", short: "Workflow", color: "#94d82d" },
  { value: "OTHER", label: "기타", short: "Other", color: "#868e96" },
] as const;

export type ModelType = (typeof MODEL_TYPES)[number]["value"];

export const BASE_MODELS = [
  "SD 1.5",
  "SDXL",
  "Pony",
  "Illustrious",
  "NoobAI",
  "SD 3.5",
  "Flux.1",
  "Flux.2",
  "Qwen-Image",
  "기타",
] as const;

export type BaseModel = (typeof BASE_MODELS)[number];

// 기본 제공 태그. name 은 DB/URL 에 저장되는 값, label 은 화면 표시용.
export const PRESET_TAGS = [
  { name: "anime", label: "애니메이션" },
  { name: "realistic", label: "실사" },
  { name: "3d", label: "3D" },
  { name: "style", label: "스타일" },
  { name: "character", label: "캐릭터" },
  { name: "portrait", label: "인물" },
  { name: "landscape", label: "풍경" },
  { name: "fantasy", label: "판타지" },
  { name: "sci-fi", label: "SF" },
  { name: "illustration", label: "일러스트" },
  { name: "concept art", label: "컨셉아트" },
  { name: "pixel art", label: "픽셀아트" },
  { name: "webtoon", label: "웹툰" },
  { name: "traditional", label: "동양화" },
  { name: "architecture", label: "건축" },
  { name: "animal", label: "동물" },
  { name: "clothing", label: "의상" },
  { name: "background", label: "배경" },
] as const;

const TAG_LABELS = new Map<string, string>(PRESET_TAGS.map((t) => [t.name, t.label]));
const TAG_ALIASES = new Map<string, string>(
  PRESET_TAGS.flatMap((t) => [
    [t.label.toLowerCase(), t.name],
    [t.name, t.name],
  ]),
);

export function tagLabel(name: string): string {
  return TAG_LABELS.get(name) ?? name;
}

/** 사용자가 입력한 태그를 저장용 이름으로 정규화. 한글 라벨("애니메이션")은 프리셋 이름("anime")으로 바꾼다. */
export function normalizeTag(input: string): string {
  const cleaned = input.trim().replace(/^#/, "").replace(/\s+/g, " ").toLowerCase();
  return TAG_ALIASES.get(cleaned) ?? cleaned;
}

export const MODEL_SORTS = [
  { value: "newest", label: "최신순" },
  { value: "downloads", label: "다운로드순" },
  { value: "likes", label: "좋아요순" },
] as const;

export const IMAGE_SORTS = [
  { value: "newest", label: "최신순" },
  { value: "likes", label: "좋아요순" },
] as const;

export const PERIODS = [
  { value: "all", label: "전체", days: 0 },
  { value: "year", label: "연간", days: 365 },
  { value: "month", label: "월간", days: 30 },
  { value: "week", label: "주간", days: 7 },
  { value: "day", label: "일간", days: 1 },
] as const;

export type ModelSort = (typeof MODEL_SORTS)[number]["value"];
export type ImageSort = (typeof IMAGE_SORTS)[number]["value"];
export type Period = (typeof PERIODS)[number]["value"];

export const SAMPLERS = [
  "Euler a",
  "Euler",
  "DPM++ 2M",
  "DPM++ 2M SDE",
  "DPM++ SDE",
  "DPM++ 2S a",
  "DPM++ 3M SDE",
  "DPM2 a",
  "Heun",
  "LMS",
  "DDIM",
  "PLMS",
  "UniPC",
  "LCM",
  "Restart",
];

export const SCHEDULERS = ["Automatic", "Karras", "Exponential", "SGM Uniform", "Simple", "Normal", "Beta"];

export const PAGE_SIZE = 24;

export const LIMITS = {
  /** 사용자가 고를 수 있는 원본 이미지 크기 (브라우저에서 줄여서 올린다) */
  imageBytes: 30 * 1024 * 1024,
  /** 서버로 보내는 파일 1개의 최대 크기 (요청 크기 제한 때문에) */
  uploadBytes: 3 * 1024 * 1024,
  imagesPerUpload: 20,
  tagsPerModel: 10,
  nameLength: 100,
  descriptionLength: 10000,
  promptLength: 10000,
} as const;

export const MODEL_FILE_EXTENSIONS = [".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".gguf", ".zip", ".json"];
/** pickle 기반이라 임의 코드 실행 위험이 있는 확장자 */
export const PICKLE_EXTENSIONS = [".ckpt", ".pt", ".pth", ".bin"];

export function modelTypeInfo(value: string) {
  return MODEL_TYPES.find((t) => t.value === value) ?? MODEL_TYPES[MODEL_TYPES.length - 1];
}
