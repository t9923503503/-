import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-surface-light text-text-primary/80 mt-auto border-t border-white/10">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex flex-col md:flex-row gap-6 md:items-center md:justify-between">
          <div>
            <p className="font-heading text-2xl text-text-primary">
              Лютые пляжники
            </p>
            <p className="text-sm mt-1">
              King of the Court · Пляжный волейбол
            </p>
          </div>

          <nav className="flex gap-5">
            <Link href="/" className="hover:text-brand transition-colors">
              Главная
            </Link>
            <Link
              href="/rankings"
              className="hover:text-brand transition-colors"
            >
              Рейтинги
            </Link>
            <Link href="/calendar" className="hover:text-brand transition-colors">
              Календарь
            </Link>
          </nav>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 text-center text-xs">
          © {new Date().getFullYear()} Лютые пляжники. Все права защищены.
        </div>
      </div>
    </footer>
  );
}

