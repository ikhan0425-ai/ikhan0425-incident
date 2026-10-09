// 업로드 전에 브라우저에서 이미지를 준비한다: 크기·대표 색 읽기, 목록용 썸네일 만들기, 원본을 3MB 이하로 맞추기.
// 서버는 base64 JSON 만 받으므로 무거운 처리는 모두 여기서 한다.

import { LIMITS } from '../../shared/constants';

export type ImageContentType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface PreparedImage {
  /** 원본 (또는 줄인 원본) base64, data: 접두사 없음 */
  data: string;
  contentType: ImageContentType;
  /** 썸네일 base64 (WebP, 지원하지 않는 브라우저는 JPEG) */
  thumb: string;
  /** 실제로 올라가는 원본의 크기 */
  width: number;
  height: number;
  color: string | null;
}

const PASS_THROUGH: string[] = ['image/png', 'image/jpeg', 'image/webp'];
const THUMB_WIDTH = 480;
// 아주 긴 이미지도 썸네일이 서버 한도(1MB)를 넘지 않게 화소 수를 제한한다
const THUMB_MAX_PIXELS = 480 * 1440;
// iOS Safari 캔버스 한도(약 1,670만 화소)를 넘지 않게
const MAX_CANVAS_PIXELS = 16_777_216;
const MIN_SIDE = 64;

interface Decoded {
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

function decodeError(file: File) {
  return new Error(`"${file.name}": 이미지를 읽지 못했어요. 다른 파일로 다시 시도해 주세요.`);
}

function loadImageElement(file: File): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () =>
      resolve({
        image: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        close: () => URL.revokeObjectURL(url),
      });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(decodeError(file));
    };
    img.src = url;
  });
}

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // 일부 브라우저는 옵션이나 형식을 지원하지 않는다 — <img> 로 다시 시도
    }
  }
  const d = await loadImageElement(file);
  if (!d.width || !d.height) {
    d.close();
    throw decodeError(file);
  }
  return d;
}

function canvas2d(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('브라우저에서 이미지를 처리하지 못했어요.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

/** 크게 줄일 때는 절반씩 나눠 줄여서 계단 현상을 줄인다 */
function drawScaled(src: Decoded, width: number, height: number, background?: string): HTMLCanvasElement {
  let source: CanvasImageSource = src.image;
  let sw = src.width;
  let sh = src.height;
  while (sw / 2 >= width * 1.5) {
    // 중간 캔버스가 한도를 넘으면 한 번에 더 줄인다
    const k = Math.min(0.5, Math.sqrt(MAX_CANVAS_PIXELS / (sw * sh)));
    const nw = Math.max(width, Math.round(sw * k));
    const nh = Math.max(height, Math.round(sh * k));
    const step = canvas2d(nw, nh);
    step.ctx.drawImage(source, 0, 0, sw, sh, 0, 0, nw, nh);
    source = step.canvas;
    sw = nw;
    sh = nh;
  }
  const out = canvas2d(width, height);
  if (background) {
    out.ctx.fillStyle = background;
    out.ctx.fillRect(0, 0, width, height);
  }
  out.ctx.drawImage(source, 0, 0, sw, sh, 0, 0, width, height);
  return out.canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/** Blob → base64 (data: 접두사 없이) */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? '');
      resolve(s.slice(s.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('파일을 읽지 못했어요.'));
    reader.readAsDataURL(blob);
  });
}

const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');

/** 32×32 로 줄여서 투명하지 않은 화소의 평균 색 */
function averageColor(source: HTMLCanvasElement): string | null {
  try {
    const { ctx } = canvas2d(32, 32);
    ctx.drawImage(source, 0, 0, 32, 32);
    const px = ctx.getImageData(0, 0, 32, 32).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 16) continue;
      r += px[i];
      g += px[i + 1];
      b += px[i + 2];
      n++;
    }
    return n ? `#${hex(r / n)}${hex(g / n)}${hex(b / n)}` : null;
  } catch {
    return null;
  }
}

async function makeThumb(src: Decoded): Promise<{ blob: Blob; canvas: HTMLCanvasElement }> {
  const scale = Math.min(1, THUMB_WIDTH / src.width, Math.sqrt(THUMB_MAX_PIXELS / (src.width * src.height)));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const canvas = drawScaled(src, w, h);
  const webp = await toBlob(canvas, 'image/webp', 0.78);
  // WebP 인코딩을 못 하는 브라우저(Safari 등)는 PNG 로 돌려준다 → JPEG 로
  if (webp && webp.type === 'image/webp') return { blob: webp, canvas };
  const jpeg = await toBlob(drawScaled(src, w, h, '#ffffff'), 'image/jpeg', 0.8);
  if (!jpeg) throw new Error('썸네일을 만들지 못했어요.');
  return { blob: jpeg, canvas };
}

/** 3MB 를 넘거나 지원하지 않는 형식이면 JPEG 로 다시 저장하고, 그래도 크면 조금씩 줄인다 */
async function fitOriginal(
  file: File,
  src: Decoded,
): Promise<{ blob: Blob; contentType: ImageContentType; width: number; height: number }> {
  if (file.size <= LIMITS.uploadBytes && PASS_THROUGH.includes(file.type)) {
    // 원본 그대로 (PNG 생성 정보 등 메타데이터 유지)
    return { blob: file, contentType: file.type as ImageContentType, width: src.width, height: src.height };
  }
  let scale = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (src.width * src.height)));
  for (let attempt = 0; attempt < 30; attempt++) {
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    if (attempt > 0 && Math.min(w, h) < MIN_SIDE) break;
    const blob = await toBlob(drawScaled(src, w, h, '#ffffff'), 'image/jpeg', 0.92);
    if (blob && blob.size <= LIMITS.uploadBytes) return { blob, contentType: 'image/jpeg', width: w, height: h };
    scale *= 0.85;
  }
  throw new Error(`"${file.name}": 이미지를 ${LIMITS.uploadBytes / 1024 / 1024}MB 이하로 줄이지 못했어요.`);
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const src = await decode(file);
  try {
    const thumb = await makeThumb(src);
    const color = averageColor(thumb.canvas);
    const original = await fitOriginal(file, src);
    const [data, thumbData] = await Promise.all([blobToBase64(original.blob), blobToBase64(thumb.blob)]);
    return {
      data,
      contentType: original.contentType,
      thumb: thumbData,
      width: original.width,
      height: original.height,
      color,
    };
  } finally {
    src.close();
  }
}
