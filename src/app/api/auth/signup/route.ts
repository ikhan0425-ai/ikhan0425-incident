import { createSession, hashPassword, USERNAME_RE } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { route, UserError } from "@/lib/server/http";

export const POST = route(async (req) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!USERNAME_RE.test(username)) throw new UserError("아이디는 영문, 숫자, _ 로 3~20자여야 합니다.");
  if (displayName.length < 2 || displayName.length > 20) throw new UserError("닉네임은 2~20자로 입력해 주세요.");
  if (password.length < 8 || password.length > 200) throw new UserError("비밀번호는 8자 이상이어야 합니다.");

  const db = getDb();
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) {
    throw new UserError("이미 사용 중인 아이디입니다.", 409);
  }
  const r = db
    .prepare("INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .run(username, displayName, hashPassword(password), Date.now());
  await createSession(req, Number(r.lastInsertRowid));
  return Response.json({ ok: true, username });
});
