"use client";

import Link from "next/link";
import { useState } from "react";

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSignup = mode === "signup";
  const target = safeNext(next);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, displayName, password }),
    }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : { error: "네트워크 오류" };
    if (res?.ok) {
      // 헤더 등 화면 전체의 로그인 상태를 새로 그리기 위해 전체 이동
      window.location.href = target;
      return;
    }
    setError(data.error ?? "다시 시도해 주세요.");
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <div>
        <label className="label" htmlFor="username">
          아이디
        </label>
        <input
          id="username"
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          placeholder={isSignup ? "영문, 숫자, _ 3~20자" : ""}
          required
        />
      </div>
      {isSignup && (
        <div>
          <label className="label" htmlFor="displayName">
            닉네임
          </label>
          <input
            id="displayName"
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="화면에 보일 이름 (2~20자)"
            required
          />
        </div>
      )}
      <div>
        <label className="label" htmlFor="password">
          비밀번호
        </label>
        <input
          id="password"
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isSignup ? "new-password" : "current-password"}
          placeholder={isSignup ? "8자 이상" : ""}
          required
        />
      </div>
      {error && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary w-full py-2.5">
        {busy ? "잠시만요…" : isSignup ? "가입하기" : "로그인"}
      </button>
      <p className="text-center text-sm text-muted">
        {isSignup ? "이미 계정이 있나요? " : "처음이신가요? "}
        <Link
          href={`/${isSignup ? "login" : "signup"}${target !== "/" ? `?next=${encodeURIComponent(target)}` : ""}`}
          className="font-semibold text-accent hover:underline"
        >
          {isSignup ? "로그인" : "회원가입"}
        </Link>
      </p>
    </form>
  );
}
