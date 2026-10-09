"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <h1 className="text-xl font-bold">문제가 생겼어요</h1>
      <p className="mt-2 text-sm text-muted">잠시 후 다시 시도해 주세요.</p>
      <button type="button" onClick={() => retry()} className="btn btn-primary mt-6">
        다시 시도
      </button>
    </div>
  );
}
