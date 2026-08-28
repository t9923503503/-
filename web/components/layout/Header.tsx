"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import MobileNav from "./MobileNav";
import HeaderAccountEntry from "./HeaderAccountEntry";

// \u-escape labels so production bundles stay correct if .tsx is ever saved in wrong encoding
const navLinks = [
  { href: "/partner", label: "\u0418\u0433\u0440\u0430\u0442\u044c" },
  { href: "/calendar", label: "\u0422\u0443\u0440\u043d\u0438\u0440\u044b" },
  { href: "/archive", label: "\u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u044b" },
  { href: "/rankings", label: "\u0420\u0435\u0439\u0442\u0438\u043d\u0433" },
  { href: "/about", label: "\u041e \u043d\u0430\u0441" },
];

export default function Header() {
  const pathname = usePathname();

  if (pathname.startsWith("/sudyam")) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="font-heading text-3xl tracking-wide text-text-primary transition-colors hover:text-brand md:text-4xl"
        >
          LPVOLLEY.RU
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="font-body text-text-primary/90 transition-colors hover:text-brand"
            >
              {label}
            </Link>
          ))}
          <HeaderAccountEntry />
        </nav>

        <div className="flex items-center gap-1 lg:hidden">
          <HeaderAccountEntry compact />
          <MobileNav links={navLinks} />
        </div>
      </div>
    </header>
  );
}
