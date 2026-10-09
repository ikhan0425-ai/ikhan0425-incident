import { parseId, requireUser, route } from "@/lib/server/http";
import { deleteModel } from "@/lib/server/mutations";

export const DELETE = route<RouteContext<"/api/models/[id]">>(async (_req, ctx) => {
  const user = await requireUser();
  deleteModel(parseId((await ctx.params).id), user.id);
  return Response.json({ ok: true });
});
