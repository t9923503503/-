import type { ThaiSpectatorBoardPayload } from '@/lib/thai-spectator';
import { splitCourtPlayersForSpectator } from '@/lib/thai-spectator-court-split';
import { ThaiSpectatorFunStats } from '@/components/thai-live/ThaiSpectatorFunStats';

function formatThaiStage(stage: string | undefined): string {
  switch (stage) {
    case 'r1_live':
      return 'Раунд 1 · идёт';
    case 'r1_finished':
      return 'Раунд 1 · завершён';
    case 'r2_live':
      return 'Раунд 2 · идёт';
    case 'r2_finished':
      return 'Раунд 2 · завершён';
    default:
      return 'Подготовка';
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

function formatPointHistoryScore(score: { team1: number; team2: number }): string {
  return `${score.team1}:${score.team2}`;
}

function formatPointHistoryEventTime(recordedAt?: string | null): string | null {
  const normalized = String(recordedAt || '').trim();
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(parsed));
}

function getSpectatorHistoryStreak(
  history: Array<{ kind: 'rally' | 'correction'; scoringSide: 1 | 2 | null }>,
  index: number,
): number {
  const current = history[index];
  if (!current || current.kind !== 'rally' || (current.scoringSide !== 1 && current.scoringSide !== 2)) return 0;
  let streak = 1;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const previous = history[cursor];
    if (!previous || previous.kind !== 'rally' || previous.scoringSide !== current.scoringSide) break;
    streak += 1;
  }
  return streak;
}

function groupProgressRowsByPool(
  rows: ThaiSpectatorBoardPayload['progress'],
): Array<{ poolLabel: string; rows: ThaiSpectatorBoardPayload['progress'] }> {
  const grouped = new Map<string, ThaiSpectatorBoardPayload['progress']>();
  for (const row of rows) {
    const key = row.poolLabel || 'Без пула';
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }
  return Array.from(grouped.entries()).map(([poolLabel, poolRows]) => ({
    poolLabel,
    rows: [...poolRows].sort((left, right) => {
      const leftR2 = left.r2Place ?? Number.MAX_SAFE_INTEGER;
      const rightR2 = right.r2Place ?? Number.MAX_SAFE_INTEGER;
      if (leftR2 !== rightR2) return leftR2 - rightR2;
      const leftR1 = left.r1Place ?? Number.MAX_SAFE_INTEGER;
      const rightR1 = right.r1Place ?? Number.MAX_SAFE_INTEGER;
      if (leftR1 !== rightR1) return leftR1 - rightR1;
      return left.playerName.localeCompare(right.playerName, 'ru');
    }),
  }));
}

function formatRoundPlace(value: number | null): string {
  return value == null ? '—' : String(value);
}

function renderPlaceShift(row: ThaiSpectatorBoardPayload['progress'][number]): string | null {
  if (row.r1Place == null || row.r2Place == null) return null;
  if (row.r1Place === row.r2Place) return 'без изменений';
  const delta = row.r1Place - row.r2Place;
  if (delta > 0) return `↑ +${delta}`;
  return `↓ ${delta}`;
}

