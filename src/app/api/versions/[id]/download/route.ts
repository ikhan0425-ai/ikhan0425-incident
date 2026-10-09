import fs from "node:fs";
import { Readable } from "node:stream";
import { getCurrentUser } from "@/lib/server/auth";
import { jsonError, parseId, route } from "@/lib/server/http";
import { recordDownload } from "@/lib/server/mutations";
import { modelFilePath } from "@/lib/server/storage";

function contentDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** 모델 파일 다운로드 (다운로드 수 집계 후 파일 전송 또는 외부 링크로 이동) */
export const GET = route<RouteContext<"/api/versions/[id]/download">>(async (_req, ctx) => {
  const id = parseId((await ctx.params).id);
  const user = await getCurrentUser();
  const target = recordDownload(id, user?.id ?? null);
  if (!target) return jsonError("찾을 수 없습니다.", 404);
  if (target.externalUrl) return Response.redirect(target.externalUrl, 302);

  const filePath = target.filePath ? modelFilePath(target.filePath) : null;
  if (!filePath || !fs.existsSync(filePath)) return jsonError("파일을 찾을 수 없습니다.", 404);
  const { size } = fs.statSync(filePath);
  const body = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
  return new Response(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": contentDisposition(target.fileName ?? "model.safetensors"),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
