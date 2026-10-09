import { parseId, requireUser, route } from "@/lib/server/http";
import { toggleImageLike } from "@/lib/server/mutations";

export const POST = route<RouteContext<"/api/images/[id]/like">>(async (_req, ctx) => {
  const user = await requireUser();
  return Response.json(toggleImageLike(user.id, parseId((await ctx.params).id)));
});
