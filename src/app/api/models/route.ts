import { LIMITS } from "@/lib/constants";
import { parseModelFilters, parsePage } from "@/lib/filters";
import { requireUser, route, UserError } from "@/lib/server/http";
import { cleanupDiskFiles, parseMultipart } from "@/lib/server/multipart";
import { createModel, discardPreparedImages, prepareImages } from "@/lib/server/mutations";
import { listModels } from "@/lib/server/queries";
import { MAX_MODEL_BYTES } from "@/lib/server/storage";
import { parseMetaList, parseModelFields, parseVersionFields } from "@/lib/server/validate";

/** 모델 목록 (무한 스크롤용) */
export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const userId = Number(sp.get("userId"));
  return Response.json(
    listModels(parseModelFilters(sp), parsePage(sp), {
      userId: Number.isSafeInteger(userId) && userId > 0 ? userId : undefined,
    }),
  );
});

/** 모델 업로드: 모델 정보 + 첫 버전 + 모델 파일(또는 외부 링크) + 샘플 이미지 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { fields, memoryFiles, diskFiles } = await parseMultipart(req, {
    memory: { images: { maxBytes: LIMITS.imageBytes, maxCount: LIMITS.imagesPerUpload } },
    disk: { modelFile: { maxBytes: MAX_MODEL_BYTES } },
  });
  try {
    const model = parseModelFields(fields);
    const version = parseVersionFields(fields, diskFiles[0] ?? null);
    if (!memoryFiles.length) throw new UserError("샘플 이미지를 1장 이상 올려 주세요.");
    const images = await prepareImages(memoryFiles, parseMetaList(fields.imagesMeta), model.nsfw);
    try {
      return Response.json({ id: createModel(user.id, model, version, images) });
    } catch (err) {
      discardPreparedImages(images);
      throw err;
    }
  } finally {
    cleanupDiskFiles(diskFiles);
  }
});
