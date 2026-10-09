import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getCurrentUser, type SessionUser } from "./auth";
import { UserError } from "./errors";

export { UserError };

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

/**
 * 상태를 바꾸는 요청이 우리 사이트에서 온 것인지 확인한다 (CSRF 방어).
 * 쿠키가 SameSite=Lax 라 기본적으로 막히지만, Origin 헤더도 한 번 더 본다.
 */
function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new UserError("잘못된 요청입니다.", 403);
  }
  if (!host || originHost !== host) throw new UserError("잘못된 요청입니다.", 403);
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** 오류를 JSON 응답으로 바꿔 주는 래퍼 */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      // 빌드 중 프리렌더링 중단 신호 같은 Next.js 내부 오류는 그대로 다시 던진다
      unstable_rethrow(err);
      if (err instanceof UserError) return jsonError(err.message, err.status);
      console.error(err);
      return jsonError("서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", 500);
    }
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UserError("로그인이 필요합니다.", 401);
  return user;
}

export function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new UserError("찾을 수 없습니다.", 404);
  return id;
}
