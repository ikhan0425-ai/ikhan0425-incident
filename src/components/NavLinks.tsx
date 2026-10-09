"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ImageIcon, LayersIcon } from "./icons";

const LINKS = [
  { href: "/", label: "모델", icon: LayersIcon, match: (p: string) => p === "/" || p.startsWith("/models") },
  { href: "/images", label: "이미지", icon: ImageIcon, match: (p: string) => p.startsWith("/images") },
];

function Links({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex items-center gap-0.5">
      {LINKS.map(({ href, label, icon: Icon, match }) => {
        const active = pathname !== null && match(pathname);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors ${
              active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface hover:text-fg"
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

export function NavLinks() {
  return <Links pathname={usePathname()} />;
}

export function NavLinksFallback() {
  return <Links pathname={null} />;
}
