import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Правила | Лютые Пляжники',
  description: 'Правила формата King of the Court — как работают корты, раунды, рейтинг и деления на зоны.',
};

export default function PravilaPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="font-heading text-5xl md:text-6xl text-brand tracking-wide uppercase">
        Правила
      </h1>
      <p className="mt-3 font-body text-text-secondary">
        Формат King of the Court — как это работает.
      </p>

      <div className="mt-12 grid gap-6">
        {[
          { title: 'Формат King of the Court', body: 'Описание формата, принципы ротации и победы.' },
          { title: 'Зоны: Hard / Medium / Lite', body: 'Как игроки распределяются по уровню и как переходят между зонами.' },
          { title: 'Система очков', body: 'Как начисляются рейтинговые очки за место в турнире.' },
          { title: 'Регламент корта', body: 'Правила поведения, тайминг раундов, роль судьи.' },
        ].map(({ title, body }) => (
          <div key={title} className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="font-heading text-2xl text-text-primary mb-2">{title}</h2>
            <p className="font-body text-text-secondary text-sm">{body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
