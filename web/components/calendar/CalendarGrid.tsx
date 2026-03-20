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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {tournaments.map((t) => (
        <TournamentCard key={t.id} tournament={t} />
      ))}
    </div>
  );
}

