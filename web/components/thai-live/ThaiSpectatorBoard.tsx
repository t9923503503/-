import type { ThaiSpectatorBoardPayload } from '@/lib/thai-spectator';
import { splitCourtPlayersForSpectator } from '@/lib/thai-spectator-court-split';
import { ThaiSpectatorFunStats } from '@/components/thai-live/ThaiSpectatorFunStats';

function formatThaiStage(stage: string | undefined): string {
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

function formatThaiPoolLabel(variant: string, index: 0 | 1): string {
  const key = String(variant || '').trim().toUpperCase();
  if (key === 'MF') return index === 0 ? 'Мужчины' : 'Женщины';
  if (key === 'MN') return index === 0 ? 'Профи' : 'Новички';
  return index === 0 ? 'Пул A' : 'Пул B';
}

function variantLabel(variant: string): string {
  const v = String(variant || '').trim().toUpperCase();
  if (v === 'MF') return 'M/W';
  if (v === 'MN') return 'M/N';
  if (v === 'MM') return 'M/M';
  if (v === 'WW') return 'W/W';
  return v || 'THAI';
}

export function ThaiSpectatorBoard({ data }: { data: ThaiSpectatorBoardPayload }) {
  const variant = String(data.variant || '').trim().toUpperCase();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4">
      <section className="rounded-[28px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(21,18,33,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.34em] text-[#9a8452]">Табло для зрителей</div>
            <h1 className="mt-2 font-heading text-3xl uppercase tracking-[0.08em] text-[#ffd24a] sm:text-4xl">
              {data.tournamentName}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#4a3d1b] bg-[#1b160d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ffd24a]">
              {variantLabel(variant)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#aeb6c8]">
              {formatThaiStage(data.stage)}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Дата</div>
            <div className="mt-2 text-sm font-semibold text-white">
              {data.tournamentDate || '—'} {data.tournamentTime ? `· ${data.tournamentTime}` : ''}
            </div>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Площадка</div>
            <div className="mt-2 text-sm font-semibold text-white">{data.tournamentLocation || '—'}</div>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Игроки</div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">{data.rosterTotal}</div>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Лимит очков</div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">
              {data.pointLimitR1 !== data.pointLimitR2
                ? `R1 ${data.pointLimitR1} / R2 ${data.pointLimitR2}`
                : data.pointLimitR1}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Корты</div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">
              {data.rounds[0]?.courts.length ?? '—'}
            </div>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">{formatThaiPoolLabel(variant, 0)}</div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">{data.rosterPrimaryCount}</div>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">
              {variant === 'MF' || variant === 'MN' ? formatThaiPoolLabel(variant, 1) : 'Туров в раунде'}
            </div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">
              {variant === 'MF' || variant === 'MN' ? data.rosterSecondaryCount : data.tourCount}
            </div>
          </div>
        </div>
      </section>

      {data.rounds.map((round) => (
        <section key={round.roundId} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">
                {round.roundType.toUpperCase()} • {round.roundStatus}
              </h2>
              <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-[#7d8498]">
                {round.currentTourNo}/{round.tourCount} тур
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {round.courts.map((court) => (
              <article
                key={court.courtId}
                className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.26)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">
                      {round.roundType === 'r2' ? court.label : `Корт ${court.label}`}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#aeb6c8]">
                        Тур {court.currentTourNo}
                      </span>
                      <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#aeb6c8]">
                        {court.currentTourStatus}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {splitCourtPlayersForSpectator(variant, court.playerNames).columns.map((col, colIdx) => (
                    <div key={`${court.courtId}-col-${colIdx}`} className="min-w-0">
                      {col.title ? (
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8f7c4a]">
                          {col.title}
                        </div>
                      ) : null}
                      <div className="grid gap-1.5">
                        {col.names.map((name, i) => (
                          <div
                            key={`${court.courtId}-c${colIdx}-${i}-${name}`}
                            className="rounded-xl border border-white/8 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white/88 sm:text-sm"
                          >
                            {name}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-[18px] border border-white/8 bg-[#10101a] p-3">
                  <div className="text-[10px] uppercase tracking-[0.26em] text-[#7d8498]">Туры</div>
                  <div className="mt-3 space-y-2">
                    {court.tours.map((tour) => (
                      <div key={tour.tourId} className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">Тур {tour.tourNo}</div>
                          <div className="text-[10px] uppercase tracking-[0.24em] text-[#aeb6c8]">{tour.status}</div>
                        </div>
                        <div className="mt-2 space-y-2 text-sm text-white/85">
                          {tour.matches.map((match) => (
                            <div key={match.matchId} className="flex items-center justify-between gap-3">
                              <div className="min-w-0 text-white/82">
                                {match.team1Label} vs {match.team2Label}
                              </div>
                              <div className="shrink-0 font-semibold text-[#ffd24a]">
                                {match.team1Score ?? '-'}:{match.team2Score ?? '-'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {court.standingsGroups.map((group) => (
                    <div key={`${court.courtId}-${group.pool}`} className="rounded-[18px] border border-white/8 bg-[#10101a] p-3">
                      <div className="text-[10px] uppercase tracking-[0.26em] text-[#8f7c4a]">{group.label}</div>
                      <div className="mt-3 overflow-x-auto">
                        <table className="min-w-full text-left text-xs text-white/82">
                          <thead className="text-[10px] uppercase tracking-[0.22em] text-[#7d8498]">
                            <tr>
                              <th className="pb-2 pr-3">Игрок</th>
                              {Array.from({ length: round.tourCount }, (_, index) => (
                                <th key={`${group.pool}-tour-${index + 1}`} className="pb-2 px-2 text-center">
                                  T{index + 1}
                                </th>
                              ))}
                              <th className="pb-2 px-2 text-center">Δ</th>
                              <th className="pb-2 px-2 text-center">P</th>
                              <th className="pb-2 px-2 text-center">K</th>
                              <th className="pb-2 px-2 text-center">Мячи</th>
                              <th className="pb-2 px-2 text-center">Поб</th>
                              <th className="pb-2 pl-2 text-center">Место</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map((row) => (
                              <tr key={row.playerId} className="border-t border-white/6">
                                <td className="py-2 pr-3 font-medium text-white">{row.playerName}</td>
                                {row.tourDiffs.map((diff, index) => (
                                  <td key={`${row.playerId}-${index}`} className="py-2 px-2 text-center">
                                    {diff > 0 ? `+${diff}` : diff}
                                  </td>
                                ))}
                                <td className="py-2 px-2 text-center">
                                  {row.totalDiff > 0 ? `+${row.totalDiff}` : row.totalDiff}
                                </td>
                                <td className="py-2 px-2 text-center text-base font-black text-[#ffd24a]">{row.pointsP}</td>
                                <td className="py-2 px-2 text-center text-[#9aa1b3]">{row.kef.toFixed(2)}</td>
                                <td className="py-2 px-2 text-center">{row.totalScored}</td>
                                <td className="py-2 px-2 text-center">{row.wins}</td>
                                <td className="py-2 pl-2 text-center font-semibold text-white">{row.place}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      {data.progress.length ? (
        <section className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">Прогресс</div>
          <h2 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">Места по раундам</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-white/82">
              <thead className="text-[10px] uppercase tracking-[0.22em] text-[#7d8498]">
                <tr>
                  <th className="pb-2 pr-3">Игрок</th>
                  <th className="pb-2 pr-3">Пул</th>
                  <th className="pb-2 px-2 text-center">R1</th>
                  <th className="pb-2 pl-2 text-center">R2</th>
                </tr>
              </thead>
              <tbody>
                {data.progress.map((row) => (
                  <tr key={row.playerId} className="border-t border-white/6">
                    <td className="py-2 pr-3 font-medium text-white">{row.playerName}</td>
                    <td className="py-2 pr-3 text-[#aeb6c8]">{row.poolLabel}</td>
                    <td className="py-2 px-2 text-center">{row.r1Place ?? '—'}</td>
                    <td className="py-2 pl-2 text-center">{row.r2Place ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data.finalResults.length ? (
        <section className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">Finals</div>
          <h2 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">Итоговые зоны</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {data.finalResults.map((zone) => (
              <div key={zone.label} className="rounded-[18px] border border-white/8 bg-[#10101a] p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">{zone.label}</div>
                <div className="mt-3 space-y-2">
                  {zone.winners.map((winner) => (
                    <div
                      key={`${zone.label}-${winner.playerId}`}
                      className="rounded-2xl border border-[#5b4713] bg-[#18140d] px-3 py-2 text-sm font-semibold text-white"
                    >
                      {winner.playerName} • {winner.poolLabel}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data.funStats ? <ThaiSpectatorFunStats stats={data.funStats} /> : null}
    </div>
  );
}
