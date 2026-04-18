'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GoSpectatorPayload } from '@/lib/go-next/types';
import { GoBracketView } from './GoBracketView';
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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-white">{data.tournamentName}</h1>
        <p className="text-sm text-white/60">GO Live board</p>
      </header>

      <GoProgressBar stage={data.stage} />

      <section className="grid gap-3 lg:grid-cols-2">
        {data.groups.map((group) => (
          <GoGroupStandings key={group.groupId} group={group} compact qualifyCount={1} />
        ))}
      </section>

      <GoBracketView
        brackets={data.brackets}
        level={activeLevel}
        onLevelChange={setActiveLevel}
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
