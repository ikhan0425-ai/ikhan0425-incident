import { useRef, useState } from 'react';
import { ApiError, apiPost } from '../lib/api';
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
  const { requireSignIn, signIn } = useAuth();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const busy = useRef(false);
  // 부모가 새 값(예: 상세 정보를 다 불러온 뒤)을 주면 그 값을 따른다
  const [prev, setPrev] = useState({ liked: initialLiked, count: initialCount });
  if (prev.liked !== initialLiked || prev.count !== initialCount) {
    setPrev({ liked: initialLiked, count: initialCount });
    setLiked(initialLiked);
    setCount(initialCount);
  }

  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      // 로그인하지 않았으면 로그인 창부터. 취소하면 아무것도 하지 않는다
      const user = await requireSignIn();
      if (!user) return;
      // 낙관적 업데이트
      setLiked(!liked);
      setCount(Math.max(0, count + (liked ? -1 : 1)));
      try {
        const data = await apiPost<{ liked: boolean; likes: number }>(endpoint);
        setLiked(data.liked);
        setCount(data.likes);
        onChange?.(data.liked, data.likes);
      } catch (e) {
        setLiked(liked);
        setCount(count);
        if (e instanceof ApiError && e.code === 'auth_required') signIn();
      }
    } finally {
      busy.current = false;
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      aria-pressed={liked}
      aria-label={liked ? '좋아요 취소' : '좋아요'}
      className={`btn ${variant === 'large' ? 'px-4' : 'px-3'} ${
        liked ? 'border border-like/40 bg-like/15 text-like hover:bg-like/25' : 'btn-secondary'
      }`}
    >
      <HeartIcon size={variant === 'large' ? 17 : 15} filled={liked} />
      {formatCount(count)}
    </button>
  );
}
