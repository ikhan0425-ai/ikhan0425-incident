import "server-only";
import busboy from "busboy";
import crypto from "node:crypto";
import fs from "node:fs";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { UserError } from "./errors";
import { newTempPath } from "./storage";

export interface MemoryFile {
  field: string;
  filename: string;
  buffer: Buffer;
}

export interface DiskFile {
  field: string;
  filename: string;
  tmpPath: string;
  size: number;
  sha256: string;
}

export interface MultipartResult {
  fields: Record<string, string>;
  memoryFiles: MemoryFile[];
  diskFiles: DiskFile[];
}

export interface MultipartOptions {
  /** 메모리에 올릴 파일 필드 (이미지) */
  memory?: Record<string, { maxBytes: number; maxCount: number }>;
  /** 디스크로 바로 스트리밍할 파일 필드 (수 GB 짜리 모델 파일) */
  disk?: Record<string, { maxBytes: number }>;
}

export function cleanupDiskFiles(files: DiskFile[]): void {
  for (const f of files) fs.rmSync(f.tmpPath, { force: true });
}

/**
 * multipart/form-data 를 스트리밍으로 파싱한다.
 * request.formData() 는 전체 본문을 메모리에 올리므로 대용량 모델 파일에는 쓸 수 없다.
 */
export function parseMultipart(req: Request, opts: MultipartOptions): Promise<MultipartResult> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data") || !req.body) {
    return Promise.reject(new UserError("multipart/form-data 요청이어야 합니다."));
  }

  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    const memoryFiles: MemoryFile[] = [];
    const diskFiles: DiskFile[] = [];
    const tmpPaths: string[] = [];
    const writers: fs.WriteStream[] = [];
    const pending: Promise<void>[] = [];
    const counts: Record<string, number> = {};
    let settled = false;

    const source = Readable.fromWeb(req.body as unknown as NodeWebReadableStream<Uint8Array>);
    const bb = busboy({
      headers: { "content-type": contentType },
      limits: { fields: 100, fieldSize: 2 * 1024 * 1024, files: 50 },
      defParamCharset: "utf8",
    });

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      source.unpipe(bb);
      source.destroy();
      for (const w of writers) w.destroy();
      for (const p of tmpPaths) fs.rmSync(p, { force: true });
      reject(err);
    };

    bb.on("field", (name, value, info) => {
      if (info.valueTruncated) return fail(new UserError("입력값이 너무 깁니다."));
      fields[name] = value;
    });

    bb.on("file", (field, stream, info) => {
      const mem = opts.memory?.[field];
      const disk = opts.disk?.[field];
      counts[field] = (counts[field] ?? 0) + 1;
      if (settled || (!mem && !disk)) {
        stream.resume();
        return;
      }
      const filename = info.filename || "file";

      if (mem) {
        if (counts[field] > mem.maxCount) {
          stream.resume();
          return fail(new UserError(`파일은 최대 ${mem.maxCount}개까지 올릴 수 있습니다.`));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        pending.push(
          new Promise<void>((done) => {
            stream.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > mem.maxBytes) {
                fail(new UserError(`"${filename}" 파일이 너무 큽니다. (최대 ${Math.round(mem.maxBytes / 1024 / 1024)}MB)`));
              } else if (!settled) {
                chunks.push(chunk);
              }
            });
            stream.on("end", () => {
              if (!settled && size > 0) memoryFiles.push({ field, filename, buffer: Buffer.concat(chunks) });
              done();
            });
            stream.on("error", (e) => {
              fail(e);
              done();
            });
          }),
        );
        return;
      }

      if (disk) {
        if (counts[field] > 1) {
          stream.resume();
          return fail(new UserError("모델 파일은 하나만 올릴 수 있습니다."));
        }
        const tmpPath = newTempPath();
        tmpPaths.push(tmpPath);
        const ws = fs.createWriteStream(tmpPath);
        writers.push(ws);
        const hash = crypto.createHash("sha256");
        let size = 0;
        pending.push(
          new Promise<void>((done) => {
            ws.on("close", done);
            ws.on("error", (e) => fail(e));
            stream.on("data", (chunk: Buffer) => {
              if (settled) return;
              size += chunk.length;
              if (size > disk.maxBytes) {
                ws.destroy();
                stream.resume();
                return fail(new UserError(`모델 파일이 너무 큽니다. (최대 ${Math.round(disk.maxBytes / 1024 / 1024 / 1024)}GB)`));
              }
              hash.update(chunk);
              if (!ws.write(chunk)) {
                stream.pause();
                ws.once("drain", () => stream.resume());
              }
            });
            stream.on("end", () => {
              if (settled) return ws.destroy();
              ws.end(() => {
                if (size > 0) diskFiles.push({ field, filename, tmpPath, size, sha256: hash.digest("hex") });
              });
            });
            stream.on("error", (e) => {
              ws.destroy();
              fail(e);
            });
          }),
        );
      }
    });

    bb.on("close", () => {
      Promise.all(pending).then(() => {
        if (settled) return;
        settled = true;
        // 크기가 0 이라 목록에 들어가지 않은 임시 파일 정리
        const kept = new Set(diskFiles.map((f) => f.tmpPath));
        for (const p of tmpPaths) if (!kept.has(p)) fs.rmSync(p, { force: true });
        resolve({ fields, memoryFiles, diskFiles });
      });
    });
    bb.on("error", fail);
    source.on("error", fail);
    source.pipe(bb);
  });
}
