import { Link } from 'react-router-dom';
import { SITE_NAME } from '../shared/constants';

export function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2" aria-label={`${SITE_NAME} 홈`}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#5c7cfa] via-[#9c36b5] to-[#f06595] shadow-lg shadow-indigo-900/40">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 18 9.5 9l4 6 2.5-3.5L20 18H4Z" fill="white" fillOpacity=".95" />
          <circle cx="16.5" cy="7" r="2.2" fill="white" />
        </svg>
      </span>
      <span className="text-lg font-extrabold tracking-tight">
        {SITE_NAME}
        <span className="ml-1 rounded bg-surface-3 px-1 py-0.5 align-middle text-[10px] font-bold text-muted">AI</span>
      </span>
    </Link>
  );
}
