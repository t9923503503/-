'use client';

import { useEffect, useState } from 'react';
import type { KotcNextPairLiveState, KotcNextSpectatorPayload } from '@/lib/kotc-next';

function formatStage(stage: string | undefined): string {
  switch (stage) {
    case 'r1_live':
      return 'R1 LIVE';
    case 'r1_finished':
      return 'R1 FINISHED';
    case 'r2_live':
      return 'R2 LIVE';
    case 'r2_finished':
      return 'R2 FINISHED';
    default:
      return 'SETUP';
  }
}

function pairLabel(court: KotcNextSpectatorPayload['rounds'][number]['courts'][number], pairIdx: number): string {
  return court.pairs.find((pair) => pair.pairIdx === pairIdx)?.label ?? `Pair ${pairIdx + 1}`;
}

function firstRallySeq(value: number | null | undefined): number {
  return Number.isFinite(value) && value != null ? value : Number.MAX_SAFE_INTEGER;
}

function compareLiveStandings(left: KotcNextPairLiveState, right: KotcNextPairLiveState): number {
  return (
    right.kingWins - left.kingWins ||
    (right.bestKingStreak ?? 0) - (left.bestKingStreak ?? 0) ||
    firstRallySeq(left.firstKingStreakSeq) - firstRallySeq(right.firstKingStreakSeq) ||
    right.takeovers - left.takeovers ||
    left.gamesPlayed - right.gamesPlayed ||
    left.pairIdx - right.pairIdx
  );
}

