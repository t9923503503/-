import Link from "next/link";
import MobileNav from "./MobileNav";
import HeaderAccountEntry from "./HeaderAccountEntry";

// \u-escape labels so production bundles stay correct if .tsx is ever saved in wrong encoding
const navLinks = [
  { href: "/", label: "\u0413\u043b\u0430\u0432\u043d\u0430\u044f" },
  { href: "/rankings", label: "\u0420\u0435\u0439\u0442\u0438\u043d\u0433\u0438" },
  { href: "/calendar", label: "\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c" },
  { href: "/partner", label: "\u0418\u0433\u0440\u0430\u0442\u044c" },
  { href: "/about", label: "\u041e \u043d\u0430\u0441" },
  { href: "/how-it-works", label: "\u041a\u0430\u043a \u0438\u0433\u0440\u0430\u0442\u044c" },
];

export default function Header() {
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

        <MobileNav links={navLinks} />
      </div>
    </header>
  );
}
