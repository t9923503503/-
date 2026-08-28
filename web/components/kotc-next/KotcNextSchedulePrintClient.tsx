'use client';

import { useEffect, useMemo, useState } from 'react';
import type { KotcNextSchedulePrintPayload } from '@/lib/kotc-next/print-schedule';

function formatRoundLabel(roundType: 'r1' | 'r2', options: { isTemplate: boolean; r2IsTemplate: boolean }): string {
  if (roundType === 'r2' && (options.isTemplate || options.r2IsTemplate)) return 'R2 · шаблон зон';
  return roundType.toUpperCase();
}

function TallyCells() {
  return (
    <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-px">
      {Array.from({ length: 15 }, (_, index) => (
        <span
          key={index}
          className="block h-5 min-w-0 border border-zinc-500 bg-white print:h-4 print:border-black"
        />
      ))}
    </div>
  );
}

export function KotcNextSchedulePrintClient({ tournamentId }: { tournamentId: string }) {
  const [payload, setPayload] = useState<KotcNextSchedulePrintPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/kotcn-schedule-print`, { cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          payload?: KotcNextSchedulePrintPayload;
        };
        if (!response.ok || !body.payload) {
          throw new Error(body.error || 'Не удалось загрузить расписание');
        }
        if (alive) setPayload(body.payload);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Не удалось загрузить расписание');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tournamentId]);

  const title = useMemo(() => payload?.tournamentName || 'KOTC Next', [payload]);

  return (
    <div className="kotcn-print-root min-h-screen bg-zinc-100 text-zinc-900 print:bg-white print:text-black">
      <div className="no-print sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">KOTC Next</div>
            <h1 className="text-lg font-bold">{title}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/sudyam/kotcn/${encodeURIComponent(tournamentId)}`}
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800"
            >
              Назад
            </a>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!payload}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Печать
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-8 print:max-w-none print:px-6 print:py-4">
        {loading ? <p className="rounded-lg border border-zinc-200 bg-white p-4">Загрузка расписания...</p> : null}
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">{error}</p> : null}

        {payload ? (
          <>
            <header className="mb-8 border-b border-zinc-300 pb-6 print:mb-6">
              <h1 className="text-2xl font-bold uppercase tracking-wide text-zinc-900 print:text-xl">
                {payload.tournamentName}
              </h1>
              <p className="mt-1 text-sm text-zinc-700 print:text-black">
                {payload.tournamentDate} · {payload.tournamentTime} · {payload.tournamentLocation}
              </p>
              <p className="mt-2 text-sm text-zinc-700 print:text-black">
                Формат {payload.variant} · {payload.raundCount} раундов · таймер {payload.timerMinutes} мин
              </p>
              {payload.isTemplate ? (
                <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 print:border-black">
                  Турнир ещё не запущен в KOTC Next: PIN-коды и R1 построены по текущему составу, R2 показан как шаблон зон.
                </p>
              ) : null}
              {!payload.isTemplate && payload.r2IsTemplate ? (
                <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 print:border-black">
                  R1 уже запущен в KOTC Next, а R2 ещё не материализован: для печати показан шаблон зон второго раунда.
                </p>
              ) : null}
            </header>

            {payload.rounds.map((round) => (
              <section key={round.roundNo} className="mb-10 print:mb-8">
                <h2 className="mb-4 border-b border-amber-600/40 pb-2 text-xl font-bold uppercase text-zinc-900 print:text-lg">
                  {formatRoundLabel(round.roundType, {
                    isTemplate: payload.isTemplate,
                    r2IsTemplate: payload.r2IsTemplate,
                  })}
                </h2>
                <div className="grid gap-5 print:block">
                  {round.courts.map((court) => (
                    <article
                      key={`${round.roundNo}-${court.courtNo}`}
                      className="rounded-xl border border-zinc-300 bg-white p-5 shadow-sm print:mb-6 print:break-after-page print:break-inside-avoid print:rounded-none print:border-black print:p-4 print:shadow-none"
                    >
                      <div className="flex items-start justify-between gap-4 border-b border-zinc-300 pb-3 print:border-black">
                        <div>
                          <h3 className="text-lg font-bold text-zinc-900 print:text-base">
                            {court.courtLabel}
                            <span className="ml-2 text-sm font-normal text-zinc-500 print:text-black">
                              корт {court.courtNo}
                            </span>
                          </h3>
                          <p className="mt-1 text-sm text-zinc-700 print:text-black">PIN: {court.pinCode}</p>
                        </div>
                        <div className="text-right text-xs uppercase tracking-[0.18em] text-zinc-500 print:text-black">
                          Судья
                          <div className="mt-8 w-44 border-b border-black" />
                        </div>
                      </div>

                      <div className="mt-4 space-y-4 print:mt-3 print:space-y-3">
                        {(court.raunds?.length
                          ? court.raunds
                          : Array.from({ length: payload.raundCount }, (_, raundIndex) => ({
                              raundNo: raundIndex + 1,
                              pairs: court.pairs,
                            }))
                        ).map((raund) => (
                          <section key={`${court.courtNo}-raund-${raund.raundNo}`} className="print:break-inside-avoid">
                            <div className="mb-2 flex items-center justify-between border-b border-zinc-300 pb-1 print:border-black">
                              <h4 className="text-sm font-bold uppercase tracking-wide text-zinc-900">
                                Раунд {raund.raundNo}
                              </h4>
                              <div className="text-xs text-zinc-600 print:text-black">
                                15 клеток для отметок очков
                              </div>
                            </div>
                            <table className="w-full table-fixed text-left text-xs">
                              <thead>
                                <tr className="border-b border-zinc-300 uppercase text-zinc-500 print:border-black print:text-black">
                                  <th className="w-7 py-1 pr-2">#</th>
                                  <th className="w-[34%] py-1 pr-2">Пара</th>
                                  <th className="py-1 pl-2">Палки / очки</th>
                                </tr>
                              </thead>
                              <tbody>
                                {raund.pairs.map((pair, index) => (
                                  <tr
                                    key={`${court.courtNo}-${raund.raundNo}-${pair}`}
                                    className="border-b border-zinc-200 print:border-gray-800"
                                  >
                                    <td className="py-1.5 pr-2 font-semibold">{index + 1}</td>
                                    <td className="py-1.5 pr-2 font-medium text-zinc-900 print:text-black">{pair}</td>
                                    <td className="py-1.5 pl-2">
                                      <TallyCells />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </section>
                        ))}
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-4 text-sm print:mt-4">
                        <div>
                          <div className="mb-5 border-b border-black pb-1">Старт</div>
                          <div className="border-b border-black pb-1">Финиш</div>
                        </div>
                        <div>
                          <div className="mb-5 border-b border-black pb-1">Подпись судьи</div>
                          <div className="border-b border-black pb-1">Подпись оператора</div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </>
        ) : null}
      </main>

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .kotcn-print-root {
            min-height: auto;
          }
          @page {
            size: A4 landscape;
            margin: 12mm;
          }
        }
      `}</style>
    </div>
  );
}
