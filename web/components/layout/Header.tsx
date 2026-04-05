import Link from "next/link";
import MobileNav from "./MobileNav";

// \u-escape labels so production bundles stay correct if .tsx is ever saved in wrong encoding
const navLinks = [
  { href: "/", label: "\u0413\u043b\u0430\u0432\u043d\u0430\u044f" },
  { href: "/rankings", label: "\u0420\u0435\u0439\u0442\u0438\u043d\u0433\u0438" },
  { href: "/calendar", label: "\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c" },
  { href: "/pravila", label: "\u0412\u0438\u0434\u044b \u0442\u0443\u0440\u043d\u0438\u0440\u043e\u0432" },
  { href: "/partner", label: "\u041f\u043e\u0438\u0441\u043a \u043f\u0430\u0440\u044b" },
  { href: "/profile", label: "\u041f\u0440\u043e\u0444\u0438\u043b\u044c" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-surface/95 backdrop-blur border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="font-heading text-3xl md:text-4xl text-text-primary tracking-wide hover:text-brand transition-colors"
        >
          LPVOLLEY.RU
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
            href="/court"
            className="px-4 py-1.5 rounded-lg bg-brand text-surface font-body font-semibold text-sm hover:bg-brand/90 transition-colors"
          >
            {"\u0421\u0443\u0434\u044c\u044f\u043c"}
          </Link>
          <Link
            href="/admin/login"
            className="px-4 py-1.5 rounded-lg border border-brand/40 text-brand font-body font-semibold text-sm hover:bg-brand/10 transition-colors"
          >
            {"\u0410\u0434\u043c\u0438\u043d"}
          </Link>
        </nav>

        <MobileNav links={navLinks} />
      </div>
    </header>
  );
}
