import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { getDb } from "./db";

export { hashPassword, verifyPassword } from "./password";

const COOKIE_NAME = "gt_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
}

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function sessionId(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isHttps(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return proto ? proto === "https" : new URL(req.url).protocol === "https:";
}

/** 로그인 처리: 세션 행을 만들고 쿠키에는 원본 토큰만 저장한다 (DB 에는 해시만). */
export async function createSession(req: Request, userId: number): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  db.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(
    sessionId(token),
    userId,
    now + SESSION_TTL_MS,
    now,
  );
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sessionId(token));
  store.delete(COOKIE_NAME);
}

/** 현재 로그인한 사용자. 요청마다 한 번만 DB 를 조회한다. 쿠키를 읽으므로 Suspense 안에서 호출해야 한다. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT u.id, u.username, u.display_name AS displayName, s.expires_at AS expiresAt
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    )
    .get(sessionId(token)) as (SessionUser & { expiresAt: number }) | undefined;
  if (!row || row.expiresAt < Date.now()) return null;
  return { id: row.id, username: row.username, displayName: row.displayName };
});
