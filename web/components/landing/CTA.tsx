import Link from 'next/link';

export default function CTA() {
  return (
    <section className="px-4 py-16 bg-surface-light">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="font-heading text-5xl md:text-6xl text-text-primary tracking-wide">
          Готов к игре?
        </h2>
        <p className="mt-4 font-body text-text-primary/80 text-lg">
          Выбирай турнир в календаре и выходи на песок.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row justify-center items-center gap-4">
          <Link
            href="/calendar"
            className="inline-flex items-center justify-center px-10 py-4 rounded-lg bg-brand text-white font-body font-semibold hover:bg-brand-light transition-colors text-base"
          >
            Открыть календарь
          </Link>
          <a
            href="https://vk.com/lpvolley"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-lg border border-white/20 text-text-primary font-body font-semibold hover:bg-white/10 transition-colors text-base"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M21.547 7h-3.29a.743.743 0 0 0-.655.392s-1.312 2.416-1.734 3.23C14.734 12.813 14 12.126 14 11.11V7.603A1.104 1.104 0 0 0 12.896 6.5h-2.474a1.982 1.982 0 0 0-1.75.813s1.255-.204 1.255 1.49c0 .42.022 1.626.04 2.64a.73.73 0 0 1-1.272.503 21.54 21.54 0 0 1-2.498-4.543.693.693 0 0 0-.63-.403H2.46a.5.5 0 0 0-.471.667c.97 3.4 4.476 10.833 8.716 10.833h1.488a.5.5 0 0 0 .5-.5v-1.865a.483.483 0 0 1 .49-.497c.376 0 1.034.12 2.03 1.078.862.862 1.003 1.284 1.487 1.284h3.04a.5.5 0 0 0 .416-.777c-.564-.862-2.263-3.159-2.394-3.345-.252-.36-.183-.524 0-.852.186-.328 1.943-2.726 2.637-3.672a.5.5 0 0 0-.352-.804z"/></svg>
            Мы в ВКонтакте
          </a>
        </div>
      </div>
    </section>
  );
}