export function KotcNextSpectatorBoard({ data }: { data: KotcNextSpectatorPayload }) {
  const [liveData, setLiveData] = useState(data);

  useEffect(() => {
    setLiveData(data);
  }, [data]);

  useEffect(() => {
    let cancelled = false;

    async function refreshBoard() {
      try {
        const response = await fetch(`/api/public/kotcn-board/${encodeURIComponent(data.tournamentId)}`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          return;
        }
        const nextData = (await response.json()) as KotcNextSpectatorPayload;
        if (!cancelled) {
          setLiveData(nextData);
        }
      } catch {
        // Keep the last rendered board if the short polling request fails.
      }
    }

    const timer = window.setInterval(() => {
      void refreshBoard();
    }, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [data.tournamentId]);

  const board = liveData;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,210,74,0.08),transparent_18%),linear-gradient(180deg,#090b15,#0b0f1c_28%,#090c14)] text-white">
      <div className="mx-auto max-w-[1200px] px-4 py-6 pb-12">
        <header className="rounded-[28px] border border-[#2d3144] bg-[linear-gradient(180deg,rgba(20,24,37,0.98),rgba(10,13,24,0.98))] px-5 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.34em] text-[#7d8498]">KOTC Next / Spectator</div>
              <h1 className="mt-2 font-heading text-3xl uppercase tracking-[0.08em] text-[#ffd24a] sm:text-4xl">
                {board.tournamentName}
              </h1>
              <p className="mt-2 text-sm text-[#c7cada]/78">
                {board.tournamentDate} · {board.tournamentTime || 'time TBA'}
                {board.tournamentLocation ? ` · ${board.tournamentLocation}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#4b3c15] bg-[#1b160d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ffd24a]">
                {formatStage(board.stage)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#aeb6c8]">
                {board.viewSource === 'snapshot' ? 'SNAPSHOT' : 'LIVE'}
              </span>
            </div>
          </div>

          {board.funStats ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Kingslayer</div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {board.funStats.kingslayer ? `${board.funStats.kingslayer.pairLabel} · ${board.funStats.kingslayer.takeovers}` : '—'}
                </div>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Stone Wall</div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {board.funStats.stoneWall ? `${board.funStats.stoneWall.pairLabel} · ${board.funStats.stoneWall.ratio}` : '—'}
                </div>
              </div>
              <div className="rounded-[18px] border border-[#5b4713] bg-[#18140d] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#ffd24a]">Серия короля</div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {board.funStats.kingSideStreak
                    ? `${board.funStats.kingSideStreak.pairLabel} · ${board.funStats.kingSideStreak.consecutiveWins} подряд`
                    : '—'}
                </div>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Longest Reign</div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {board.funStats.longestReign ? `${board.funStats.longestReign.pairLabel} · ${board.funStats.longestReign.consecutiveWins}` : '—'}
                </div>
              </div>
            </div>
          ) : null}
        </header>

        <main className="mt-6 space-y-6">
          {board.rounds.map((round) => (
            <section key={round.roundId} className="space-y-3">
              <div>
                <h2 className="font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">
                  {round.roundType.toUpperCase()} · {String(round.status || '').toUpperCase()}
                </h2>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {round.courts.map((court) => {
                  const standings =
                    court.liveState?.pairs?.length
                      ? [...court.liveState.pairs].sort(compareLiveStandings)
                      : [...court.raunds]
                          .reverse()
                          .find((raund) => Array.isArray(raund.standings))
                          ?.standings ?? [];
                  return (
                    <article
                      key={court.courtId}
                      className="rounded-[24px] border border-[#2d3144] bg-[linear-gradient(180deg,rgba(20,24,37,0.98),rgba(10,13,24,0.98))] px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.26)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">{court.label}</div>
                        <div className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#aeb6c8]">
                          {String(court.status || '').toUpperCase()}
                        </div>
                      </div>

                      {court.liveState ? (
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-2xl border border-[#5b4713] bg-[#18140d] px-3 py-3">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-[#8f7c4a]">King</div>
                            <div className="mt-2 text-sm font-semibold text-white">
                              {pairLabel(court, court.liveState.kingPairIdx)}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-[#7d8498]">Challenger</div>
                            <div className="mt-2 text-sm font-semibold text-white">
                              {pairLabel(court, court.liveState.challengerPairIdx)}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-4 overflow-x-auto rounded-[18px] border border-white/8 bg-[#10101a] p-3">
                        <table className="min-w-full text-left text-xs text-white/82">
                          <thead className="text-[10px] uppercase tracking-[0.22em] text-[#7d8498]">
                            <tr>
                              <th className="pb-2 pr-3">Pair</th>
                              <th className="pb-2 px-2 text-center">KP</th>
                              <th className="pb-2 px-2 text-center">SER</th>
                              <th className="pb-2 px-2 text-center">TO</th>
                              <th className="pb-2 pl-2 text-center">Games</th>
                            </tr>
                          </thead>
                          <tbody>
                            {standings.map((row) => (
                              <tr key={`${court.courtId}-${row.pairIdx}`} className="border-t border-white/6">
                                <td className="py-2 pr-3 font-medium text-white">{pairLabel(court, row.pairIdx)}</td>
                                <td className="py-2 px-2 text-center text-[#ffd24a]">{row.kingWins}</td>
                                <td className="py-2 px-2 text-center">{row.bestKingStreak ?? 0}</td>
                                <td className="py-2 px-2 text-center">{row.takeovers}</td>
                                <td className="py-2 pl-2 text-center">{row.gamesPlayed}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}

          {board.finalResults?.length ? (
            <section className="rounded-[24px] border border-[#2d3144] bg-[linear-gradient(180deg,rgba(20,24,37,0.98),rgba(10,13,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">Finals</div>
              <h2 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">Итоговые зоны</h2>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {board.finalResults.map((zone) => (
                  <div key={zone.zone} className="rounded-[18px] border border-white/8 bg-[#10101a] p-4">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">{zone.zoneLabel}</div>
                    <div className="mt-3 space-y-2">
                      {zone.pairs.map((pair) => (
                        <div key={`${zone.zone}-${pair.position}-${pair.pairLabel}`} className="rounded-2xl border border-[#5b4713] bg-[#18140d] px-3 py-2 text-sm font-semibold text-white">
                          #{pair.position} · {pair.pairLabel} · KP {pair.kingWins} · SER {pair.bestKingStreak ?? 0} · TO {pair.takeovers}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
