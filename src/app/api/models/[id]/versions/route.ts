import { LIMITS } from "@/lib/constants";
import { parseId, requireUser, route, UserError } from "@/lib/server/http";
import { cleanupDiskFiles, parseMultipart } from "@/lib/server/multipart";
import { createVersion, discardPreparedImages, prepareImages } from "@/lib/server/mutations";
import { getModelDetail } from "@/lib/server/queries";
import { MAX_MODEL_BYTES } from "@/lib/server/storage";
import { parseMetaList, parseVersionFields } from "@/lib/server/validate";

/** 기존 모델에 새 버전 추가 (제작자만) */
export const POST = route<RouteContext<"/api/models/[id]/versions">>(async (req, ctx) => {
  const user = await requireUser();
  const model = getModelDetail(parseId((await ctx.params).id), null);
  if (!model) throw new UserError("찾을 수 없습니다.", 404);
  if (model.creator.id !== user.id) throw new UserError("모델 제작자만 버전을 추가할 수 있습니다.", 403);

  const { fields, memoryFiles, diskFiles } = await parseMultipart(req, {
    memory: { images: { maxBytes: LIMITS.imageBytes, maxCount: LIMITS.imagesPerUpload } },
    disk: { modelFile: { maxBytes: MAX_MODEL_BYTES } },
  });
  try {
    const version = parseVersionFields(fields, diskFiles[0] ?? null);
    if (model.versions.some((v) => v.name === version.name)) throw new UserError("같은 이름의 버전이 이미 있습니다.");
    if (!memoryFiles.length) throw new UserError("샘플 이미지를 1장 이상 올려 주세요.");
    const images = await prepareImages(memoryFiles, parseMetaList(fields.imagesMeta), model.nsfw);
    try {
      return Response.json({ id: model.id, versionId: createVersion(model.id, user.id, version, images) });
    } catch (err) {
      discardPreparedImages(images);
      throw err;
    }
  } finally {
    cleanupDiskFiles(diskFiles);
  }
});
