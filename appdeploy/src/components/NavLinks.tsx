import { Link, useLocation } from 'react-router-dom';
import { ImageIcon, LayersIcon } from './icons';

const LINKS = [
  { to: '/', label: '모델', icon: LayersIcon, match: (p: string) => p === '/' || p.startsWith('/models') },
  { to: '/images', label: '이미지', icon: ImageIcon, match: (p: string) => p.startsWith('/images') },
];

export function NavLinks() {
  const { pathname } = useLocation();
  return (
    <nav className="flex items-center gap-0.5">
      {LINKS.map(({ to, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors ${
              active ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg'
            }`}
          >
            <Icon size={15} />
            <span className="hidden md:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
