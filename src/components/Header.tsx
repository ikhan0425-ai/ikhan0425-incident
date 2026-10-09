import Link from "next/link";
import { Suspense } from "react";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";
import { getCurrentUser } from "@/lib/server/auth";
import { Logo } from "./Logo";
import { NavLinks, NavLinksFallback } from "./NavLinks";
import { SearchBox } from "./SearchBox";
import { UserMenu } from "./UserMenu";
import { SearchIcon } from "./icons";

function SearchFallback() {
  return (
    <div className="input flex h-9 items-center gap-2 text-subtle">
      <SearchIcon size={15} /> 모델, 태그, 제작자 검색
    </div>
  );
}

async function HeaderUser() {
  const user = await getCurrentUser();
  return <UserMenu user={user} />;
}

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-3 px-4">
        <Logo />
        <Suspense fallback={<NavLinksFallback />}>
          <NavLinks />
        </Suspense>
        <div className="mx-auto hidden w-full max-w-xl sm:block">
          <Suspense fallback={<SearchFallback />}>
            <SearchBox />
          </Suspense>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <Suspense fallback={<div className="skeleton h-9 w-28 rounded-lg" />}>
            <HeaderUser />
          </Suspense>
        </div>
      </div>
      <div className="px-4 pb-2.5 sm:hidden">
        <Suspense fallback={<SearchFallback />}>
          <SearchBox />
        </Suspense>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-2 px-4 py-8 text-sm text-subtle sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 {SITE_NAME} · {SITE_DESCRIPTION}</p>
        <nav className="flex gap-4">
          <Link href="/" className="hover:text-fg">모델</Link>
          <Link href="/images" className="hover:text-fg">이미지</Link>
          <Link href="/models/new" className="hover:text-fg">모델 업로드</Link>
        </nav>
      </div>
    </footer>
  );
}
