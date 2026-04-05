import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-surface-light text-text-primary/80 mt-auto border-t border-white/10">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex flex-col md:flex-row gap-6 md:items-center md:justify-between">
          <div>
            <p className="font-heading text-2xl text-text-primary">
              LPVOLLEY.RU
            </p>
            <p className="text-sm mt-1">
              {"King of the Court · \u041f\u043b\u044f\u0436\u043d\u044b\u0439 \u0432\u043e\u043b\u0435\u0439\u0431\u043e\u043b"}
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-4">
            <nav className="flex gap-5">
              <Link href="/" className="hover:text-brand transition-colors">
                {"\u0413\u043b\u0430\u0432\u043d\u0430\u044f"}
              </Link>
              <Link
                href="/rankings"
                className="hover:text-brand transition-colors"
              >
                {"\u0420\u0435\u0439\u0442\u0438\u043d\u0433\u0438"}
              </Link>
              <Link href="/calendar" className="hover:text-brand transition-colors">
                {"\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c"}
              </Link>
            </nav>
            <a
              href="https://vk.com/lpvolley"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm hover:text-brand transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M21.547 7h-3.29a.743.743 0 0 0-.655.392s-1.312 2.416-1.734 3.23C14.734 12.813 14 12.126 14 11.11V7.603A1.104 1.104 0 0 0 12.896 6.5h-2.474a1.982 1.982 0 0 0-1.75.813s1.255-.204 1.255 1.49c0 .42.022 1.626.04 2.64a.73.73 0 0 1-1.272.503 21.54 21.54 0 0 1-2.498-4.543.693.693 0 0 0-.63-.403H2.46a.5.5 0 0 0-.471.667c.97 3.4 4.476 10.833 8.716 10.833h1.488a.5.5 0 0 0 .5-.5v-1.865a.483.483 0 0 1 .49-.497c.376 0 1.034.12 2.03 1.078.862.862 1.003 1.284 1.487 1.284h3.04a.5.5 0 0 0 .416-.777c-.564-.862-2.263-3.159-2.394-3.345-.252-.36-.183-.524 0-.852.186-.328 1.943-2.726 2.637-3.672a.5.5 0 0 0-.352-.804z"/></svg>
              {"\u0412\u041a\u043e\u043d\u0442\u0430\u043a\u0442\u0435"}
            </a>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 text-center text-xs">
          {"\u00a9 "}
          {new Date().getFullYear()} LPVOLLEY.RU.{" "}
          {"\u0412\u0441\u0435 \u043f\u0440\u0430\u0432\u0430 \u0437\u0430\u0449\u0438\u0449\u0435\u043d\u044b."}
        </div>
      </div>
    </footer>
  );
}
