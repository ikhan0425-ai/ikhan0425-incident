// AI 이미지 생성 정보(프롬프트, 샘플러, 시드 등) 파싱/포맷.
// A1111·Forge·SD.Next 의 "parameters" 텍스트, ComfyUI 프롬프트 그래프, NovelAI, InvokeAI 메타데이터를 지원한다.
// 브라우저와 서버 양쪽에서 동작해야 하므로 Node 전용 API 를 쓰지 않는다.

export type MetadataSource = "a1111" | "comfyui" | "novelai" | "invokeai" | "json" | "manual";

export interface GenerationParams {
  prompt: string | null;
  negativePrompt: string | null;
  sampler: string | null;
  scheduler: string | null;
  steps: number | null;
  cfgScale: number | null;
  seed: string | null;
  clipSkip: number | null;
  size: string | null;
  model: string | null;
  modelHash: string | null;
  /** 위에 없는 나머지 파라미터 (예: "Denoising strength", "Hires upscaler") */
  extra: Record<string, string>;
}

export interface ExtractedGeneration {
  source: MetadataSource;
  params: GenerationParams;
}

export function emptyParams(): GenerationParams {
  return {
    prompt: null,
    negativePrompt: null,
    sampler: null,
    scheduler: null,
    steps: null,
    cfgScale: null,
    seed: null,
    clipSkip: null,
    size: null,
    model: null,
    modelHash: null,
    extra: {},
  };
}

export function hasGenerationData(p: GenerationParams): boolean {
  return Boolean(
    p.prompt || p.negativePrompt || p.sampler || p.steps != null || p.cfgScale != null || p.seed,
  );
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  return null;
}

// ---------------------------------------------------------------------------
// A1111 / Forge 형식
// ---------------------------------------------------------------------------

// A1111 의 re_param_code 와 동일한 패턴
const PARAM_RE = /\s*(\w[\w \-/]+):\s*("(?:\\.|[^\\"])+"|[^,]*)(?:,|$)/g;

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t) as string;
    } catch {
      return t.slice(1, -1);
    }
  }
  return t;
}

function parseParamLine(line: string): [string, string][] {
  const out: [string, string][] = [];
  for (const m of line.matchAll(PARAM_RE)) {
    const key = m[1].trim();
    if (!key) continue;
    out.push([key, unquote(m[2] ?? "")]);
  }
  return out;
}

export function parseA1111(text: string): GenerationParams {
  const params = emptyParams();
  const lines = text.replace(/\r\n?/g, "\n").trim().split("\n");
  let paramLine = lines.pop() ?? "";
  if (parseParamLine(paramLine).length < 3) {
    lines.push(paramLine);
    paramLine = "";
  }

  const prompt: string[] = [];
  const negative: string[] = [];
  let inNegative = false;
  for (const raw of lines) {
    let line = raw;
    if (line.trim().startsWith("Negative prompt:")) {
      inNegative = true;
      line = line.trim().slice("Negative prompt:".length).trim();
    }
    (inNegative ? negative : prompt).push(line);
  }
  params.prompt = toStr(prompt.join("\n"));
  params.negativePrompt = toStr(negative.join("\n"));

  for (const [key, value] of parseParamLine(paramLine)) {
    switch (key.toLowerCase()) {
      case "steps":
        params.steps = toInt(value);
        break;
      case "sampler":
        params.sampler = toStr(value);
        break;
      case "schedule type":
      case "scheduler":
        params.scheduler = toStr(value);
        break;
      case "cfg scale":
        params.cfgScale = toFloat(value);
        break;
      case "seed":
        params.seed = toStr(value);
        break;
      case "size":
        params.size = toStr(value);
        break;
      case "model":
        params.model = toStr(value);
        break;
      case "model hash":
        params.modelHash = toStr(value);
        break;
      case "clip skip":
        params.clipSkip = toInt(value);
        break;
      default:
        if (value !== "") params.extra[key] = value;
    }
  }
  return params;
}

