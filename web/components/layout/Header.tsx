import Link from "next/link";
import MobileNav from "./MobileNav";

const navLinks = [
  { href: "/", label: "Главная" },
  { href: "/rankings", label: "Рейтинги" },
  { href: "/calendar", label: "Календарь" },
  { href: "/pravila", label: "Правила" },
  { href: "/partner", label: "Поиск пары" },
  { href: "/profile", label: "Профиль" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-surface/95 backdrop-blur border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="font-heading text-3xl md:text-4xl text-text-primary tracking-wide hover:text-brand transition-colors"
        >
          Лютые пляжники
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="font-body text-text-primary/90 hover:text-brand transition-colors"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/sudyam"
            className="px-4 py-1.5 rounded-lg bg-brand text-surface font-body font-semibold text-sm hover:bg-brand/90 transition-colors"
          >
            Судьям
          </Link>
        </nav>

        <MobileNav links={navLinks} />
      </div>
    </header>
  );
}

