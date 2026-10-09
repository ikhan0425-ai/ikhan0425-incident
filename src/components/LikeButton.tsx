"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatCount } from "@/lib/format";
import { HeartIcon } from "./icons";

export function LikeButton({
  endpoint,
  liked: initialLiked,
  count: initialCount,
  onChange,
  variant = "default",
}: {
  endpoint: string;
  liked: boolean;
  count: number;
  onChange?: (liked: boolean, count: number) => void;
  variant?: "default" | "large";
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    // 낙관적 업데이트
    setLiked(!liked);
    setCount(count + (liked ? -1 : 1));
    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (res.status === 401) {
        setLiked(liked);
        setCount(count);
        router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { liked: boolean; likes: number };
      setLiked(data.liked);
      setCount(data.likes);
      onChange?.(data.liked, data.likes);
    } catch {
      setLiked(liked);
      setCount(count);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      aria-pressed={liked}
      aria-label={liked ? "좋아요 취소" : "좋아요"}
      className={`btn ${variant === "large" ? "px-4" : "px-3"} ${
        liked ? "border border-like/40 bg-like/15 text-like hover:bg-like/25" : "btn-secondary"
      }`}
    >
      <HeartIcon size={variant === "large" ? 17 : 15} filled={liked} />
      {formatCount(count)}
    </button>
  );
}
