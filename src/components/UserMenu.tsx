"use client";

import Link from "next/link";
import type { SessionUser } from "@/lib/server/auth";
import { Avatar } from "./Avatar";
import { Popover } from "./Popover";
import { ChevronDownIcon, ImageIcon, LayersIcon, LogOutIcon, PlusIcon } from "./icons";

const itemClass = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-surface-2";

export function UserMenu({ user }: { user: SessionUser | null }) {
  if (!user) {
    return (
      <div className="flex items-center gap-1.5">
        <Link href="/login" className="btn btn-ghost px-3">
          로그인
        </Link>
        <Link href="/signup" className="btn btn-primary px-3">
          회원가입
        </Link>
      </div>
    );
  }

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    // 화면에 남은 사용자 상태(숨겨진 페이지의 폼 등)를 모두 지우기 위해 전체 새로고침
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  };

  return (
    <div className="flex items-center gap-2">
      <Popover
        label="만들기"
        button={() => (
          <span className="btn btn-primary px-3">
            <PlusIcon size={15} />
            <span className="hidden sm:inline">만들기</span>
          </span>
        )}
      >
        <Link href="/models/new" className={itemClass}>
          <LayersIcon size={15} /> 모델 업로드
        </Link>
        <Link href="/images/new" className={itemClass}>
          <ImageIcon size={15} /> 이미지 올리기
        </Link>
      </Popover>
      <Popover
        label="내 메뉴"
        button={(open) => (
          <span className="flex items-center gap-1 rounded-full p-0.5 pr-1.5 hover:bg-surface-2">
            <Avatar username={user.username} displayName={user.displayName} size={30} />
            <ChevronDownIcon size={14} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        )}
      >
        <div className="border-b border-line px-3 pb-2 pt-1.5">
          <p className="text-sm font-bold">{user.displayName}</p>
          <p className="text-xs text-subtle">@{user.username}</p>
        </div>
        <div className="pt-1">
          <Link href={`/users/${user.username}`} className={itemClass}>
            내 프로필
          </Link>
          <button type="button" onClick={logout} className={itemClass}>
            <LogOutIcon size={15} /> 로그아웃
          </button>
        </div>
      </Popover>
    </div>
  );
}
