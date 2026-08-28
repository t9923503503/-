'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { LeaderboardEntry } from '@/lib/types';
import RankMovementBadge from './RankMovementBadge';

type AccountState = 'loading' | 'guest' | 'unlinked' | 'linked';

interface RankingsMyPlaceProps {
  entries: LeaderboardEntry[];
  categoryLabel: string;
  onPlayerResolved: (playerId: string | null) => void;
  onReveal: (playerId: string) => void;
}

export default function RankingsMyPlace({
  entries,
  categoryLabel,
  onPlayerResolved,
  onReveal,
}: RankingsMyPlaceProps) {
  const [accountState, setAccountState] = useState<AccountState>('loading');
  const [playerId, setPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/auth/player-link', { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          setAccountState('guest');
          return null;
        }
        if (!response.ok) throw new Error('account lookup failed');
        return response.json();
      })
      .then((payload) => {
        if (!payload) return;
        const resolved = payload.linked_player || payload.resolved_player;
        const resolvedId = typeof resolved?.id === 'string' ? resolved.id : null;
        setPlayerId(resolvedId);
        onPlayerResolved(resolvedId);
        setAccountState(resolvedId ? 'linked' : 'unlinked');
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setAccountState('guest');
      });

    return () => controller.abort();
  }, [onPlayerResolved]);

  const entry = useMemo(
    () => (playerId ? entries.find((candidate) => candidate.playerId === playerId) ?? null : null),
    [entries, playerId],
  );

  if (accountState === 'loading') return null;

  if (accountState === 'guest') {
    return (
      <section className="mt-4 flex flex-col gap-3 rounded-[22px] border border-[#26c6ff]/25 bg-[#0d1f29] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8be2ff]">Моё место</div>
          <p className="mt-1 text-sm text-white/65">Войдите — и рейтинг сразу найдёт вашу карточку.</p>
        </div>
        <Link href="/profile" className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#26c6ff] px-4 text-sm font-black text-[#061016]">
          Войти и найти себя
        </Link>
      </section>
    );
  }

  if (accountState === 'unlinked') {
    return (
      <section className="mt-4 flex flex-col gap-3 rounded-[22px] border border-[#ffd400]/25 bg-[#241d05] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.14em] text-[#ffd400]">Моё место</div>
          <p className="mt-1 text-sm text-white/65">Привяжите турнирную карточку один раз.</p>
        </div>
        <Link href="/profile?tab=settings" className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#ffd400] px-4 text-sm font-black text-[#171200]">
          Привязать игрока
        </Link>
      </section>
    );
  }

  if (!entry) {
    return (
      <section className="mt-4 rounded-[22px] border border-white/8 bg-[#141414] px-4 py-4">
        <div className="text-xs font-black uppercase tracking-[0.14em] text-white/70">Моё место</div>
        <p className="mt-1 text-sm text-white/55">
          В разделе «{categoryLabel}» у вас пока нет рейтинговых результатов.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-4 overflow-hidden rounded-[24px] border border-[#ff6a00]/35 bg-[linear-gradient(110deg,#241207,#151515_68%)] px-4 py-4 shadow-[0_16px_42px_rgba(255,106,0,0.12)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ffb27d]">Моё место · {categoryLabel}</div>
          <div className="mt-1 truncate text-lg font-black text-white">{entry.name}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
            <span>{entry.rating} очков</span>
            <RankMovementBadge entry={entry} />
            <span>после последнего тура</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="font-heading text-5xl leading-none text-[#ffd400]">#{entry.rank}</div>
          <button
            type="button"
            onClick={() => onReveal(entry.playerId)}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/6 px-4 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26c6ff]"
          >
            Показать
          </button>
        </div>
      </div>
    </section>
  );
}
