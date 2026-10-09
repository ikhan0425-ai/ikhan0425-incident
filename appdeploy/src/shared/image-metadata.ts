// PNG / JPEG / WebP 파일 바이트에서 텍스트 메타데이터를 꺼낸다.
// - PNG: tEXt / zTXt / iTXt 청크 (A1111 "parameters", ComfyUI "prompt"/"workflow" 등)
// - JPEG / WebP: EXIF UserComment, ImageDescription 등, JPEG COM 세그먼트
// 브라우저(업로드 폼 자동 입력)와 서버 양쪽에서 쓴다.

import { extractGeneration, type ExtractedGeneration } from './generation';

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

const utf8 = new TextDecoder('utf-8');
const utf8Strict = new TextDecoder('utf-8', { fatal: true });
const latin1 = new TextDecoder('latin1');

/** tEXt 는 규격상 Latin-1 이지만 UTF-8 로 쓰는 도구가 많아서, 유효한 UTF-8 이면 UTF-8 로 읽는다. */
function decodeLooseText(bytes: Uint8Array): string {
  try {
    return utf8Strict.decode(bytes);
  } catch {
    return latin1.decode(bytes);
  }
}

async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function readPngChunks(bytes: Uint8Array): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const len = view.getUint32(pos);
    const type = ascii(bytes, pos + 4, pos + 8);
    const dataStart = pos + 8;
    const dataEnd = dataStart + len;
    if (dataEnd > bytes.length) break;
    const data = bytes.subarray(dataStart, dataEnd);

    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const nul = data.indexOf(0);
      if (nul > 0) {
        const keyword = latin1.decode(data.subarray(0, nul));
        let text: string | null = null;
        if (type === 'tEXt') {
          text = decodeLooseText(data.subarray(nul + 1));
        } else if (type === 'zTXt') {
          const inflated = await inflate(data.subarray(nul + 2));
          text = inflated ? decodeLooseText(inflated) : null;
        } else {
          const compressed = data[nul + 1] === 1;
          let p = nul + 3;
          const langEnd = data.indexOf(0, p);
          if (langEnd >= 0) {
            p = langEnd + 1;
            const transEnd = data.indexOf(0, p);
            if (transEnd >= 0) {
              const payload = data.subarray(transEnd + 1);
              const raw = compressed ? await inflate(payload) : payload;
              text = raw ? utf8.decode(raw) : null;
            }
          }
        }
        if (text !== null && !(keyword in out)) out[keyword] = text;
      }
    }
    if (type === 'IEND') break;
    pos = dataEnd + 4; // CRC
  }
  return out;
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  let s = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = littleEndian ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1];
    s += String.fromCharCode(code);
  }
  return s;
}

function decodeUserComment(raw: Uint8Array): string {
  const header = ascii(raw, 0, Math.min(8, raw.length));
  const body = raw.subarray(8);
  let text: string;
  if (header.startsWith('UNICODE')) {
    // 바이트 순서 표시가 없으므로 ASCII 문자 패턴으로 추정 (A1111 은 보통 빅엔디언)
    let zeroEven = 0;
    let zeroOdd = 0;
    for (let i = 0; i + 1 < Math.min(body.length, 200); i += 2) {
      if (body[i] === 0) zeroEven++;
      if (body[i + 1] === 0) zeroOdd++;
    }
    text = decodeUtf16(body, zeroOdd > zeroEven);
  } else if (header.startsWith('ASCII') || header === '\0\0\0\0\0\0\0\0') {
    text = decodeLooseText(body);
  } else {
    text = decodeLooseText(raw);
  }
  return text.replace(/\0+$/g, '').trim();
}

