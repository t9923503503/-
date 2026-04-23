'use client';

import { memo, useMemo } from 'react';
import { makeQrDataUrl } from '@/public/shared/qr-gen.js';
import { resolveAbsoluteJudgeUrl } from '@/lib/thai-ui-helpers';
import type { SudyamBootstrapPayload } from '@/lib/sudyam-bootstrap';
import type { KotcNextCourtOperatorView, KotcNextOperatorState, KotcNextR2SeedZone } from '@/lib/kotc-next';
import { zoneLabel } from '@/lib/kotc-next-config';
import { KotcNextR2SeedEditor } from './KotcNextR2SeedEditor';

const QrCodeImage = memo(function QrCodeImage({ judgeUrl, label }: { judgeUrl: string; label: string }) {
  const dataUrl = useMemo(
    () =>
      makeQrDataUrl(
        typeof window === 'undefined' ? judgeUrl : resolveAbsoluteJudgeUrl(judgeUrl, window.location.origin),
        { scale: 4, margin: 1, dark: '#17130b', light: '#ffffff' },
      ),
    [judgeUrl],
  );
  return (
    <img
      src={dataUrl}
      alt={`QR для корта ${label}`}
      className="h-20 w-20 rounded-2xl border border-[#2e2a1d] bg-white p-2"
    />
  );
});

export type KotcNextOperatorBootstrapPhase = 'idle' | 'bootstrapping' | 'blocked' | 'error';

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

function formatVariant(variant: string | undefined): string {
  const normalized = String(variant || '').trim().toUpperCase();
  if (normalized === 'MM' || normalized === 'WW' || normalized === 'MN') return normalized;
  return 'MF';
}

function formatMetricValue(value: unknown): string {
  if (value == null || value === '') return '-';
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return String(value);
  }
  return '-';
}

function formatRaundStatus(status: string | undefined): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'running') return 'LIVE';
  if (normalized === 'finished') return 'DONE';
  return 'PENDING';
}

function formatCourtStatus(status: string | undefined): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'live') return 'LIVE';
  if (normalized === 'finished') return 'DONE';
  return 'PENDING';
}

function pickStandings(court: KotcNextCourtOperatorView) {
  if (court.liveState?.pairs?.length) {
    return [...court.liveState.pairs].sort(
      (left, right) =>
        right.kingWins - left.kingWins ||
        right.takeovers - left.takeovers ||
        left.pairIdx - right.pairIdx,
    );
  }
  const latestFinished = [...court.raunds].reverse().find((raund) => Array.isArray(raund.standings));
  return latestFinished?.standings ?? [];
}

function labelForPair(court: KotcNextCourtOperatorView, pairIdx: number): string {
  return court.pairs.find((pair) => pair.pairIdx === pairIdx)?.label ?? `Pair ${pairIdx + 1}`;
}

