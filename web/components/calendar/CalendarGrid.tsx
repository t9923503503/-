import EventCard, { groupTournaments } from './EventCard';
import type { Tournament } from '@/lib/types';

export default function CalendarGrid({
  tournaments,
  emptyTitle = 'Пока нет турниров.',
  emptyHint = 'Следи за обновлениями — скоро появятся новые события.',
}: {
  tournaments: Tournament[];
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (!tournaments.length) {
    return (
      <div className="py-16 text-center">
        <p className="font-body text-text-primary/80 text-lg">{emptyTitle}</p>
        <p className="mt-2 font-body text-text-primary/50 text-sm">
          {emptyHint}
        </p>
      </div>
    );
  }

  const groups = groupTournaments(tournaments);

  const upcoming = groups.filter(g => g.status === 'open' || g.status === 'full');
  const finished = groups.filter(g =>
    g.status === 'in_progress' || g.status === 'awaiting_results' || g.status === 'finished'
  );

  const visibleFinished = finished.slice(0, 4);
  const hiddenFinished = finished.slice(4);

  return (
    <div className="space-y-16">
      {upcoming.length > 0 && (
        <section>
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.22em] text-brand">Играй с нами</p>
              <h2 className="mt-2 font-heading text-3xl tracking-wide text-text-primary md:text-4xl">Ближайшие турниры</h2>
            </div>
            <span className="hidden text-sm text-text-secondary sm:block">{upcoming.length} событий</span>
          </div>
          <div className="grid grid-cols-1 gap-6">
            {upcoming.map(g => (
              <EventCard key={g.key} group={g} />
            ))}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <section>
          <div className="mb-6 flex items-end justify-between gap-4 border-t border-white/10 pt-10">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.22em] text-white/35">Архив</p>
              <h2 className="mt-2 font-heading text-3xl tracking-wide text-text-primary/80">Недавние турниры</h2>
            </div>
            <span className="text-sm text-text-secondary">{finished.length} событий</span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {visibleFinished.map(g => (
              <EventCard key={g.key} group={g} compact />
            ))}
          </div>
          {hiddenFinished.length > 0 ? (
            <details className="group/archive mt-4">
              <summary className="cursor-pointer list-none rounded-xl border border-white/10 px-5 py-3 text-center text-sm font-semibold text-white/60 transition hover:border-brand/30 hover:text-brand">
                <span className="group-open/archive:hidden">Показать ещё {hiddenFinished.length}</span>
                <span className="hidden group-open/archive:inline">Свернуть архив</span>
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-3">
                {hiddenFinished.map(g => <EventCard key={g.key} group={g} compact />)}
              </div>
            </details>
          ) : null}
        </section>
      )}
    </div>
  );
}
