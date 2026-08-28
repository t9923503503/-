'use client';

export default function TournamentsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6" role="alert">
      <h1 className="font-heading text-3xl">Не удалось загрузить турниры</h1>
      <p className="mt-2 text-sm text-text-secondary">Проверьте соединение с сервером и попробуйте ещё раз.</p>
      <button type="button" onClick={reset} className="mt-5 rounded-lg bg-brand px-4 py-2 font-semibold text-surface">
        Повторить
      </button>
    </div>
  );
}
