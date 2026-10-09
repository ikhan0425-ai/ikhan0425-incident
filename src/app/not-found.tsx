import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="text-6xl font-extrabold text-surface-3">404</p>
      <h1 className="mt-4 text-xl font-bold">페이지를 찾을 수 없어요</h1>
      <p className="mt-2 text-sm text-muted">삭제되었거나 주소가 잘못되었을 수 있어요.</p>
      <Link href="/" className="btn btn-primary mt-6">
        모델 둘러보기
      </Link>
    </div>
  );
}
