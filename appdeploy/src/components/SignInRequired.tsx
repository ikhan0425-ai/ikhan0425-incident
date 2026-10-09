import { useAuth } from '../lib/auth';

/** 로그인해야 쓸 수 있는 페이지에서 로그아웃 상태일 때 보여 주는 안내 */
export function SignInRequired({
  title = '로그인이 필요해요',
  message = '로그인하면 모델과 이미지를 올리고 좋아요를 누를 수 있어요.',
}: {
  title?: string;
  message?: string;
}) {
  const { signIn } = useAuth();
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="text-lg font-bold">{title}</p>
      <p className="text-sm text-muted">{message}</p>
      <button type="button" className="btn btn-primary mt-2 px-5" onClick={() => signIn()}>
        로그인
      </button>
    </div>
  );
}
