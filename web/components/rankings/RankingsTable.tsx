import type { LeaderboardEntry } from '@/lib/types';
import PlayerRow from './PlayerRow';

interface RankingsTableProps {
  entries: LeaderboardEntry[];
}

export default function RankingsTable({ entries }: RankingsTableProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center text-text-secondary py-16">
        Нет данных для отображения
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-surface-lighter">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-surface-light text-text-secondary text-sm font-condensed uppercase tracking-wide">
            <th className="py-3 px-4 w-12 text-center">#</th>
            <th className="py-3 px-4">Игрок</th>
            <th className="py-3 px-4 text-right">Рейтинг</th>
            <th className="py-3 px-4 text-right hidden sm:table-cell">Турниры</th>
            <th className="py-3 px-4 text-right hidden sm:table-cell">Победы</th>
            <th className="py-3 px-4 text-right hidden md:table-cell">Посл. игра</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <PlayerRow key={entry.playerId} entry={entry} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
