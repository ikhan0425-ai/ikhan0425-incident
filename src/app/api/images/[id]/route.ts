import { parseId, requireUser, route } from "@/lib/server/http";
import { deleteImage } from "@/lib/server/mutations";

export const DELETE = route<RouteContext<"/api/images/[id]">>(async (_req, ctx) => {
  const user = await requireUser();
  deleteImage(parseId((await ctx.params).id), user.id);
  return Response.json({ ok: true });
});
