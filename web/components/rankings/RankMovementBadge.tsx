import type { LeaderboardEntry } from '@/lib/types';

interface RankMovementBadgeProps {
  entry: Pick<LeaderboardEntry, 'previousRank' | 'rankDelta'>;
  compact?: boolean;
}

export default function RankMovementBadge({ entry, compact = false }: RankMovementBadgeProps) {
  const size = compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]';

  if (entry.previousRank == null) {
    return (
      <span
        title="Первое появление в рейтинге после последнего обновления"
        className={`inline-flex items-center rounded-full border border-[#26c6ff]/40 bg-[#0d1f29] font-black uppercase tracking-[0.08em] text-[#8be2ff] ${size}`}
      >
        NEW
      </span>
    );
  }

  const delta = Number(entry.rankDelta || 0);
  if (delta > 0) {
    return (
      <span
        title={`Поднялся на ${delta} поз.`}
        aria-label={`Поднялся на ${delta} позиций`}
        className={`inline-flex items-center rounded-full border border-[#37d45d]/40 bg-[#0d2012] font-black tracking-[0.08em] text-[#7cf293] ${size}`}
      >
        ▲{delta}
      </span>
    );
  }

  if (delta < 0) {
    return (
      <span
        title={`Опустился на ${Math.abs(delta)} поз.`}
        aria-label={`Опустился на ${Math.abs(delta)} позиций`}
        className={`inline-flex items-center rounded-full border border-[#ff6a00]/35 bg-[#241207] font-black tracking-[0.08em] text-[#ffb27d] ${size}`}
      >
        ▼{Math.abs(delta)}
      </span>
    );
  }

  return (
    <span
      title="Позиция не изменилась"
      aria-label="Позиция не изменилась"
      className={`inline-flex items-center rounded-full border border-white/10 bg-white/5 font-black tracking-[0.08em] text-white/55 ${size}`}
    >
      •
    </span>
  );
}
