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

        <div className="mt-10 flex justify-center">
          <Link
            href="/calendar"
            className="inline-flex items-center justify-center px-10 py-4 rounded-lg bg-brand text-white font-body font-semibold hover:bg-brand-light transition-colors text-base"
          >
            Открыть календарь
          </Link>
        </div>
      </div>
    </section>
  );
}

