export default function CoachSetupNotice({ detail }: { detail?: string }) {
  return (
    <section className="rounded-3xl border border-amber-400/25 bg-amber-400/[0.07] p-6 sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Нужна настройка</p>
      <h1 className="mt-2 font-heading text-4xl tracking-wide text-white">База LP Coach ещё не подготовлена</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Примените миграцию <code className="rounded bg-black/25 px-1.5 py-0.5 text-amber-200">088_lp_coach_foundation.sql</code>. Интерфейс не подставляет демо-учеников и после миграции покажет реальные карточки LPVOLLEY.</p>
      {detail ? <p className="mt-4 text-xs text-slate-600">{detail}</p> : null}
    </section>
  );
}
