import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { FormPage, FormSkeleton } from "@/components/PageShell";
import { ModelUploadForm } from "@/components/upload/ModelUploadForm";
import { getCurrentUser } from "@/lib/server/auth";
import { getModelDetail } from "@/lib/server/queries";
import { MAX_MODEL_BYTES } from "@/lib/server/storage";

export const metadata: Metadata = { title: "새 버전 추가" };

async function Gate({ params }: { params: PageProps<"/models/[id]/versions/new">["params"] }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/models/${encodeURIComponent(id)}/versions/new`);
  const modelId = Number(id);
  const model = Number.isSafeInteger(modelId) && modelId > 0 ? getModelDetail(modelId, null) : null;
  if (!model) notFound();
  if (model.creator.id !== user.id) {
    return <p className="card p-6 text-sm text-muted">모델 제작자만 새 버전을 추가할 수 있어요.</p>;
  }
  return (
    <ModelUploadForm
      mode="version"
      maxModelBytes={MAX_MODEL_BYTES}
      model={{ id: model.id, name: model.name, latestBase: model.versions[0]?.baseModel ?? null }}
    />
  );
}

export default function NewVersionPage({ params }: PageProps<"/models/[id]/versions/new">) {
  return (
    <FormPage title="새 버전 추가" desc="개선한 모델을 새 버전으로 올리면 기존 다운로드·좋아요는 그대로 유지돼요.">
      <Suspense fallback={<FormSkeleton />}>
        <Gate params={params} />
      </Suspense>
    </FormPage>
  );
}
