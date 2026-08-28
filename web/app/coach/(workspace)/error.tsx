'use client';

export default function CoachError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="rounded-3xl border border-red-400/20 bg-red-500/[0.05] p-8 text-center">
      <h1 className="font-heading text-4xl text-white">Не удалось загрузить LP Coach</h1>
      <p className="mt-3 text-sm text-slate-500">Повторите запрос. Если ошибка сохраняется, проверьте соединение с базой.</p>
      <button type="button" onClick={reset} className="mt-5 min-h-12 rounded-xl bg-orange-500 px-5 text-sm font-black text-white">Попробовать ещё раз</button>
    </section>
  );
}
