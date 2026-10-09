import { destroySession } from "@/lib/server/auth";
import { route } from "@/lib/server/http";

export const POST = route(async () => {
  await destroySession();
  return Response.json({ ok: true });
});
