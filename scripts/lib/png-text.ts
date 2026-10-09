import { crc32 } from "node:zlib";

/** PNG 의 IEND 앞에 tEXt/iTXt 청크를 끼워 넣는다 (시드 이미지에 생성 정보를 심을 때 사용). */
export function insertPngText(png: Buffer, entries: Record<string, string>): Buffer {
  const iend = png.lastIndexOf(Buffer.from("IEND", "latin1")) - 4;
  if (iend < 8) throw new Error("IEND 청크를 찾을 수 없습니다");
  const chunks = Object.entries(entries).map(([key, value]) => {
    const isLatin1 = /^[\x00-\xff]*$/.test(value);
    const type = isLatin1 ? "tEXt" : "iTXt";
    const data = isLatin1
      ? Buffer.concat([Buffer.from(key, "latin1"), Buffer.from([0]), Buffer.from(value, "latin1")])
      : Buffer.concat([Buffer.from(key, "latin1"), Buffer.from([0, 0, 0, 0, 0]), Buffer.from(value, "utf8")]);
    const typeBuf = Buffer.from(type, "latin1");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  });
  return Buffer.concat([png.subarray(0, iend), ...chunks, png.subarray(iend)]);
}
