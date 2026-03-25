import TournamentCard from './TournamentCard';
import type { Tournament } from '@/lib/types';

export default function CalendarGrid({ tournaments }: { tournaments: Tournament[] }) {
  if (!tournaments.length) {
    return (
      <div className="py-16 text-center">
        <p className="font-body text-text-primary/80 text-lg">Пока нет турниров.</p>
        <p className="mt-2 font-body text-text-primary/50 text-sm">
          Следи за обновлениями — скоро появятся новые события.
        </p>
      </div>
    );
  }

  // Open/full tournaments at top (upcoming), then finished
  const upcoming = tournaments.filter(t => t.status === 'open' || t.status === 'full');
  const finished = tournaments.filter(t => t.status === 'finished');

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
            {upcoming.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {finished.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
