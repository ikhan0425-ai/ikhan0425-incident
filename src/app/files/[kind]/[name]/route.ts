import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { MIME_BY_EXT, servedFilePath } from "@/lib/server/storage";

/** 업로드된 이미지(원본/썸네일) 제공. 파일명은 무작위라 변하지 않으므로 오래 캐시한다. */
export async function GET(req: Request, ctx: RouteContext<"/files/[kind]/[name]">) {
  const { kind, name } = await ctx.params;
  const filePath = servedFilePath(kind, name);
  if (!filePath) return new Response("Not found", { status: 404 });
  let size: number;
  try {
    size = (await fs.promises.stat(filePath)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const ext = path.extname(name).slice(1);
  const download = new URL(req.url).searchParams.has("download");
  return new Response(Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream, {
    headers: {
      "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "Content-Length": String(size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      ...(download ? { "Content-Disposition": `attachment; filename="${name}"` } : {}),
    },
  });
}
