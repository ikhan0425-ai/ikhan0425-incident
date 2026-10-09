import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { deflateSync } from "node:zlib";
import { formatA1111, parseA1111, parseComfyPrompt, extractGeneration } from "@/lib/generation";
import { extractGenerationFromImage, readImageTextChunks } from "@/lib/image-metadata";
import { insertPngText } from "../scripts/lib/png-text";

const A1111 = `masterpiece, best quality, 1girl, hanbok, cherry blossoms,
soft lighting
Negative prompt: lowres, bad anatomy, (worst quality:1.4)
Steps: 28, Sampler: DPM++ 2M, Schedule type: Karras, CFG scale: 6.5, Seed: 1234567890, Size: 832x1216, Model hash: 6ce0161689, Model: animagine-xl, Clip skip: 2, Denoising strength: 0.4, Lora hashes: "hanbok: abc123, light: def456", Version: v1.10.1`;

describe("parseA1111", () => {
  it("프롬프트와 파라미터를 분리한다", () => {
    const p = parseA1111(A1111);
    expect(p.prompt).toBe("masterpiece, best quality, 1girl, hanbok, cherry blossoms,\nsoft lighting");
    expect(p.negativePrompt).toBe("lowres, bad anatomy, (worst quality:1.4)");
    expect(p.steps).toBe(28);
    expect(p.sampler).toBe("DPM++ 2M");
    expect(p.scheduler).toBe("Karras");
    expect(p.cfgScale).toBe(6.5);
    expect(p.seed).toBe("1234567890");
    expect(p.size).toBe("832x1216");
    expect(p.modelHash).toBe("6ce0161689");
    expect(p.model).toBe("animagine-xl");
    expect(p.clipSkip).toBe(2);
    expect(p.extra["Denoising strength"]).toBe("0.4");
    expect(p.extra["Lora hashes"]).toBe("hanbok: abc123, light: def456");
  });

  it("파라미터 줄이 없으면 전체를 프롬프트로 본다", () => {
    const p = parseA1111("a cat, sitting");
    expect(p.prompt).toBe("a cat, sitting");
    expect(p.steps).toBeNull();
  });

  it("네거티브 없이 파라미터만 있어도 동작한다", () => {
    const p = parseA1111("a cat\nSteps: 20, Sampler: Euler a, CFG scale: 7, Seed: 1");
    expect(p.prompt).toBe("a cat");
    expect(p.negativePrompt).toBeNull();
    expect(p.sampler).toBe("Euler a");
  });

  it("formatA1111 결과를 다시 파싱하면 같은 값이 나온다", () => {
    const p = parseA1111(A1111);
    expect(parseA1111(formatA1111(p))).toEqual(p);
  });
});

const COMFY = JSON.stringify({
  "3": {
    class_type: "KSampler",
    inputs: { seed: 42, steps: 25, cfg: 4.5, sampler_name: "euler", scheduler: "normal", model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0] },
  },
  "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sdxl_base.safetensors" } },
  "5": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 } },
  "6": { class_type: "CLIPTextEncode", inputs: { text: ["10", 0], clip: ["4", 1] } },
  "7": { class_type: "CLIPTextEncode", inputs: { text: "blurry, watermark", clip: ["4", 1] } },
  "10": { class_type: "PrimitiveString", inputs: { value: "a lighthouse at dusk" } },
});

const COMFY_FLUX = JSON.stringify({
  "13": { class_type: "SamplerCustomAdvanced", inputs: { noise: ["25", 0], guider: ["22", 0], sampler: ["16", 0], sigmas: ["17", 0], latent_image: ["27", 0] } },
  "25": { class_type: "RandomNoise", inputs: { noise_seed: 987654321 } },
  "22": { class_type: "BasicGuider", inputs: { model: ["12", 0], conditioning: ["26", 0] } },
  "26": { class_type: "FluxGuidance", inputs: { guidance: 3.5, conditioning: ["6", 0] } },
  "6": { class_type: "CLIPTextEncode", inputs: { text: "neon street in seoul", clip: ["11", 0] } },
  "16": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
  "17": { class_type: "BasicScheduler", inputs: { scheduler: "simple", steps: 20, denoise: 1, model: ["12", 0] } },
  "12": { class_type: "UNETLoader", inputs: { unet_name: "flux1-dev.safetensors" } },
});

describe("parseComfyPrompt", () => {
  it("KSampler 그래프를 따라가 값을 찾는다", () => {
    const p = parseComfyPrompt(COMFY)!;
    expect(p.prompt).toBe("a lighthouse at dusk");
    expect(p.negativePrompt).toBe("blurry, watermark");
    expect(p.seed).toBe("42");
    expect(p.steps).toBe(25);
    expect(p.cfgScale).toBe(4.5);
    expect(p.sampler).toBe("euler");
    expect(p.scheduler).toBe("normal");
    expect(p.model).toBe("sdxl_base.safetensors");
    expect(p.size).toBe("1024x1024");
  });

  it("Flux 의 SamplerCustomAdvanced 그래프도 읽는다", () => {
    const p = parseComfyPrompt(COMFY_FLUX)!;
    expect(p.prompt).toBe("neon street in seoul");
    expect(p.seed).toBe("987654321");
    expect(p.steps).toBe(20);
    expect(p.sampler).toBe("euler");
    expect(p.scheduler).toBe("simple");
    expect(p.model).toBe("flux1-dev.safetensors");
    expect(p.extra["Guidance"]).toBe("3.5");
  });
});

