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
  const finished = groups.filter(g => g.status === 'finished');

  return (
    <div className="space-y-12">
      {upcoming.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-8 rounded-full bg-brand" />
            <h2 className="font-heading text-3xl text-text-primary tracking-wide uppercase">
              Ближайшие турниры
            </h2>
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
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-8 rounded-full bg-white/20" />
            <h2 className="font-heading text-3xl text-text-primary/60 tracking-wide uppercase">
              Прошедшие турниры
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6">
            {finished.map(g => (
              <EventCard key={g.key} group={g} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