export function ThaiSpectatorBoard({ data }: { data: ThaiSpectatorBoardPayload }) {
  const variant = String(data.variant || '').trim().toUpperCase();
  const progressGroups = groupProgressRowsByPool(data.progress);

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
            {data.viewSource === 'snapshot' ? (
              <span className="rounded-full border border-sky-400/35 bg-sky-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-100">
                Архив
              </span>
            ) : null}
          </div>
        </div>

        {data.viewSource === 'snapshot' ? (
          <p className="mt-3 rounded-2xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm leading-relaxed text-sky-100/95">
            Показан сохранённый снимок табло
            {data.snapshotCapturedAt ? ` (${data.snapshotCapturedAt.slice(0, 10)})` : ''}. Так зрительская страница не
            теряется после завершения турнира или сброса Thai.
          </p>
        ) : null}

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
                ? `Раунд 1 ${data.pointLimitR1} / Раунд 2 ${data.pointLimitR2}`
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
                            <div key={match.matchId} className="rounded-2xl border border-white/8 bg-black/15 px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 text-white/82">
                                  {match.team1Label} vs {match.team2Label}
                                </div>
                                <div className="shrink-0 font-semibold text-[#ffd24a]">
                                  {match.team1Score ?? '-'}:{match.team2Score ?? '-'}
                                </div>
                              </div>

                              {match.pointHistory.length ? (
                                <details className="mt-3 rounded-2xl border border-white/8 bg-white/5 px-3 py-2">
                                  <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8f7c4a]">
                                    История очков · {match.pointHistory.length}
                                  </summary>
                                  <div className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">
                                    {match.pointHistory.map((event, index) => {
                                      const streak = getSpectatorHistoryStreak(match.pointHistory, index);
                                      const teamLabel =
                                        event.scoringSide === 1
                                          ? match.team1Label
                                          : event.scoringSide === 2
                                            ? match.team2Label
                                            : 'Коррекция';
                                      const eventTime = formatPointHistoryEventTime(event.recordedAt);
                                      return (
                                        <div
                                          key={`${match.matchId}-history-${event.seqNo}`}
                                          className={`rounded-[14px] border px-3 py-2 ${
                                            event.kind === 'correction'
                                              ? 'border-white/10 bg-white/5 text-white/78'
                                              : event.scoringSide === 1
                                                ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
                                                : 'border-orange-400/20 bg-orange-500/10 text-orange-100'
                                          }`}
                                        >
                                          <div className="flex flex-wrap items-center gap-2 text-sm">
                                            <span className="text-[11px] text-white/45">{formatPointHistoryScore(event.scoreBefore)}</span>
                                            <span className="font-black">→</span>
                                            <span className="font-semibold">{teamLabel}</span>
                                            {event.kind === 'rally' ? (
                                              <span className="text-[12px] italic text-white/68">
                                                (подача: {event.serverPlayerBefore?.playerName ?? 'не задана'})
                                              </span>
                                            ) : null}
                                            <span className="ml-auto font-black text-[#ffd24a]">
                                              {formatPointHistoryScore(event.scoreAfter)}
                                            </span>
                                          </div>
                                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/55">
                                            {eventTime ? <span className="rounded-full border border-white/10 px-2 py-0.5">{eventTime}</span> : null}
                                            {event.isSideOut ? <span className="rounded-full border border-white/10 px-2 py-0.5">side-out</span> : null}
                                            {streak >= 2 ? (
                                              <span className="rounded-full border border-white/10 px-2 py-0.5">{streak} подряд</span>
                                            ) : null}
                                            {event.kind === 'correction' ? <span>Коррекция счёта</span> : null}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </details>
                              ) : null}
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
          <h2 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">
            Места внутри пула по раундам
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/72">
            Здесь показано не общее место по всему турниру, а место игрока внутри своего пула
            на завершённом раунде. Поэтому одинаковые места могут повторяться в разных пулах.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {progressGroups.map((group) => (
              <div
                key={group.poolLabel}
                className="rounded-[18px] border border-white/8 bg-[#10101a] p-3"
              >
                <div className="text-[10px] uppercase tracking-[0.26em] text-[#8f7c4a]">
                  {group.poolLabel}
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-xs text-white/82">
                    <thead className="text-[10px] uppercase tracking-[0.22em] text-[#7d8498]">
                      <tr>
                        <th className="pb-2 pr-3">Игрок</th>
                        <th className="pb-2 pl-2 text-center">Раунд 1 → Раунд 2</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={row.playerId} className="border-t border-white/6">
                          <td className="py-2 pr-3 font-medium text-white">{row.playerName}</td>
                          <td className="py-2 pl-2 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/82">
                                {formatRoundPlace(row.r1Place)}
                              </span>
                              <span className="text-white/45">→</span>
                              <span className="rounded-full border border-[#5b4713] bg-[#18140d] px-2.5 py-1 text-[11px] font-semibold text-[#ffd24a]">
                                {formatRoundPlace(row.r2Place)}
                              </span>
                              {renderPlaceShift(row) ? (
                                <span
                                  className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                                    row.r1Place === row.r2Place
                                      ? 'border border-white/10 bg-white/5 text-white/65'
                                      : (row.r1Place ?? 0) > (row.r2Place ?? 0)
                                      ? 'border border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
                                      : 'border border-orange-400/20 bg-orange-500/10 text-orange-200'
                                  }`}
                                >
                                  {renderPlaceShift(row)}
                                </span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[#aeb6c8]">
            Пример: запись `3 → 1` означает, что в первом раунде игрок был третьим в своём пуле,
            а во втором стал первым. Метка `↑ +2` показывает, на сколько позиций он поднялся, а
            `без изменений` значит, что место между раундами не поменялось.
          </p>
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
