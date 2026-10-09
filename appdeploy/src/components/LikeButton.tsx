import { useEffect, useRef, useState } from 'react';
import { ApiError, apiPost, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatCount } from '../shared/format';
import { HeartIcon } from './icons';

export function LikeButton({
  endpoint,
  liked: initialLiked,
  count: initialCount,
  onChange,
  variant = 'default',
}: {
  endpoint: string;
  liked: boolean;
  count: number;
  onChange?: (liked: boolean, count: number) => void;
  variant?: 'default' | 'large';
}) {
  const { me, requireSignIn, signIn } = useAuth();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  // 부모가 새 값(예: 상세 정보를 다 불러온 뒤)을 주면 그 값을 따른다
  const [prev, setPrev] = useState({ liked: initialLiked, count: initialCount });
  if (prev.liked !== initialLiked || prev.count !== initialCount) {
    setPrev({ liked: initialLiked, count: initialCount });
    setLiked(initialLiked);
    setCount(initialCount);
  }

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    // 누르기 전 화면 상태. 로그인 전에 불러온 값이면 내 실제 좋아요 여부와 다를 수 있다
    const before = { liked, count };
    const wanted = !before.liked;
    const wasSignedIn = me !== null;
    try {
      // 로그인하지 않았으면 로그인 창부터. 취소하면 아무것도 하지 않는다
      const user = await requireSignIn();
      if (!user) return;
      // 이미 로그인해 있었으면 낙관적 업데이트. 방금 로그인했으면 서버 응답을 그대로 따른다
      if (wasSignedIn) {
        setLiked(wanted);
        setCount(Math.max(0, before.count + (wanted ? 1 : -1)));
      }
      try {
        // 뒤집기가 아니라 원하는 최종 상태를 보낸다 (이미 눌러 둔 좋아요가 취소되지 않게)
        const data = await apiPost<{ liked: boolean; likes: number }>(endpoint, { liked: wanted });
        setLiked(data.liked);
        setCount(data.likes);
        onChange?.(data.liked, data.likes);
      } catch (e) {
        // 방금 로그인했으면 바꾼 것이 없다 (그 사이 부모가 새로 불러온 값을 덮어쓰지 않는다)
        if (wasSignedIn) {
          setLiked(before.liked);
          setCount(before.count);
        }
        if (e instanceof ApiError && e.code === 'auth_required') signIn();
        else setError(errorMessage(e));
      }
    } finally {
      busy.current = false;
    }
  };

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        aria-pressed={liked}
        aria-label={liked ? '좋아요 취소' : '좋아요'}
        title={error ?? undefined}
        className={`btn ${variant === 'large' ? 'px-4' : 'px-3'} ${
          liked ? 'border border-like/40 bg-like/15 text-like hover:bg-like/25' : 'btn-secondary'
        }`}
      >
        <HeartIcon size={variant === 'large' ? 17 : 15} filled={liked} />
        {formatCount(count)}
      </button>
      {error && (
        <span role="alert" className="max-w-40 text-center text-[11px] leading-tight text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
