"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TrashIcon } from "./icons";

export function DeleteButton({
  endpoint,
  confirmText,
  redirectTo,
  label = "삭제",
}: {
  endpoint: string;
  confirmText: string;
  redirectTo: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="btn btn-danger"
      onClick={async () => {
        if (!window.confirm(confirmText)) return;
        setBusy(true);
        const res = await fetch(endpoint, { method: "DELETE" });
        if (res.ok) {
          router.push(redirectTo);
          router.refresh();
        } else {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          window.alert(data.error ?? "삭제하지 못했어요.");
          setBusy(false);
        }
      }}
    >
      <TrashIcon size={15} /> {busy ? "삭제 중…" : label}
    </button>
  );
}
