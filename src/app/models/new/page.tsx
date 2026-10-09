import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormPage, FormSkeleton } from "@/components/PageShell";
import { ModelUploadForm } from "@/components/upload/ModelUploadForm";
import { getCurrentUser } from "@/lib/server/auth";
import { MAX_MODEL_BYTES } from "@/lib/server/storage";

export const metadata: Metadata = { title: "모델 업로드" };

async function Gate() {
  if (!(await getCurrentUser())) redirect("/login?next=/models/new");
  return <ModelUploadForm mode="model" maxModelBytes={MAX_MODEL_BYTES} />;
}

export default function NewModelPage() {
  return (
    <FormPage title="모델 업로드" desc="직접 학습하거나 병합한 모델을 공유해 보세요. 샘플 이미지의 프롬프트는 파일에서 자동으로 읽어요.">
      <Suspense fallback={<FormSkeleton />}>
        <Gate />
      </Suspense>
    </FormPage>
  );
}
