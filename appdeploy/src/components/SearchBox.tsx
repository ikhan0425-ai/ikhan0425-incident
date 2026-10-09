import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SearchIcon, XIcon } from './icons';

/** 헤더 검색창. 이미지 페이지에서는 프롬프트를, 그 외에는 모델을 검색한다. */
export function SearchBox() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const onImages = pathname.startsWith('/images');
  const current = params.get('q') ?? '';
  const [value, setValue] = useState(current);
  const [prev, setPrev] = useState(current);
  if (current !== prev) {
    // URL 이 바뀌면(뒤로 가기 등) 입력값도 맞춰 준다
    setPrev(current);
    setValue(current);
  }

  const submit = (q: string) => {
    const base = onImages ? '/images' : '/';
    const sp = new URLSearchParams(pathname === base ? params.toString() : '');
    if (q) sp.set('q', q);
    else sp.delete('q');
    const qs = sp.toString();
    navigate(qs ? `${base}?${qs}` : base);
  };

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        submit(value.trim());
      }}
    >
      <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={onImages ? '프롬프트, 모델 이름으로 이미지 검색' : '모델, 태그, 제작자 검색'}
        className="input h-9 pl-9 pr-8 [&::-webkit-search-cancel-button]:hidden"
        aria-label="검색"
      />
      {value && (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={() => {
            setValue('');
            if (current) submit('');
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-subtle hover:text-fg"
        >
          <XIcon size={14} />
        </button>
      )}
    </form>
  );
}
