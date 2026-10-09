import { createSession, verifyPassword } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { route, UserError } from "@/lib/server/http";

// 아주 단순한 메모리 기반 로그인 시도 제한 (서버 1대 기준)
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function checkRate(key: string) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  a.count++;
  if (a.count > MAX_ATTEMPTS) throw new UserError("로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
}

export const POST = route(async (req) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  checkRate(`${ip}:${username.toLowerCase()}`);

  const user = getDb().prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(username) as
    | { id: number; username: string; password_hash: string }
    | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new UserError("아이디 또는 비밀번호가 올바르지 않습니다.", 401);
  }
  await createSession(req, user.id);
  return Response.json({ ok: true, username: user.username });
});