describe("extractGeneration", () => {
  it("NovelAI Comment JSON 을 읽는다", () => {
    const r = extractGeneration({
      Description: "1girl, silver hair",
      Software: "NovelAI",
      Comment: JSON.stringify({ steps: 28, scale: 5, seed: 99, sampler: "k_euler_ancestral", uc: "lowres", width: 832, height: 1216 }),
    })!;
    expect(r.source).toBe("novelai");
    expect(r.params.prompt).toBe("1girl, silver hair");
    expect(r.params.negativePrompt).toBe("lowres");
    expect(r.params.cfgScale).toBe(5);
    expect(r.params.size).toBe("832x1216");
  });
});

async function basePng() {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: "#336699" } }).png().toBuffer();
}

describe("이미지 파일에서 메타데이터 읽기", () => {
  it("PNG tEXt 의 parameters", async () => {
    const png = insertPngText(await basePng(), { parameters: A1111 });
    const r = await extractGenerationFromImage(new Uint8Array(png));
    expect(r?.source).toBe("a1111");
    expect(r?.params.seed).toBe("1234567890");
  });

  it("PNG iTXt (한글 프롬프트)와 ComfyUI prompt", async () => {
    const png = insertPngText(await basePng(), {
      parameters: "한복을 입은 소녀\nSteps: 20, Sampler: Euler a, CFG scale: 7, Seed: 5",
      prompt: COMFY,
    });
    const chunks = await readImageTextChunks(new Uint8Array(png));
    expect(chunks.parameters.startsWith("한복을 입은 소녀")).toBe(true);
    expect(chunks.prompt).toBe(COMFY);
  });

  it("PNG zTXt (압축)", async () => {
    const png = await basePng();
    const text = Buffer.from("a\nSteps: 9, Sampler: Euler, CFG scale: 3, Seed: 77", "latin1");
    const data = Buffer.concat([Buffer.from("parameters\0\0", "latin1"), deflateSync(text)]);
    const { crc32 } = await import("node:zlib");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from("zTXt"), data])) >>> 0);
    const iend = png.lastIndexOf(Buffer.from("IEND")) - 4;
    const out = Buffer.concat([png.subarray(0, iend), len, Buffer.from("zTXt"), data, crc, png.subarray(iend)]);
    const r = await extractGenerationFromImage(new Uint8Array(out));
    expect(r?.params.seed).toBe("77");
    expect(r?.params.steps).toBe(9);
  });

  it("JPEG EXIF UserComment (UTF-16)", async () => {
    const text = "a red fox\nNegative prompt: blurry\nSteps: 30, Sampler: Euler a, CFG scale: 7, Seed: 31337";
    const body = Buffer.alloc(text.length * 2);
    for (let i = 0; i < text.length; i++) body.writeUInt16BE(text.charCodeAt(i), i * 2);
    const userComment = Buffer.concat([Buffer.from("UNICODE\0", "latin1"), body]);
    // 최소 TIFF: IFD0 (ExifIFD 포인터 1개) → Exif IFD (UserComment 1개)
    const tiff = Buffer.alloc(8 + 2 + 12 + 4 + 2 + 12 + 4 + userComment.length);
    tiff.write("MM", 0, "latin1");
    tiff.writeUInt16BE(42, 2);
    tiff.writeUInt32BE(8, 4);
    tiff.writeUInt16BE(1, 8);
    tiff.writeUInt16BE(0x8769, 10);
    tiff.writeUInt16BE(4, 12);
    tiff.writeUInt32BE(1, 14);
    tiff.writeUInt32BE(26, 18);
    tiff.writeUInt32BE(0, 22);
    tiff.writeUInt16BE(1, 26);
    tiff.writeUInt16BE(0x9286, 28);
    tiff.writeUInt16BE(7, 30);
    tiff.writeUInt32BE(userComment.length, 32);
    tiff.writeUInt32BE(44, 36);
    tiff.writeUInt32BE(0, 40);
    userComment.copy(tiff, 44);
    const exif = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#aa3300" } }).jpeg().toBuffer();
    const app1 = Buffer.alloc(4);
    app1.writeUInt16BE(0xffe1, 0);
    app1.writeUInt16BE(exif.length + 2, 2);
    const withExif = Buffer.concat([jpeg.subarray(0, 2), app1, exif, jpeg.subarray(2)]);
    const r = await extractGenerationFromImage(new Uint8Array(withExif));
    expect(r?.params.prompt).toBe("a red fox");
    expect(r?.params.negativePrompt).toBe("blurry");
    expect(r?.params.seed).toBe("31337");
  });

  it("메타데이터가 없으면 null", async () => {
    expect(await extractGenerationFromImage(new Uint8Array(await basePng()))).toBeNull();
  });
});
