'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GoSpectatorPayload } from '@/lib/go-next/types';
import { GoBracketView } from './GoBracketView';
import { GoGroupMatrix } from './GoGroupMatrix';
import { GoGroupStandings } from './GoGroupStandings';
import { GoMatchCard } from './GoMatchCard';
import { GoProgressBar } from './GoProgressBar';

export function GoSpectatorBoard({
  tournamentId,
  initialData,
}: {
  tournamentId: string;
  initialData?: GoSpectatorPayload | null;
}) {
  const [data, setData] = useState<GoSpectatorPayload | null>(initialData ?? null);
  const [activeLevel, setActiveLevel] = useState<string>('');

  const load = useCallback(async () => {
    if (!tournamentId) return;
    const response = await fetch(`/api/public/go-board/${encodeURIComponent(tournamentId)}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) return;
    setData(payload as GoSpectatorPayload);
  }, [tournamentId]);

  useEffect(() => {
    if (!initialData) {
      void load();
    }
  }, [initialData, load]);

  useEffect(() => {
    const timer = setInterval(() => {
      void load();
    }, 8000);
    return () => clearInterval(timer);
  }, [load]);

  const levelKeys = useMemo(() => Object.keys(data?.brackets ?? {}), [data?.brackets]);

  useEffect(() => {
    if (!activeLevel && levelKeys.length > 0) {
      setActiveLevel(levelKeys[0]);
    }
  }, [activeLevel, levelKeys]);

  if (!data) {
    return <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-white/60">Loading...</div>;
  }

  const nowPlaying = data.liveMatches.filter((match) => match.status === 'live');
  const nextMatches = data.liveMatches.filter((match) => match.status === 'pending').slice(0, 4);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-3 sm:px-4 sm:py-6">
      <header className="sticky top-0 z-10 -mx-3 border-b border-white/10 bg-[#0b0f14]/95 px-3 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-xl sm:border sm:px-4">
        <h1 className="truncate text-xl font-bold text-white sm:text-2xl">{data.tournamentName}</h1>
        <p className="mt-1 text-xs text-emerald-300">● LIVE · обновляется автоматически</p>
      </header>

      <GoProgressBar stage={data.stage} />

      <section className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3">
        <h2 className="text-sm font-bold text-white">Сейчас на кортах</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(nowPlaying.length ? nowPlaying : nextMatches).map((match) => (
            <GoMatchCard key={match.matchId} match={match} />
          ))}
          {!nowPlaying.length && !nextMatches.length ? <p className="text-sm text-white/60">Матчи пока не назначены.</p> : null}
        </div>
        {nextMatches.length ? <p className="mt-2 text-xs text-white/60">Следующие матчи показаны, если на кортах пока нет live-игры.</p> : null}
      </section>

      <section className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white">Групповой этап</h2>
            <p className="text-xs text-white/55">Текущий тур подсвечен, сыгранные матчи показаны зеркально в таблице.</p>
          </div>
        </div>
        <GoGroupMatrix groups={data.groups} matches={data.groupMatches ?? []} mode="spectator" qualifyCount={1} />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        {data.groups.map((group) => (
          <GoGroupStandings key={group.groupId} group={group} compact qualifyCount={1} />
        ))}
      </section>

      <GoBracketView
        brackets={data.brackets}
        level={activeLevel}
        onLevelChange={setActiveLevel}
        matches={data.liveMatches}
      />

      <section className="rounded-xl border border-white/10 bg-black/20 p-3">
        <h3 className="text-sm font-semibold text-white">Live корты</h3>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {data.liveMatches.map((match) => (
            <GoMatchCard key={match.matchId} match={match} />
          ))}
          {data.liveMatches.length === 0 ? (
            <div className="text-sm text-white/55">Сейчас нет live-матчей.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
