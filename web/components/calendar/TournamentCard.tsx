import Link from 'next/link';
import type { Tournament } from '@/lib/types';

interface TournamentCardProps {
  tournament: Tournament;
}

const statusLabels: Record<Tournament['status'], string> = {
  open: 'Открыта запись',
  full: 'Заполнен',
  finished: 'Завершён',
  cancelled: 'Отменён',
};

const statusStyles: Record<Tournament['status'], string> = {
  open: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  full: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  finished: 'bg-surface-lighter/70 text-text-primary/70 border-white/10',
  cancelled: 'bg-red-500/20 text-red-300 border-red-500/40',
};

export default function TournamentCard({ tournament }: TournamentCardProps) {
  const badgeClass = statusStyles[tournament.status];
  const label = statusLabels[tournament.status];

  const href = `/calendar/${tournament.id}`;

  return (
    <Link href={href} className="block">
      <article className="rounded-xl border border-white/10 bg-surface-light/20 p-6 hover:border-brand/40 transition-colors cursor-pointer">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-heading text-2xl text-text-primary leading-tight">
            {tournament.name}
          </h3>

          <div className="mt-2 font-body text-sm text-text-primary/75 flex flex-wrap gap-x-3 gap-y-1">
            <span>
              {tournament.date}
              {tournament.time ? ` · ${tournament.time}` : ''}
            </span>
            {tournament.location ? <span>📍 {tournament.location}</span> : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 font-body text-xs text-text-primary/70">
            <span>{tournament.format}</span>
            {tournament.division ? <span>· {tournament.division}</span> : null}
            {tournament.level ? <span>· {tournament.level}</span> : null}
          </div>
        </div>

        <span
          className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-body border ${badgeClass}`}
        >
          {label}
        </span>
      </div>

      <div className="mt-5 flex items-center justify-between text-xs font-body text-text-primary/60">
        <span>
          Участники: {tournament.participantCount}/{tournament.capacity}
        </span>
        <span className="hidden sm:inline">КОТС</span>
      </div>
      </article>
    </Link>
  );
}

