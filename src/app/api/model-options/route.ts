import { route } from "@/lib/server/http";
import { getModelOption, searchModelOptions } from "@/lib/server/queries";

/** 이미지 업로드 폼의 "사용한 모델" 검색 */
export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const versionId = Number(sp.get("versionId"));
  if (Number.isSafeInteger(versionId) && versionId > 0) {
    const option = getModelOption(versionId);
    return Response.json({ items: option ? [option] : [] });
  }
  return Response.json({ items: searchModelOptions((sp.get("q") ?? "").trim().slice(0, 100)) });
});
