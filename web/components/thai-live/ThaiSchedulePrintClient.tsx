'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { ThaiSchedulePrintPayload } from '@/lib/thai-live/print-schedule';

function variantTitle(v: string): string {
  const u = String(v || '').toUpperCase();
  if (u === 'MN') return 'Мужчины: профи / новичок';
  if (u === 'MF') return 'Мужчины / женщины';
  if (u === 'MM') return 'Только мужчины';
  if (u === 'WW') return 'Только женщины';
  return u;
}

export function ThaiSchedulePrintClient({
  tournamentId,
  initialSeed,
}: {
  tournamentId: string;
  initialSeed?: string;
}) {
  const id = String(tournamentId || '').trim();
  const [payload, setPayload] = useState<ThaiSchedulePrintPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [seedInput, setSeedInput] = useState(initialSeed || '');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const seed = seedInput.trim() ? Math.trunc(Number(seedInput) || 0) : 0;
      const qs =
        seed >= 1 ? `?seed=${encodeURIComponent(String(seed))}` : '';
      const res = await fetch(`/api/admin/tournaments/${encodeURIComponent(id)}/schedule-print${qs}`, {
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        payload?: ThaiSchedulePrintPayload;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось загрузить расписание');
      }
      if (!data.payload) {
        throw new Error('Пустой ответ');
      }
      setPayload(data.payload);
    } catch (e) {
      setPayload(null);
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [id, seedInput]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="schedule-print-root min-h-screen bg-zinc-100 text-zinc-900 print:bg-white print:text-black">
      <div className="no-print sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
          <Link
            href={`/admin/tournaments/${encodeURIComponent(id)}/thai-live`}
            className="text-sm font-medium text-amber-800 underline-offset-2 hover:underline"
          >
            ← Thai Live
          </Link>
          <span className="text-zinc-300">|</span>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Печать
          </button>
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            Seed R1 (только до старта R1 в БД):
            <input
              value={seedInput}
              onChange={(ev) => setSeedInput(ev.target.value)}
              placeholder="например 7"
              className="w-24 rounded border border-zinc-300 px-2 py-1 text-zinc-900"
            />
            <button
              type="button"
              onClick={() => void load()}
              className="rounded border border-zinc-300 bg-white px-3 py-1 text-sm hover:bg-zinc-50"
            >
              Обновить
            </button>
          </label>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 print:max-w-none print:px-6 print:py-4">
        {loading ? <p className="text-zinc-500">Загрузка…</p> : null}
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        {payload ? (
          <>
            <header className="mb-8 border-b border-zinc-300 pb-6 print:mb-6">
              <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-zinc-900 print:text-xl">
                Расписание турнира (Thai)
              </h1>
              <p className="mt-2 text-lg font-semibold text-zinc-800">{payload.tournamentName}</p>
              <p className="mt-1 text-sm text-zinc-600">
                {payload.tournamentDate}
                {payload.tournamentTime ? ` · ${payload.tournamentTime}` : ''}
                {payload.tournamentLocation ? ` · ${payload.tournamentLocation}` : ''}
              </p>
              <p className="mt-2 text-sm text-zinc-700">
                Формат: {variantTitle(payload.variant)} · Туров: {payload.tourCount} · Лимит R1: {payload.pointLimitR1} / R2:{' '}
                {payload.pointLimitR2}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Жеребьёвка R1 (seed): {payload.r1SeedUsed}{' '}
                {payload.r1SeedSource === 'database'
                  ? '(зафиксирована в системе)'
                  : payload.r1SeedSource === 'preview'
                    ? '(из поля seed выше)'
                    : '(из настроек турнира)'}
              </p>
            </header>

            <section className="mb-10 print:mb-8 print:break-inside-avoid">
              <h2 className="mb-4 border-b border-amber-600/40 pb-2 font-heading text-xl font-bold uppercase text-zinc-900 print:text-lg">
                Раунд 1 — корты
              </h2>
              <p className="mb-4 text-sm text-zinc-600">
                В матчах указаны фамилии и условные пары: для MN — П = профи, Н = новичок (номер — место в четвёрке на корту); для MF — М / Ж;
                для MM/WW — №1…№8 по списку на корту.
              </p>
              <div className="space-y-8">
                {payload.r1Courts.map((court) => (
                  <article
                    key={`r1-${court.courtNo}`}
                    className="rounded-xl border border-zinc-300 bg-white p-5 shadow-sm print:break-inside-avoid print:rounded-none print:border print:shadow-none"
                  >
                    <h3 className="text-lg font-bold text-zinc-900">
                      Корт {court.courtLabel}
                      <span className="ml-2 text-sm font-normal text-zinc-500">(сид расписания туров: {court.courtScheduleSeed})</span>
                    </h3>
                    <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                      {court.rosterLines.map((line, i) => (
                        <li key={i} className="text-zinc-700">
                          {line}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 space-y-4">
                      {court.tours.map((tour) => (
                        <div key={tour.tourNo}>
                          <div className="font-semibold text-zinc-800">Тур {tour.tourNo}</div>
                          <table className="mt-2 w-full border-collapse text-sm">
                            <thead>
                              <tr className="border-b border-zinc-300 text-left text-xs uppercase text-zinc-500">
                                <th className="py-1 pr-2">#</th>
                                <th className="py-1 pr-2">Условно</th>
                                <th className="py-1">Игроки</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tour.matches.map((m) => (
                                <tr key={m.matchNo} className="border-b border-zinc-200 align-top">
                                  <td className="py-2 pr-2 font-medium text-zinc-800">М{m.matchNo}</td>
                                  <td className="py-2 pr-2 font-mono text-xs text-zinc-900">
                                    <div>
                                      {m.team1Symbolic} <span className="text-zinc-400">—</span> {m.team2Symbolic}
                                    </div>
                                  </td>
                                  <td className="py-2 text-zinc-800">
                                    <div>
                                      {m.team1Names} <span className="text-zinc-400">—</span> {m.team2Names}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="print:break-before-page">
              <h2 className="mb-4 border-b border-amber-600/40 pb-2 font-heading text-xl font-bold uppercase text-zinc-900 print:text-lg">
                Раунд 2 — зоны
              </h2>
              {payload.r2IsTemplate ? (
                <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 print:border-amber-300 print:bg-amber-50/80">
                  Ниже — шаблон схемы пар по турам (условные П1…Н4). После завершения R1 имена подставятся автоматически по итоговым
                  местам в пулах.
                </p>
              ) : (
                <p className="mb-4 text-sm text-zinc-600">
                  Составы зон R2 рассчитаны по итогам R1 (глобальная сортировка внутри пулов). Условные обозначения — порядок на корте R2.
                </p>
              )}
              <ul className="mb-6 list-disc space-y-2 pl-5 text-sm text-zinc-700">
                {payload.r2Legend.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              <div className="space-y-8">
                {payload.r2Courts.map((court) => (
                  <article
                    key={`r2-${court.courtNo}`}
                    className="rounded-xl border border-zinc-300 bg-white p-5 shadow-sm print:break-inside-avoid print:rounded-none print:border print:shadow-none"
                  >
                    <h3 className="text-lg font-bold text-zinc-900">
                      {court.zoneLabel ?? court.courtLabel}
                      <span className="ml-2 text-sm font-normal text-zinc-500">
                        · корт {court.courtNo} · сид туров {court.courtScheduleSeed}
                      </span>
                    </h3>
                    <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                      {court.rosterLines.map((line, i) => (
                        <li key={i} className="text-zinc-700">
                          {line}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 space-y-4">
                      {court.tours.map((tour) => (
                        <div key={tour.tourNo}>
                          <div className="font-semibold text-zinc-800">Тур {tour.tourNo}</div>
                          <table className="mt-2 w-full border-collapse text-sm">
                            <thead>
                              <tr className="border-b border-zinc-300 text-left text-xs uppercase text-zinc-500">
                                <th className="py-1 pr-2">#</th>
                                <th className="py-1 pr-2">Условно</th>
                                <th className="py-1">Игроки</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tour.matches.map((m) => (
                                <tr key={m.matchNo} className="border-b border-zinc-200 align-top">
                                  <td className="py-2 pr-2 font-medium text-zinc-800">М{m.matchNo}</td>
                                  <td className="py-2 pr-2 font-mono text-xs text-zinc-900">
                                    <div>
                                      {m.team1Symbolic} <span className="text-zinc-400">—</span> {m.team2Symbolic}
                                    </div>
                                  </td>
                                  <td className="py-2 text-zinc-800">
                                    <div>
                                      {m.team1Names} <span className="text-zinc-400">—</span> {m.team2Names}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .schedule-print-root {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}
