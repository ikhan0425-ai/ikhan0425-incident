import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Avatar } from './Avatar';
import { Popover } from './Popover';
import { ChevronDownIcon, ImageIcon, LayersIcon, LogOutIcon, PlusIcon } from './icons';

const itemClass = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-surface-2';

export function UserMenu() {
  const { me, ready, signIn, signOut } = useAuth();
  const navigate = useNavigate();

  if (!ready) return <div className="skeleton h-9 w-28 rounded-lg" />;

  if (!me) {
    return (
      <button type="button" className="btn btn-primary px-3" onClick={() => signIn()}>
        로그인
      </button>
    );
  }

  const logout = async () => {
    try {
      await signOut();
    } finally {
      navigate('/');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Popover
        label="만들기"
        button={() => (
          <span className="btn btn-primary px-3">
            <PlusIcon size={15} />
            <span className="hidden sm:inline">만들기</span>
          </span>
        )}
      >
        <Link to="/models/new" className={itemClass}>
          <LayersIcon size={15} /> 모델 업로드
        </Link>
        <Link to="/images/new" className={itemClass}>
          <ImageIcon size={15} /> 이미지 올리기
        </Link>
      </Popover>
      <Popover
        label="내 메뉴"
        button={(open) => (
          <span className="flex items-center gap-1 rounded-full p-0.5 pr-1.5 hover:bg-surface-2">
            <Avatar userId={me.id} displayName={me.displayName} size={30} />
            <ChevronDownIcon size={14} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        )}
      >
        <div className="border-b border-line px-3 pb-2 pt-1.5">
          <p className="truncate text-sm font-bold">{me.displayName}</p>
        </div>
        <div className="pt-1">
          <Link to={`/users/${me.id}`} className={itemClass}>
            내 프로필
          </Link>
          <button type="button" onClick={logout} className={itemClass}>
            <LogOutIcon size={15} /> 로그아웃
          </button>
        </div>
      </Popover>
    </div>
  );
}