/** TIFF 구조(EXIF) 에서 필요한 태그만 읽는다. */
function readExif(tiff: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  if (tiff.length < 8) return out;
  const order = ascii(tiff, 0, 2);
  if (order !== 'II' && order !== 'MM') return out;
  const le = order === 'II';
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (o: number) => view.getUint16(o, le);
  const u32 = (o: number) => view.getUint32(o, le);
  const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

  const readIfd = (offset: number, visit: (tag: number, type: number, value: Uint8Array) => void) => {
    if (offset + 2 > tiff.length) return;
    const count = u16(offset);
    for (let i = 0; i < count; i++) {
      const e = offset + 2 + i * 12;
      if (e + 12 > tiff.length) return;
      const tag = u16(e);
      const type = u16(e + 2);
      const n = u32(e + 4);
      const size = (TYPE_SIZE[type] ?? 1) * n;
      const start = size <= 4 ? e + 8 : u32(e + 8);
      if (start + size > tiff.length) continue;
      visit(tag, type, tiff.subarray(start, start + size));
    }
  };

  let exifOffset = 0;
  try {
    readIfd(u32(4), (tag, type, value) => {
      if (tag === 0x8769 && value.length >= 4) {
        exifOffset = new DataView(value.buffer, value.byteOffset, 4).getUint32(0, le);
      } else if (type === 2 && (tag === 0x010e || tag === 0x010f || tag === 0x0110)) {
        // ImageDescription / Make / Model. ComfyUI 의 WebP 저장은 여기에 "prompt:{...}" 를 넣는다.
        const s = decodeLooseText(value).replace(/\0+$/g, '');
        const m = /^(prompt|workflow):/i.exec(s);
        if (m) out[m[1].toLowerCase()] = s.slice(m[0].length);
        else if (tag === 0x010e && s.trim()) out['ImageDescription'] = s.trim();
      } else if (tag === 0x9c9c && value.length) {
        out['XPComment'] = decodeUtf16(value, true).replace(/\0+$/g, '');
      }
    });
    if (exifOffset) {
      readIfd(exifOffset, (tag, _type, value) => {
        if (tag === 0x9286 && value.length > 8) {
          const text = decodeUserComment(value);
          if (text) out['UserComment'] = text;
        }
      });
    }
  } catch {
    // 손상된 EXIF 는 무시
  }
  return out;
}

function readJpeg(bytes: Uint8Array): Record<string, string> {
  let out: Record<string, string> = {};
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) break;
    const marker = bytes[pos + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      pos += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // 이미지 데이터 시작
    const len = (bytes[pos + 2] << 8) | bytes[pos + 3];
    const seg = bytes.subarray(pos + 4, pos + 2 + len);
    if (marker === 0xe1 && ascii(seg, 0, 6) === 'Exif\0\0') {
      out = { ...readExif(seg.subarray(6)), ...out };
    } else if (marker === 0xfe && seg.length) {
      out['comment'] = decodeLooseText(seg);
    }
    pos += 2 + len;
  }
  return out;
}

function readWebp(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const type = ascii(bytes, pos, pos + 4);
    const len = view.getUint32(pos + 4, true);
    const data = bytes.subarray(pos + 8, pos + 8 + len);
    if (type === 'EXIF') {
      return readExif(ascii(data, 0, 6) === 'Exif\0\0' ? data.subarray(6) : data);
    }
    pos += 8 + len + (len % 2);
  }
  return {};
}

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'unknown';

export function detectFormat(bytes: Uint8Array): ImageFormat {
  if (PNG_SIG.every((b, i) => bytes[i] === b)) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp';
  return 'unknown';
}

export async function readImageTextChunks(bytes: Uint8Array): Promise<Record<string, string>> {
  switch (detectFormat(bytes)) {
    case 'png':
      return readPngChunks(bytes);
    case 'jpeg':
      return readJpeg(bytes);
    case 'webp':
      return readWebp(bytes);
    default:
      return {};
  }
}

export async function extractGenerationFromImage(bytes: Uint8Array): Promise<ExtractedGeneration | null> {
  return extractGeneration(await readImageTextChunks(bytes));
}