export function KotcNextOperatorPanel({
  data,
  bootstrap,
  actions,
  title = 'Король корта',
  subtitle = 'Оператор ведёт bootstrap R1/R2, отслеживает корты, а каждый судья закрывает свои раунды локально на PIN-экране.',
}: {
  data: SudyamBootstrapPayload;
  bootstrap: {
    phase: KotcNextOperatorBootstrapPhase;
    message: string | null;
    lastUpdatedAt?: Date | null;
    onBootstrapR1: () => void;
    onRefresh: () => void;
  };
  actions: {
    pendingAction: 'preview_r2_seed' | 'confirm_r2_seed' | 'bootstrap_r2' | 'finish_r1' | 'finish_r2' | null;
    r2SeedDraft: KotcNextR2SeedZone[] | null;
    r2SeedLoading: boolean;
    onAction: (action: 'finish_r1' | 'finish_r2') => void;
    onOpenR2Seed: () => void;
    onConfirmR2Seed: (zones: KotcNextR2SeedZone[]) => void;
  };
  title?: string;
  subtitle?: string;
}) {
  const operatorState = data.kotcOperatorState;
  const judgeModule = data.kotcJudgeModule === 'next' ? 'Next' : 'Legacy';
  const blockedReason = String(data.kotcJudgeBlockedReason || '').trim();
  const isNextModule = data.kotcJudgeModule === 'next';
  const canBootstrapR1 =
    isNextModule && !blockedReason && Boolean(operatorState?.canBootstrapR1 || data.kotcJudgeNeedsBootstrap);
  const participants = data.bootstrapState.participants.filter((participant) => !participant.isWaitlist);
  const activeCourt =
    operatorState?.rounds.flatMap((round) => round.courts).find((court) => court.status === 'live') ??
    operatorState?.rounds[0]?.courts[0] ??
    null;
  const bootstrapMessage =
    bootstrap.message ||
    (bootstrap.phase === 'bootstrapping'
      ? 'Подготавливаем R1 и судейские PIN-корты…'
      : canBootstrapR1
        ? 'Турнир ещё не материализован в KOTC Next. Запустите R1, чтобы создать корты и PIN-коды.'
        : null);

  return (
    <div className="space-y-4">
      <section className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,10,14,0.98),rgba(6,7,12,0.98))] px-5 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.34em] text-white/34">Sudyam / KOTC Next</div>
            <h2 className="mt-2 font-heading text-4xl uppercase tracking-[0.08em] text-[#ffd24a] sm:text-5xl">
              {title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/62">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#4b3c15] bg-[#1b160d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ffd24a]">
              {formatVariant(operatorState?.variant ?? data.bootstrapState.settings.variant as string)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#aeb6c8]">
              {judgeModule}
            </span>
            {operatorState ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#aeb6c8]">
                {formatStage(operatorState.stage)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Участники</div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">{participants.length}</div>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Корты</div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">
              {formatMetricValue(operatorState?.params.courts ?? data.bootstrapState.settings.courts)}
            </div>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Пар на корт</div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">
              {formatMetricValue(operatorState?.params.ppc ?? data.bootstrapState.settings.kotcPpc)}
            </div>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Раунды / таймер</div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">
              {operatorState
                ? `${operatorState.params.raundCount} · ${operatorState.params.raundTimerMinutes}м`
                : `${data.bootstrapState.settings.kotcRaundCount ?? '-'} · ${data.bootstrapState.settings.kotcRaundTimerMinutes ?? '-'}м`}
            </div>
          </div>
        </div>

        {bootstrapMessage ? (
          <div
            className={`mt-4 rounded-[18px] px-4 py-3 text-sm ${
              bootstrap.phase === 'blocked' || blockedReason
                ? 'border border-red-400/30 bg-red-500/10 text-red-100'
                : bootstrap.phase === 'error'
                  ? 'border border-amber-400/30 bg-amber-500/10 text-amber-100'
                  : 'border border-sky-400/30 bg-sky-500/10 text-sky-100'
            }`}
          >
            {bootstrapMessage}
          </div>
        ) : null}

        {blockedReason ? (
          <div className="mt-4 rounded-[18px] border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            <div className="text-[10px] uppercase tracking-[0.28em] text-red-200/80">Launch blocked</div>
            <div className="mt-2">{blockedReason}</div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={bootstrap.onRefresh}
            className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
          >
            Обновить
          </button>
          {bootstrap.lastUpdatedAt ? (
            <span className="text-[11px] text-white/35 tracking-[0.16em]">
              {new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(bootstrap.lastUpdatedAt)}
            </span>
          ) : null}
          {canBootstrapR1 ? (
            <button
              type="button"
              onClick={bootstrap.onBootstrapR1}
              disabled={bootstrap.phase === 'bootstrapping'}
              className="inline-flex rounded-full border border-[#5b4713] bg-[#ffd24a] px-4 py-2 text-sm font-semibold text-[#17130b] transition hover:bg-[#ffe07f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bootstrap.phase === 'bootstrapping' ? 'Запускаем R1…' : 'Запустить R1'}
            </button>
          ) : null}
          {operatorState?.canPreviewR2Seed ? (
            <button
              type="button"
              onClick={actions.onOpenR2Seed}
              disabled={actions.r2SeedLoading}
              className="inline-flex rounded-full border border-[#5b4713] bg-[#ffd24a] px-4 py-2 text-sm font-semibold text-[#17130b] transition hover:bg-[#ffe07f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actions.r2SeedLoading ? 'Собираем зоны…' : 'Предпросмотр зон R2'}
            </button>
          ) : null}
          {operatorState?.canFinishR1 ? (
            <button
              type="button"
              onClick={() => actions.onAction('finish_r1')}
              disabled={actions.pendingAction === 'finish_r1'}
              className="inline-flex rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-100 transition hover:border-red-300/50 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actions.pendingAction === 'finish_r1' ? 'Завершаем R1…' : '■ Завершить R1'}
            </button>
          ) : null}
          {operatorState?.canFinishR2 ? (
            <button
              type="button"
              onClick={() => actions.onAction('finish_r2')}
              disabled={actions.pendingAction === 'finish_r2'}
              className="inline-flex rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-100 transition hover:border-red-300/50 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actions.pendingAction === 'finish_r2' ? 'Завершаем R2…' : '■ Завершить R2'}
            </button>
          ) : null}
          {activeCourt ? (
            <a
              href={activeCourt.judgeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
            >
              Открыть активный корт
            </a>
          ) : null}
          {operatorState?.rounds.length && data.tournamentId ? (
            <a
              href={`/live/kotcn/${encodeURIComponent(data.tournamentId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:border-emerald-400/50 hover:bg-emerald-500/15"
            >
              Табло для зрителей
            </a>
          ) : null}
        </div>
      </section>

      {operatorState?.canPreviewR2Seed ? (
        <KotcNextR2SeedEditor
          draft={actions.r2SeedDraft}
          loading={actions.r2SeedLoading || actions.pendingAction === 'confirm_r2_seed'}
          message={
            actions.r2SeedDraft
              ? null
              : 'Откройте автопосев, проверьте пары по зонам и подтвердите запуск R2.'
          }
          onReload={actions.onOpenR2Seed}
          onConfirm={actions.onConfirmR2Seed}
        />
      ) : null}

      {operatorState ? (
        <>
          {operatorState.rounds.map((round) => (
            <section key={round.roundId} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">
                    {round.roundType.toUpperCase()} · {String(round.status || '').toUpperCase()}
                  </h3>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-[#7d8498]">
                    {round.courts.length} courts
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {round.courts.map((court) => {
                  const standings = pickStandings(court);
                  const isLive = court.status === 'live';
                  return (
                    <article
                      key={court.courtId}
                      className={`rounded-[24px] border bg-[linear-gradient(180deg,rgba(20,24,37,0.98),rgba(10,13,24,0.98))] px-4 py-4 transition-shadow ${isLive ? 'border-[#2fd35a] shadow-[0_18px_50px_rgba(47,211,90,0.12)]' : 'border-[#2d3144] shadow-[0_18px_50px_rgba(0,0,0,0.26)]'}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">
                            {round.roundType === 'r2' ? court.label : `Court ${court.label}`}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-[#4b3c15] bg-[#1b160d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ffd24a]">
                              PIN {court.pinCode}
                            </span>
                            <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#aeb6c8]">
                              {formatCourtStatus(court.status)}
                            </span>
                            <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#aeb6c8]">
                              Raund {court.currentRaundNo ?? '-'}
                            </span>
                          </div>
                        </div>
                        <QrCodeImage judgeUrl={court.judgeUrl} label={court.label} />
                      </div>

                      <div className="mt-4 grid gap-2">
                        {court.pairs.map((pair) => (
                          <div
                            key={`${court.courtId}-${pair.pairIdx}`}
                            className="rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-sm font-medium text-white/88"
                          >
                            {pair.label}
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {court.raunds.map((raund) => (
                          <span
                            key={`${court.courtId}-raund-${raund.raundNo}`}
                            className="rounded-full border border-white/8 bg-[#10101a] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#aeb6c8]"
                          >
                            R{raund.raundNo} · {formatRaundStatus(raund.status)}
                          </span>
                        ))}
                      </div>

                      {court.liveState ? (
                        <div className="mt-4 rounded-[18px] border border-white/8 bg-[#10101a] p-3">
                          <div className="text-[10px] uppercase tracking-[0.26em] text-[#7d8498]">Live state</div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-2xl border border-[#5b4713] bg-[#18140d] px-3 py-3">
                              <div className="text-[10px] uppercase tracking-[0.2em] text-[#8f7c4a]">King</div>
                              <div className="mt-2 text-sm font-semibold text-white">
                                {labelForPair(court, court.liveState.kingPairIdx)}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                              <div className="text-[10px] uppercase tracking-[0.2em] text-[#7d8498]">Challenger</div>
                              <div className="mt-2 text-sm font-semibold text-white">
                                {labelForPair(court, court.liveState.challengerPairIdx)}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 text-xs text-[#9aa1b3]">
                            Queue: {court.liveState.queueOrder.map((pairIdx) => labelForPair(court, pairIdx)).join(' · ') || '—'}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-4 rounded-[18px] border border-white/8 bg-[#10101a] p-3">
                        <div className="text-[10px] uppercase tracking-[0.26em] text-[#7d8498]">Standings</div>
                        <div className="mt-3 overflow-x-auto">
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
                                <tr key={`${court.courtId}-standing-${row.pairIdx}`} className="border-t border-white/6">
                                  <td className="py-2 pr-3 font-medium text-white">{labelForPair(court, row.pairIdx)}</td>
                                  <td className="py-2 px-2 text-center text-[#ffd24a]">{row.kingWins}</td>
                                  <td className="py-2 px-2 text-center">{row.takeovers}</td>
                                  <td className="py-2 pl-2 text-center">{row.gamesPlayed}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="mt-4">
                        <a
                          href={court.judgeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex rounded-full border border-[#5b4713] bg-[#ffd24a] px-4 py-2 text-sm font-semibold text-[#17130b] transition hover:bg-[#ffe07f]"
                        >
                          Открыть корт
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}

          {operatorState.finalResults?.length ? (
            <section className="rounded-[24px] border border-[#2d3144] bg-[linear-gradient(180deg,rgba(20,24,37,0.98),rgba(10,13,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">Finals</div>
              <h3 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">Итоговые зоны</h3>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {operatorState.finalResults.map((zone) => (
                  <div key={zone.zone} className="rounded-[18px] border border-white/8 bg-[#10101a] p-4">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">{zone.zoneLabel}</div>
                    <div className="mt-3 space-y-2">
                      {zone.pairs.map((pair) => (
                        <div
                          key={`${zone.zone}-${pair.position}-${pair.pairLabel}`}
                          className="rounded-2xl border border-[#5b4713] bg-[#18140d] px-3 py-2 text-sm font-semibold text-white"
                        >
                          #{pair.position} · {pair.pairLabel} · KP {pair.kingWins} · TO {pair.takeovers}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
