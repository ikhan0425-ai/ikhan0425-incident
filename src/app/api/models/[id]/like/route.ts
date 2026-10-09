import { parseId, requireUser, route } from "@/lib/server/http";
import { toggleModelLike } from "@/lib/server/mutations";

export const POST = route<RouteContext<"/api/models/[id]/like">>(async (_req, ctx) => {
  const user = await requireUser();
  return Response.json(toggleModelLike(user.id, parseId((await ctx.params).id)));
});
