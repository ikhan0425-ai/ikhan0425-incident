import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "회원가입" };

async function Form({ searchParams }: { searchParams: PageProps<"/signup">["searchParams"] }) {
  const { next } = await searchParams;
  return <AuthForm mode="signup" next={typeof next === "string" ? next : undefined} />;
}

export default function Page({ searchParams }: PageProps<"/signup">) {
  return (
    <div className="mx-auto max-w-sm px-4 py-14">
      <h1 className="text-center text-2xl font-extrabold">회원가입</h1>
      <p className="mt-1.5 text-center text-sm text-muted">그림터에 가입하고 직접 만든 모델과 그림을 공유해 보세요.</p>
      <div className="mt-6">
        <Suspense fallback={<div className="skeleton h-80 rounded-xl" />}>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
