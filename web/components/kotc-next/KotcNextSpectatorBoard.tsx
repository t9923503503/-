'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { KotcNextSpectatorPayload } from '@/lib/kotc-next';

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

export function KotcNextSpectatorBoard({ data }: { data: KotcNextSpectatorPayload }) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      router.refresh();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,210,74,0.08),transparent_18%),linear-gradient(180deg,#090b15,#0b0f1c_28%,#090c14)] text-white">
      <div className="mx-auto max-w-[1200px] px-4 py-6 pb-12">
        <header className="rounded-[28px] border border-[#2d3144] bg-[linear-gradient(180deg,rgba(20,24,37,0.98),rgba(10,13,24,0.98))] px-5 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.34em] text-[#7d8498]">KOTC Next / Spectator</div>
              <h1 className="mt-2 font-heading text-3xl uppercase tracking-[0.08em] text-[#ffd24a] sm:text-4xl">
                {data.tournamentName}
              </h1>
              <p className="mt-2 text-sm text-[#c7cada]/78">
                {data.tournamentDate} · {data.tournamentTime || 'time TBA'}
                {data.tournamentLocation ? ` · ${data.tournamentLocation}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#4b3c15] bg-[#1b160d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ffd24a]">
                {formatStage(data.stage)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#aeb6c8]">
                {data.viewSource === 'snapshot' ? 'SNAPSHOT' : 'LIVE'}
              </span>
            </div>
          </div>

          {data.funStats ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Kingslayer</div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {data.funStats.kingslayer ? `${data.funStats.kingslayer.pairLabel} · ${data.funStats.kingslayer.takeovers}` : '—'}
                </div>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Stone Wall</div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {data.funStats.stoneWall ? `${data.funStats.stoneWall.pairLabel} · ${data.funStats.stoneWall.ratio}` : '—'}
                </div>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Longest Reign</div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {data.funStats.longestReign ? `${data.funStats.longestReign.pairLabel} · ${data.funStats.longestReign.consecutiveWins}` : '—'}
                </div>
              </div>
            </div>
          ) : null}
        </header>

        <main className="mt-6 space-y-6">
          {data.rounds.map((round) => (
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
                      ? [...court.liveState.pairs].sort(
                          (left, right) =>
                            right.kingWins - left.kingWins ||
                            right.takeovers - left.takeovers ||
                            left.pairIdx - right.pairIdx,
                        )
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
                              <th className="pb-2 px-2 text-center">TO</th>
                              <th className="pb-2 pl-2 text-center">Games</th>
                            </tr>
                          </thead>
                          <tbody>
                            {standings.map((row) => (
                              <tr key={`${court.courtId}-${row.pairIdx}`} className="border-t border-white/6">
                                <td className="py-2 pr-3 font-medium text-white">{pairLabel(court, row.pairIdx)}</td>
                                <td className="py-2 px-2 text-center text-[#ffd24a]">{row.kingWins}</td>
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

          {data.finalResults?.length ? (
            <section className="rounded-[24px] border border-[#2d3144] bg-[linear-gradient(180deg,rgba(20,24,37,0.98),rgba(10,13,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">Finals</div>
              <h2 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">Итоговые зоны</h2>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {data.finalResults.map((zone) => (
                  <div key={zone.zone} className="rounded-[18px] border border-white/8 bg-[#10101a] p-4">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">{zone.zoneLabel}</div>
                    <div className="mt-3 space-y-2">
                      {zone.pairs.map((pair) => (
                        <div key={`${zone.zone}-${pair.position}-${pair.pairLabel}`} className="rounded-2xl border border-[#5b4713] bg-[#18140d] px-3 py-2 text-sm font-semibold text-white">
                          #{pair.position} · {pair.pairLabel} · KP {pair.kingWins} · TO {pair.takeovers}
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
