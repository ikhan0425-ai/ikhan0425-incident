import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormPage, FormSkeleton } from "@/components/PageShell";
import { ImageUploadForm } from "@/components/upload/ImageUploadForm";
import { getCurrentUser } from "@/lib/server/auth";
import { getModelOption } from "@/lib/server/queries";

export const metadata: Metadata = { title: "이미지 올리기" };

async function Gate({ searchParams }: { searchParams: PageProps<"/images/new">["searchParams"] }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.versionId) ? sp.versionId[0] : sp.versionId;
  if (!(await getCurrentUser())) {
    redirect(`/login?next=${encodeURIComponent(`/images/new${raw ? `?versionId=${raw}` : ""}`)}`);
  }
  const versionId = Number(raw);
  const valid = Number.isSafeInteger(versionId) && versionId > 0;
  const option = valid ? getModelOption(versionId) : null;
  return <ImageUploadForm initialModel={option} initialVersionId={option ? versionId : null} />;
}

export default function NewImagePage({ searchParams }: PageProps<"/images/new">) {
  return (
    <FormPage title="이미지 올리기" desc="AI 로 만든 그림을 공유하세요. 원본 PNG 를 올리면 프롬프트·시드·샘플러가 자동으로 채워져요.">
      <Suspense fallback={<FormSkeleton />}>
        <Gate searchParams={searchParams} />
      </Suspense>
    </FormPage>
  );
}
