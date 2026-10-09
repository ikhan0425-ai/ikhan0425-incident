import { LIMITS } from "@/lib/constants";
import { parseImageFilters, parsePage } from "@/lib/filters";
import { getCurrentUser } from "@/lib/server/auth";
import { requireUser, route, UserError } from "@/lib/server/http";
import { parseMultipart } from "@/lib/server/multipart";
import { discardPreparedImages, postImages, prepareImages } from "@/lib/server/mutations";
import { listImages } from "@/lib/server/queries";
import { parseMetaList } from "@/lib/server/validate";

function optionalId(v: string | null): number | undefined {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** 이미지 목록 (갤러리 무한 스크롤용) */
export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const viewer = await getCurrentUser();
  return Response.json(
    listImages(
      {
        ...parseImageFilters(sp),
        modelId: optionalId(sp.get("modelId")),
        versionId: optionalId(sp.get("versionId")),
        userId: optionalId(sp.get("userId")),
        excludeUserId: optionalId(sp.get("excludeUserId")),
      },
      parsePage(sp),
      viewer?.id ?? null,
    ),
  );
});

/** 이미지 게시 (모델과 연결은 선택) */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { fields, memoryFiles } = await parseMultipart(req, {
    memory: { images: { maxBytes: LIMITS.imageBytes, maxCount: LIMITS.imagesPerUpload } },
  });
  if (!memoryFiles.length) throw new UserError("이미지를 1장 이상 선택해 주세요.");
  const versionId = optionalId(fields.versionId ?? null) ?? null;
  const images = await prepareImages(memoryFiles, parseMetaList(fields.imagesMeta), fields.nsfw === "1");
  try {
    return Response.json({ ids: postImages(user.id, versionId, images) });
  } catch (err) {
    discardPreparedImages(images);
    throw err;
  }
});
