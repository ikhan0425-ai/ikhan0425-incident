import { Link } from 'react-router-dom';
import { SITE_DESCRIPTION, SITE_NAME } from '../shared/constants';
import { Logo } from './Logo';
import { NavLinks } from './NavLinks';
import { SearchBox } from './SearchBox';
import { UserMenu } from './UserMenu';

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-3 px-4">
        <Logo />
        <NavLinks />
        <div className="mx-auto hidden w-full max-w-xl sm:block">
          <SearchBox />
        </div>
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <UserMenu />
        </div>
      </div>
      <div className="px-4 pb-2.5 sm:hidden">
        <SearchBox />
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-2 px-4 py-8 text-sm text-subtle sm:flex-row sm:items-center sm:justify-between">
        <p>
          © 2026 {SITE_NAME} · {SITE_DESCRIPTION}
        </p>
        <nav className="flex gap-4">
          <Link to="/" className="hover:text-fg">
            모델
          </Link>
          <Link to="/images" className="hover:text-fg">
            이미지
          </Link>
          <Link to="/models/new" className="hover:text-fg">
            모델 업로드
          </Link>
        </nav>
      </div>
    </footer>
  );
}
