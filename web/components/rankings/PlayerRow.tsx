import Link from 'next/link';
import type { LeaderboardEntry } from '@/lib/types';

interface PlayerRowProps {
  entry: LeaderboardEntry;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return <span className="text-gold font-bold text-lg">🥇</span>;
  }
  if (rank === 2) {
    return <span className="text-silver font-bold text-lg">🥈</span>;
  }
  if (rank === 3) {
    return <span className="text-bronze font-bold text-lg">🥉</span>;
  }
  return (
    <span className="text-text-secondary font-condensed text-sm w-6 text-center">
      {rank}
    </span>
  );
}

export default function PlayerRow({ entry }: PlayerRowProps) {
  // Runtime hardening: leaderboard data should always contain `playerId`,
  // but if the API payload shape drifts (e.g. `player_id`), avoid generating broken links.
  const rawPlayerId = (entry as any)?.playerId ?? (entry as any)?.player_id ?? (entry as any)?.id;
  const playerId =
    typeof rawPlayerId === 'string' && rawPlayerId.trim().length > 0 ? rawPlayerId.trim() : null;

  return (
    <tr className="border-b border-surface-lighter hover:bg-surface-light transition-colors">
      <td className="py-3 px-4 w-12 text-center">
        <RankBadge rank={entry.rank} />
      </td>
      <td className="py-3 px-4">
        {playerId ? (
          <Link
            href={`/players/${encodeURIComponent(playerId)}`}
            className="text-text-primary hover:text-brand transition-colors font-medium"
          >
            {entry.name}
          </Link>
        ) : (
          <span className="text-text-primary/80 font-medium">{entry.name}</span>
        )}
      </td>
      <td className="py-3 px-4 text-right">
        <span className="text-brand font-condensed font-semibold text-lg">
          {entry.rating}
        </span>
      </td>
      <td className="py-3 px-4 text-right text-text-secondary hidden sm:table-cell">
        {entry.tournaments}
      </td>
      <td className="py-3 px-4 text-right text-text-secondary hidden sm:table-cell">
        {entry.wins}
      </td>
      <td className="py-3 px-4 text-right text-text-secondary hidden md:table-cell text-sm">
        {entry.lastSeen || '—'}
      </td>
    </tr>
  );
}
