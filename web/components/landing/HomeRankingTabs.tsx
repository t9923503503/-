'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { LeaderboardEntry, RatingType } from '@/lib/types';
import PlayerPhoto from '@/components/ui/PlayerPhoto';
import RankMovementBadge from '@/components/rankings/RankMovementBadge';

const TABS: Array<{ key: RatingType; label: string }> = [
  { key: 'Mix', label: 'Микст' },
  { key: 'M', label: 'Мужчины' },
  { key: 'W', label: 'Женщины' },
];

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function HomeRankingTabs({ rankings }: { rankings: Record<RatingType, LeaderboardEntry[]> }) {
  const [active, setActive] = useState<RatingType>('Mix');
  const entries = rankings[active] || [];

  return (
    <section className="px-4 py-7 md:px-6 md:py-10" aria-labelledby="home-ranking-heading">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-brand">Турнирные результаты</p>
            <h2 id="home-ranking-heading" className="mt-2 font-heading text-5xl uppercase tracking-wide text-text-primary md:text-6xl">
              Рейтинг игроков
            </h2>
          </div>
          <Link href="/rankings" className="text-sm font-bold text-brand transition hover:text-brand/80">
            Открыть полный рейтинг →
          </Link>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Тип турнирного рейтинга">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active === tab.key}
              onClick={() => setActive(tab.key)}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] transition ${
                active === tab.key
                  ? 'bg-brand text-white shadow-[0_8px_22px_rgba(255,90,0,0.2)]'
                  : 'border border-black/10 bg-card text-text-secondary hover:border-brand/35 hover:text-text-primary dark:border-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {entries.length ? (
          <div className="mt-4 overflow-hidden rounded-[24px] border border-black/10 bg-card dark:border-white/10">
            <div className="hidden grid-cols-[56px_minmax(0,1fr)_110px_120px] items-center gap-3 border-b border-black/10 bg-surface-light/50 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary dark:border-white/10 sm:grid">
              <span>Место</span><span>Игрок</span><span>Очки</span><span>Движение</span>
            </div>
            <div className="divide-y divide-black/10 dark:divide-white/10">
              {entries.map((entry) => (
                <Link
                  key={entry.playerId}
                  href={`/players/${entry.playerId}`}
                  className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 transition hover:bg-brand/[0.04] sm:grid-cols-[56px_minmax(0,1fr)_110px_120px] sm:px-5"
                >
                  <span className="font-heading text-3xl tracking-wide text-text-secondary">{entry.rank}</span>
                  <span className="flex min-w-0 items-center gap-3">
                    {entry.photoUrl ? (
                      <PlayerPhoto photoUrl={entry.photoUrl} alt="" width={40} height={40} className="h-10 w-10 rounded-xl object-cover" />
                    ) : (
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-brand text-xs font-black text-white">
                        {initials(entry.name)}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-text-primary">{entry.name}</span>
                      <span className="mt-0.5 block text-[10px] uppercase tracking-[0.12em] text-text-secondary sm:hidden">{entry.rating} очков</span>
                    </span>
                  </span>
                  <span className="text-right text-sm font-black text-text-primary sm:text-left">{entry.rating}</span>
                  <span className="hidden sm:inline-flex"><RankMovementBadge entry={entry} compact /></span>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-[24px] border border-dashed border-black/15 bg-card px-6 py-12 text-center text-sm text-text-secondary dark:border-white/15">
            Рейтинг появится после публикации первых результатов турниров.
          </div>
        )}
      </div>
    </section>
  );
}
