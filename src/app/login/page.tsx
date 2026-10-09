import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "로그인" };

async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { next } = await searchParams;
  return <AuthForm mode="login" next={typeof next === "string" ? next : undefined} />;
}

export default function Page({ searchParams }: PageProps<"/login">) {
  return (
    <div className="mx-auto max-w-sm px-4 py-14">
      <h1 className="text-center text-2xl font-extrabold">로그인</h1>
      <p className="mt-1.5 text-center text-sm text-muted">모델과 이미지를 올리고 좋아요를 누르려면 로그인하세요.</p>
      <div className="mt-6">
        <Suspense fallback={<div className="skeleton h-80 rounded-xl" />}>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
