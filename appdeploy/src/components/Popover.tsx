import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/** 바깥 클릭·Esc 로 닫히는 드롭다운. 다른 페이지로 이동해도 닫힌다. */
export function Popover({
  button,
  children,
  className = '',
  align = 'right',
  closeOnClick = true,
  label,
}: {
  button: (open: boolean) => React.ReactNode;
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'right';
  closeOnClick?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)} className="flex items-center">
        {button(open)}
      </button>
      {open && (
        <div
          className={`absolute top-full z-50 mt-2 min-w-48 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-2xl shadow-black/50 ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${className}`}
          onClick={closeOnClick ? close : undefined}
        >
          {children}
        </div>
      )}
    </div>
  );
}
