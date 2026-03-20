import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Поиск пары | Лютые Пляжники',
  description: 'Найди напарника на турнир — список игроков, которые ищут пару на ближайшие события.',
};

export default function PartnerPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="font-heading text-5xl md:text-6xl text-brand tracking-wide uppercase">
        Поиск пары
      </h1>
      <p className="mt-3 font-body text-text-secondary">
        Игроки, которые ищут напарника на ближайший турнир.
      </p>

      {/* Фильтры */}
      <div className="mt-8 flex flex-wrap gap-3">
        {['Все турниры', 'Hard', 'Medium', 'Lite', 'Только мужчины', 'Только женщины'].map((f) => (
          <span
            key={f}
            className="px-4 py-1.5 rounded-full border border-white/10 text-text-secondary font-body text-sm opacity-50 cursor-not-allowed"
          >
            {f}
          </span>
        ))}
      </div>

      {/* Заглушка списка */}
      <div className="mt-8 grid gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-5 animate-pulse">
            <div className="h-4 w-32 bg-white/10 rounded mb-2" />
            <div className="h-3 w-48 bg-white/5 rounded" />
          </div>
        ))}
      </div>

      <p className="mt-10 font-body text-sm text-text-secondary/50 text-center">
        Требуется авторизация — функция в разработке
      </p>
    </main>
  );
}