function quoteValue(v: string): string {
  return /[,:\n"]/.test(v) ? JSON.stringify(v) : v;
}

/** A1111 WebUI 의 "PNG Info → 텍스트로 보내기"에 붙여넣을 수 있는 형식으로 만든다. */
export function formatA1111(p: GenerationParams): string {
  const parts: string[] = [];
  if (p.prompt) parts.push(p.prompt);
  if (p.negativePrompt) parts.push(`Negative prompt: ${p.negativePrompt}`);
  const kv: [string, string | number | null][] = [
    ["Steps", p.steps],
    ["Sampler", p.sampler],
    ["Schedule type", p.scheduler],
    ["CFG scale", p.cfgScale],
    ["Seed", p.seed],
    ["Size", p.size],
    ["Model hash", p.modelHash],
    ["Model", p.model],
    ["Clip skip", p.clipSkip],
  ];
  const line = [
    ...kv.filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}: ${quoteValue(String(v))}`),
    ...Object.entries(p.extra).map(([k, v]) => `${k}: ${quoteValue(v)}`),
  ].join(", ");
  if (line) parts.push(line);
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// ComfyUI (API 형식 프롬프트 그래프)
// ---------------------------------------------------------------------------

type ComfyNode = { class_type?: string; inputs?: Record<string, unknown> };
type ComfyGraph = Record<string, ComfyNode>;

function isLink(v: unknown): v is [string | number, number] {
  return Array.isArray(v) && v.length === 2 && (typeof v[0] === "string" || typeof v[0] === "number");
}

export function parseComfyPrompt(json: string): GenerationParams | null {
  let graph: ComfyGraph;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    graph = parsed as ComfyGraph;
  } catch {
    return null;
  }
  const follow = (ref: unknown): ComfyNode | null => (isLink(ref) ? (graph[String(ref[0])] ?? null) : null);

  // 연결선을 따라가며 스칼라 값을 찾는다 (예: RandomNoise.noise_seed, BasicScheduler.steps)
  const resolveValue = (ref: unknown, keys: string[], depth = 0): unknown => {
    if (ref === undefined || ref === null) return null;
    if (!isLink(ref)) return ref;
    if (depth > 6) return null;
    const node = follow(ref);
    const inputs = node?.inputs ?? {};
    for (const k of keys) {
      if (k in inputs && !isLink(inputs[k])) return inputs[k];
    }
    for (const k of keys) {
      if (isLink(inputs[k])) return resolveValue(inputs[k], keys, depth + 1);
    }
    return null;
  };

  const TEXT_KEYS = ["text", "text_g", "prompt", "string", "value", "text_l", "positive"];
  const resolveText = (ref: unknown, depth = 0, seen = new Set<string>()): string | null => {
    if (typeof ref === "string") return ref;
    if (!isLink(ref) || depth > 8) return null;
    const id = String(ref[0]);
    if (seen.has(id)) return null;
    seen.add(id);
    const inputs = graph[id]?.inputs ?? {};
    for (const k of TEXT_KEYS) {
      if (typeof inputs[k] === "string") return inputs[k] as string;
    }
    for (const k of TEXT_KEYS) {
      if (isLink(inputs[k])) {
        const t = resolveText(inputs[k], depth + 1, seen);
        if (t) return t;
      }
    }
    // ConditioningCombine 등: clip/model 을 제외한 입력을 따라간다
    for (const [k, v] of Object.entries(inputs)) {
      if (k === "clip" || k === "model" || !isLink(v)) continue;
      const t = resolveText(v, depth + 1, seen);
      if (t) return t;
    }
    return null;
  };

  const nodes = Object.values(graph);
  const sampler =
    nodes.find((n) => /^KSampler(?!Select)/i.test(n.class_type ?? "")) ??
    nodes.find((n) => /SamplerCustom/i.test(n.class_type ?? "")) ??
    nodes.find((n) => /sampler/i.test(n.class_type ?? "") && n.inputs && ("seed" in n.inputs || "noise_seed" in n.inputs));
  if (!sampler?.inputs) return null;
  const inp = sampler.inputs;
  const guider = follow(inp.guider)?.inputs;

  const params = emptyParams();
  params.seed = toStr(resolveValue(inp.seed ?? inp.noise_seed ?? inp.noise, ["seed", "noise_seed"]));
  params.steps = toInt(resolveValue(inp.steps ?? inp.sigmas, ["steps"]));
  params.cfgScale = toFloat(resolveValue(inp.cfg ?? guider?.cfg, ["cfg"]));
  params.sampler = toStr(resolveValue(inp.sampler_name ?? inp.sampler, ["sampler_name"]));
  params.scheduler = toStr(resolveValue(inp.scheduler ?? inp.sigmas, ["scheduler"]));
  params.prompt = toStr(resolveText(inp.positive ?? guider?.positive ?? guider?.conditioning));
  params.negativePrompt = toStr(resolveText(inp.negative ?? guider?.negative));

  const loader = nodes.find((n) => /CheckpointLoader|UNETLoader|UnetLoader/i.test(n.class_type ?? ""));
  params.model = toStr(loader?.inputs?.ckpt_name ?? loader?.inputs?.unet_name);
  const guidance = nodes.find((n) => n.class_type === "FluxGuidance")?.inputs?.guidance;
  if (typeof guidance === "number") params.extra["Guidance"] = String(guidance);
  const latent = nodes.find((n) => /EmptyLatentImage|EmptySD3LatentImage/i.test(n.class_type ?? ""))?.inputs;
  if (latent && typeof latent.width === "number" && typeof latent.height === "number") {
    params.size = `${latent.width}x${latent.height}`;
  }
  const loras = nodes
    .filter((n) => /LoraLoader/i.test(n.class_type ?? "") && typeof n.inputs?.lora_name === "string")
    .map((n) => `${n.inputs!.lora_name}:${n.inputs!.strength_model ?? 1}`);
  if (loras.length) params.extra["LoRA"] = loras.join(", ");
  return params;
}

// ---------------------------------------------------------------------------
// NovelAI / InvokeAI / 기타 JSON
// ---------------------------------------------------------------------------

function parseJsonParams(json: string, source: "novelai" | "invokeai" | "json"): GenerationParams | null {
  let obj: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    obj = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const p = emptyParams();
  const pick = (...keys: string[]) => {
    for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
    return null;
  };
  p.prompt = toStr(pick("prompt", "positive_prompt", "Prompt"));
  p.negativePrompt = toStr(pick("negative_prompt", "uc", "negativePrompt", "Negative prompt"));
  p.steps = toInt(pick("steps", "num_inference_steps", "Steps"));
  p.cfgScale = toFloat(pick("cfg_scale", "scale", "guidance_scale", "cfg", "CFG scale"));
  p.seed = toStr(pick("seed", "Seed"));
  p.sampler = toStr(pick("sampler", "sampler_name", "Sampler"));
  p.scheduler = toStr(pick("scheduler", "noise_schedule"));
  const w = toInt(pick("width")), h = toInt(pick("height"));
  if (w && h) p.size = `${w}x${h}`;
  const model = pick("model", "base_model", "model_name");
  p.model =
    toStr(model) ??
    (model && typeof model === "object" ? toStr((model as Record<string, unknown>).name) : null) ??
    (source === "novelai" ? "NovelAI" : null);
  return hasGenerationData(p) ? p : null;
}

// ---------------------------------------------------------------------------
// 진입점: 이미지에서 꺼낸 텍스트 청크 → 생성 정보
// ---------------------------------------------------------------------------

/** chunks: PNG tEXt 키워드나 EXIF 에서 꺼낸 키 → 값 */
export function extractGeneration(chunks: Record<string, string>): ExtractedGeneration | null {
  const parameters = chunks["parameters"] ?? chunks["UserComment"] ?? chunks["comment"];
  if (parameters) {
    const trimmed = parameters.trim();
    if (trimmed.startsWith("{")) {
      const p = parseJsonParams(trimmed, "json");
      if (p) return { source: "json", params: p };
    } else {
      const p = parseA1111(trimmed);
      if (hasGenerationData(p)) return { source: "a1111", params: p };
    }
  }
  if (chunks["prompt"]) {
    const p = parseComfyPrompt(chunks["prompt"]);
    if (p && hasGenerationData(p)) return { source: "comfyui", params: p };
  }
  if (chunks["invokeai_metadata"]) {
    const p = parseJsonParams(chunks["invokeai_metadata"], "invokeai");
    if (p) return { source: "invokeai", params: p };
  }
  if (chunks["Comment"]) {
    const p = parseJsonParams(chunks["Comment"], "novelai");
    if (p) {
      if (!p.prompt && chunks["Description"]) p.prompt = chunks["Description"];
      return { source: "novelai", params: p };
    }
  }
  return null;
}

export const SOURCE_LABELS: Record<MetadataSource, string> = {
  a1111: "A1111 / Forge",
  comfyui: "ComfyUI",
  novelai: "NovelAI",
  invokeai: "InvokeAI",
  json: "JSON",
  manual: "직접 입력",
};
