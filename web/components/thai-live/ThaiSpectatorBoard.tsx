import type { ThaiSpectatorBoardPayload } from '@/lib/thai-spectator';
import type { TournamentResultRow } from '@/lib/queries';
import { buildThaiUnifiedResults } from '@/lib/thai-live/unified-results';
import { splitCourtPlayersForSpectator } from '@/lib/thai-spectator-court-split';
import { ThaiSpectatorFunStats } from '@/components/thai-live/ThaiSpectatorFunStats';
import { ThaiStandingsTable } from '@/components/thai-live/ThaiStandingsTable';
import { ThaiUnifiedResultsTable } from '@/components/thai-live/ThaiUnifiedResultsTable';
import { ThaiBoardAutoRefresh } from '@/components/thai-live/ThaiBoardAutoRefresh';
import { ThaiCourtTabs } from '@/components/thai-live/ThaiCourtTabs';

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

function isLiveStage(stage: string | undefined): boolean {
  return stage === 'r1_live' || stage === 'r2_live';
}

function formatThaiStatusLabel(status: string | undefined): string {
  switch (String(status || '').trim().toLowerCase()) {
    case 'pending':
      return 'Ожидает';
    case 'live':
      return 'идёт';
    case 'confirmed':
    case 'finished':
      return 'завершён';
    case 'cancelled':
      return 'отменён';
    default:
      return status || '—';
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

const CARD_CLASS =
  'rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] shadow-[0_18px_50px_rgba(0,0,0,0.26)]';

function MetaTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-[#11111d] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.24em] text-[#8b93a8]">{label}</div>
      <div className="mt-2 text-base font-bold text-white">{value}</div>
    </div>
  );
}

type ThaiSpectatorRound = ThaiSpectatorBoardPayload['rounds'][number];
type ThaiSpectatorCourt = ThaiSpectatorRound['courts'][number];

export function ThaiSpectatorBoard({
  data,
  storedResults = [],
}: {
  data: ThaiSpectatorBoardPayload;
  storedResults?: TournamentResultRow[];
}) {
  const variant = String(data.variant || '').trim().toUpperCase();
  const progressGroups = groupProgressRowsByPool(data.progress);
  const live = isLiveStage(data.stage);
  const unifiedResults = buildThaiUnifiedResults(data, storedResults);

  function renderCourtCard(round: ThaiSpectatorRound, court: ThaiSpectatorCourt) {
    const currentTour = court.tours.find((tour) => tour.tourNo === court.currentTourNo) ?? null;
    const pastTours = court.tours;

    return (
      <article className={`${CARD_CLASS} px-3 py-4 sm:px-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-[#ffd24a]">
            {round.roundType === 'r2' ? court.label : `Корт ${court.label}`}
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-white/70">
              Тур {court.currentTourNo}
            </span>
            <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-white/70">
              {formatThaiStatusLabel(court.currentTourStatus)}
            </span>
          </div>
        </div>

        {currentTour && currentTour.matches.length ? (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">Текущий тур · {currentTour.tourNo}</div>
            <div className="mt-2 space-y-2">
              {currentTour.matches.map((match) => (
                <div key={match.matchId} className="rounded-2xl border border-[#4a3d1b] bg-[#141019] px-3 py-3">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="text-right text-sm font-semibold leading-tight text-white sm:text-base">{match.team1Label}</div>
                    <div className="text-3xl font-black tabular-nums text-[#ffd24a] sm:text-4xl">
                      {match.team1Score ?? '–'}
                      <span className="px-1 text-white/35">:</span>
                      {match.team2Score ?? '–'}
                    </div>
                    <div className="text-left text-sm font-semibold leading-tight text-white sm:text-base">{match.team2Label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <details className="group mt-4 rounded-2xl border border-white/10 bg-white/[0.03]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
            Составы корта
            <span className="text-white/40 transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="grid gap-3 px-3 pb-3 sm:grid-cols-2">
            {splitCourtPlayersForSpectator(variant, court.playerNames).columns.map((col, colIdx) => (
              <div key={`${court.courtId}-col-${colIdx}`} className="min-w-0">
                {col.title ? (
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8f7c4a]">{col.title}</div>
                ) : null}
                <div className="grid gap-1.5">
                  {col.names.map((name, i) => (
                    <div
                      key={`${court.courtId}-c${colIdx}-${i}-${name}`}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white"
                    >
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>

        <details className="group mt-3 rounded-2xl border border-white/10 bg-white/[0.03]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
            Все туры
            <span className="text-white/40 transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="space-y-2 px-3 pb-3">
            {pastTours.map((tour) => (
              <div key={tour.tourId} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[#8f7c4a]">Тур {tour.tourNo}</div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/60">{formatThaiStatusLabel(tour.status)}</div>
                </div>
                <div className="mt-2 space-y-2 text-sm text-white/90">
                  {tour.matches.map((match) => (
                    <div key={match.matchId} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 text-white/85">
                          {match.team1Label} vs {match.team2Label}
                        </div>
                        <div className="shrink-0 text-lg font-black tabular-nums text-[#ffd24a]">
                          {match.team1Score ?? '-'}:{match.team2Score ?? '-'}
                        </div>
                      </div>

                      {match.pointHistory.length ? (
                        <details className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                          <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8f7c4a]">
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
        </details>

        <details className="group mt-4 rounded-2xl border border-white/10 bg-white/[0.03]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 marker:hidden [&::-webkit-details-marker]:hidden">
            Локальная таблица корта
            <span className="text-white/40 transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <ThaiStandingsTable className="border-t border-white/10 px-3 pb-3 pt-4" groups={court.standingsGroups} tourCount={round.tourCount} />
        </details>
      </article>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-3 sm:px-4">
      <div
        className="sticky z-30 -mx-3 border-b border-white/10 bg-[#07070f]/85 px-3 py-3 backdrop-blur-md sm:-mx-4 sm:px-4"
        style={{ top: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#9a8452]">Табло для зрителей</div>
            <h1 className="truncate font-heading text-lg uppercase tracking-[0.06em] text-[#ffd24a] sm:text-2xl">
              {data.tournamentName}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-[#4a3d1b] bg-[#1b160d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ffd24a]">
              {variantLabel(variant)}
            </span>
            <ThaiBoardAutoRefresh />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
              live ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100' : 'border-white/12 bg-white/5 text-[#aeb6c8]'
            }`}
          >
            {live ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
            ) : null}
            {formatThaiStage(data.stage)}
          </span>
          {data.viewSource === 'snapshot' ? (
            <span className="rounded-full border border-sky-400/35 bg-sky-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100">
              Архив
            </span>
          ) : null}
        </div>
      </div>

      {data.viewSource === 'snapshot' ? (
        <p className={`${CARD_CLASS} px-4 py-3 text-sm leading-relaxed text-sky-100/95`}>
          Показан сохранённый снимок табло
          {data.snapshotCapturedAt ? ` (${data.snapshotCapturedAt.slice(0, 10)})` : ''}. Так зрительская страница не
          теряется после завершения турнира или сброса Thai.
        </p>
      ) : null}

      <details className={`group ${CARD_CLASS}`}>
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9a8452]">Детали турнира</span>
          <span className="text-sm text-white/50 transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
          <MetaTile label="Дата" value={`${data.tournamentDate || '—'}${data.tournamentTime ? ` · ${data.tournamentTime}` : ''}`} />
          <MetaTile label="Площадка" value={data.tournamentLocation || '—'} />
          <MetaTile label="Игроки" value={data.rosterTotal} />
          <MetaTile
            label="Лимит очков"
            value={
              data.pointLimitR1 !== data.pointLimitR2
                ? `Раунд 1 ${data.pointLimitR1} / Раунд 2 ${data.pointLimitR2}`
                : data.pointLimitR1
            }
          />
          <MetaTile label="Корты" value={data.rounds[0]?.courts.length ?? '—'} />
          <MetaTile label={formatThaiPoolLabel(variant, 0)} value={data.rosterPrimaryCount} />
          <MetaTile
            label={variant === 'MF' || variant === 'MN' ? formatThaiPoolLabel(variant, 1) : 'Туров в раунде'}
            value={variant === 'MF' || variant === 'MN' ? data.rosterSecondaryCount : data.tourCount}
          />
        </div>
      </details>

      <ThaiUnifiedResultsTable model={unifiedResults} surface="live" />

      {data.rounds.map((round) => {
        const courtTabs = round.courts.map((court) => ({
          label: court.label,
          sublabel: round.roundType === 'r2' ? 'зона' : `тур ${court.currentTourNo}`,
        }));
        return (
          <details
            key={round.roundId}
            open={round.roundStatus !== 'finished'}
            className="group space-y-3"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
              <h2 className="font-heading text-xl uppercase tracking-[0.06em] text-[#ffd24a] sm:text-2xl">
                {round.roundType.toUpperCase()} • {formatThaiStatusLabel(round.roundStatus)}
              </h2>
              <div className="flex items-center gap-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-white/60">
                  {round.currentTourNo}/{round.tourCount} тур
                </div>
                {round.roundStatus === 'finished' ? (
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/75 group-open:hidden">
                    Открыть {round.roundType.toUpperCase()}
                  </span>
                ) : null}
              </div>
            </summary>

            <div className="mt-3">
              <ThaiCourtTabs tabs={courtTabs}>
                {round.courts.map((court) => (
                  <div key={court.courtId}>{renderCourtCard(round, court)}</div>
                ))}
              </ThaiCourtTabs>
            </div>
          </details>
        );
      })}

      {data.progress.length ? (
        <section className={`${CARD_CLASS} px-4 py-5 sm:px-5`}>
          <div className="text-[10px] uppercase tracking-[0.28em] text-[#8f7c4a]">Прогресс</div>
          <h2 className="mt-2 font-heading text-xl uppercase tracking-[0.06em] text-[#ffd24a] sm:text-2xl">
            Места внутри пула по раундам
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/78">
            Здесь показано не общее место по всему турниру, а место игрока внутри своего пула
            на завершённом раунде. Поэтому одинаковые места могут повторяться в разных пулах.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {progressGroups.map((group) => (
              <div key={group.poolLabel} className="rounded-[18px] border border-white/10 bg-[#10101a] p-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">{group.poolLabel}</div>
                <div className="mt-3 space-y-1.5">
                  {group.rows.map((row) => (
                    <div key={row.playerId} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{row.playerName}</span>
                      <span className="rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white/82">
                        {formatRoundPlace(row.r1Place)}
                      </span>
                      <span className="text-white/40">→</span>
                      <span className="rounded-full border border-[#5b4713] bg-[#18140d] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[#ffd24a]">
                        {formatRoundPlace(row.r2Place)}
                      </span>
                      {renderPlaceShift(row) ? (
                        <span
                          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
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
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[#aeb6c8]">
            Пример: запись `3 → 1` (Раунд 1 → Раунд 2) означает, что в первом раунде игрок был
            третьим в своём пуле, а во втором стал первым. Метка `↑ +2` показывает, на сколько
            позиций он поднялся, а `без изменений` значит, что место между раундами не поменялось.
          </p>
        </section>
      ) : null}

      {data.finalResults.length ? (
        <section className={`${CARD_CLASS} px-4 py-5 sm:px-5`}>
          <div className="text-[10px] uppercase tracking-[0.28em] text-[#8f7c4a]">Finals</div>
          <h2 className="mt-2 font-heading text-xl uppercase tracking-[0.06em] text-[#ffd24a] sm:text-2xl">Итоговые зоны</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {data.finalResults.map((zone) => (
              <div key={zone.label} className="rounded-[18px] border border-white/10 bg-[#10101a] p-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#8f7c4a]">{zone.label}</div>
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
