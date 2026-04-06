'use client';

import type { SudyamBootstrapPayload } from '@/lib/sudyam-bootstrap';
import { makeQrDataUrl } from '@/public/shared/qr-gen.js';
import { resolveAbsoluteJudgeUrl } from '@/lib/thai-ui-helpers';
import type {
  ThaiDrawPreview,
  ThaiOperatorActionName,
  ThaiR2SeedDraft,
  ThaiR2SeedZone,
} from '@/lib/thai-live/types';
import { ThaiConfirmedTourScoreEditor } from '@/components/thai-live/ThaiConfirmedTourScoreEditor';
import { ThaiDrawPreview as ThaiDrawPreviewPanel } from '@/components/thai-live/ThaiDrawPreview';
import { ThaiR2SeedEditor } from '@/components/thai-live/ThaiR2SeedEditor';

export type ThaiOperatorBootstrapPhase = 'idle' | 'bootstrapping' | 'blocked' | 'error';
export type ThaiOperatorPanelActionName = Extract<ThaiOperatorActionName, 'reshuffle_r1' | 'finish_r1' | 'finish_r2'>;

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

function formatMetricValue(...values: unknown[]): string {
  for (const value of values) {
    if (value == null || value === '') continue;
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value);
  }
  return '-';
}

function buildThaiTournamentJudgeUrl(tournamentId: string): string {
  return `/court/tournament/${encodeURIComponent(tournamentId)}`;
}

const RESHUFFLE_R1_CONFIRM_MESSAGE =
  'Перемешать R1 — это полный сброс жеребьёвки и составов на кортах (новый seed).\n\n' +
  'Делайте это только если ни один тур ещё не подтверждён судьями.\n\n' +
  'Продолжить?';

export function ThaiOperatorPanel({
  data,
  bootstrap,
  actions,
  title = 'Thai Workspace',
  subtitle = 'Thai Next всегда играет 2 раунда по 4 тура. После завершения R1 система формирует R2-зоны по числу кортов: HARD, HARD/ADVANCE, HARD/ADVANCE/MEDIUM или полный HARD/ADVANCE/MEDIUM/LIGHT.',
}: {
  data: SudyamBootstrapPayload;
  bootstrap: {
    phase: ThaiOperatorBootstrapPhase;
    message: string | null;
    onRetry: () => void;
    onOpenPreview: () => void;
    drawPreview: ThaiDrawPreview | null;
    drawPreviewLoading: boolean;
    onConfirmPreview: (seed?: number) => void;
    onRefresh?: () => void;
  };
  actions: {
    pendingAction: ThaiOperatorPanelActionName | null;
    onAction: (action: ThaiOperatorPanelActionName) => void;
    r2SeedDraft: ThaiR2SeedDraft | null;
    r2SeedLoading: boolean;
    onOpenR2Seed: () => void;
    onConfirmR2Seed: (zones: ThaiR2SeedZone[]) => void;
  };
  title?: string;
  subtitle?: string;
}) {
  const variant = String(
    data.thaiJudgeState?.variant ?? data.thaiJudgeParams?.mode ?? data.bootstrapState.settings.thaiVariant ?? '',
  )
    .trim()
    .toUpperCase();
  const judgeState = data.thaiJudgeState;
  const operatorState = data.thaiOperatorState;
  const judgeModule = data.thaiJudgeModule === 'next' ? 'Next' : 'Legacy';
  const blockedReason = String(data.thaiJudgeBlockedReason || '').trim();
  const isNextModule = data.thaiJudgeModule === 'next';
  const tournamentStatusKey = String(data.bootstrapState?.tournament?.status || '').trim().toLowerCase();
  const isFinishedTournamentRecord = tournamentStatusKey === 'finished';
  const isReady =
    isNextModule &&
    Boolean(judgeState) &&
    Boolean(operatorState) &&
    (!blockedReason || isFinishedTournamentRecord);
  const thaiJudgeHref = judgeState?.courts[0]?.judgeUrl || data.thaiJudgeLegacyUrl || '#';
  const thaiTournamentHref = isNextModule ? buildThaiTournamentJudgeUrl(data.tournamentId) : thaiJudgeHref;
  const isBootstrapPending = isNextModule && Boolean(data.thaiJudgeNeedsBootstrap) && !blockedReason;
  const rosterMode =
    String(data.bootstrapState.settings.thaiRosterMode || '').trim().toLowerCase() === 'random' ? 'random' : 'manual';
  const isManualRosterMode = rosterMode === 'manual';
  const variantLabel =
    variant === 'MF'
      ? 'M/W'
      : variant === 'MN'
        ? 'M/N'
        : variant === 'MM'
          ? 'M/M'
          : variant === 'WW'
            ? 'W/W'
            : variant || 'THAI';
  const courtCountLabel = formatMetricValue(
    judgeState?.courtCount,
    data.thaiJudgeParams?.courts,
    data.bootstrapState.settings.courts,
  );
  const tourCountLabel = formatMetricValue(
    judgeState?.tourCount,
    data.thaiJudgeParams?.tours,
    data.bootstrapState.settings.tours,
  );
  const bootstrapMessage =
    bootstrap.message ||
    (bootstrap.phase === 'bootstrapping'
      ? 'Preparing Thai judge courts...'
      : isBootstrapPending
        ? isManualRosterMode
          ? 'Manual R1 setup is ready. Start R1 when court slots are filled.'
          : 'This tournament has no materialized Thai Next state yet.'
        : null);

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(21,18,33,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.34em] text-[#9a8452]">Thai operator</div>
            <h2 className="mt-2 font-heading text-3xl uppercase tracking-[0.08em] text-[#ffd24a] sm:text-4xl">
              {title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#c7cada]/78">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#4a3d1b] bg-[#1b160d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ffd24a]">
              {variantLabel}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#aeb6c8]">
              {judgeModule}
            </span>
            {operatorState ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#aeb6c8]">
                {formatThaiStage(operatorState.stage)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Название</div>
            <div className="mt-2 text-sm font-semibold text-white">{data.title}</div>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Игроки</div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">
              {data.bootstrapState.participants.filter((participant) => !participant.isWaitlist).length}
            </div>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Корты</div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">{courtCountLabel}</div>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Туров</div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">{tourCountLabel}</div>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Лимит очков</div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">
              {operatorState &&
              typeof operatorState.pointLimitR1 === 'number' &&
              typeof operatorState.pointLimitR2 === 'number' &&
              operatorState.pointLimitR1 !== operatorState.pointLimitR2
                ? `R1 ${operatorState.pointLimitR1} · R2 ${operatorState.pointLimitR2}`
                : formatMetricValue(
                    operatorState?.pointLimitR1 ?? operatorState?.pointLimit,
                    data.bootstrapState.settings.thaiPointLimitR1 ??
                      data.bootstrapState.settings.thaiPointLimit,
                    15,
                  )}
            </div>
          </div>
        </div>

        {operatorState ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Roster</div>
              <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">{operatorState.rosterTotal}</div>
            </div>
            <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">{formatThaiPoolLabel(variant, 0)}</div>
              <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">{operatorState.rosterPrimaryCount}</div>
            </div>
            <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">
                {variant === 'MF' || variant === 'MN' ? formatThaiPoolLabel(variant, 1) : 'Статус'}
              </div>
              <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">
                {variant === 'MF' || variant === 'MN' ? operatorState.rosterSecondaryCount : formatThaiStage(operatorState.stage)}
              </div>
            </div>
          </div>
        ) : null}

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

        <div className="mt-4 flex flex-wrap gap-3">
          {isReady || !isNextModule ? (
            <a
              href={thaiTournamentHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-full border border-[#5b4713] bg-[#ffd24a] px-4 py-2 text-sm font-semibold text-[#17130b] transition hover:bg-[#ffe07f]"
            >
              {isNextModule ? 'Открыть турнир' : 'Open Thai legacy'}
            </a>
          ) : null}
          {isReady && isNextModule ? (
            <a
              href={thaiJudgeHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
            >
              Открыть активный корт
            </a>
          ) : null}
          {bootstrap.onRefresh ? (
            <button
              type="button"
              onClick={bootstrap.onRefresh}
              className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
            >
              Обновить
            </button>
          ) : null}
          {bootstrap.phase === 'error' ? (
            <button
              type="button"
              onClick={bootstrap.onRetry}
              className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
            >
              Retry bootstrap
            </button>
          ) : null}
          {isBootstrapPending && isManualRosterMode ? (
            <button
              type="button"
              onClick={() => bootstrap.onConfirmPreview()}
              disabled={bootstrap.phase === 'bootstrapping'}
              className="inline-flex rounded-full border border-[#5b4713] bg-[#ffd24a] px-4 py-2 text-sm font-semibold text-[#17130b] transition hover:bg-[#ffe07f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bootstrap.phase === 'bootstrapping' ? '\u0417\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u043C R1...' : '\u25B6 \u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C R1'}
            </button>
          ) : null}
          {isBootstrapPending && !isManualRosterMode ? (
            <button
              type="button"
              onClick={bootstrap.onOpenPreview}
              disabled={bootstrap.drawPreviewLoading}
              className="inline-flex rounded-full border border-[#5b4713] bg-[#ffd24a] px-4 py-2 text-sm font-semibold text-[#17130b] transition hover:bg-[#ffe07f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bootstrap.drawPreviewLoading ? 'Готовим жеребьёвку...' : '▶ Жеребьёвка R1'}
            </button>
          ) : null}
          {operatorState?.canFinishR1 ? (
            <button
              type="button"
              onClick={() => actions.onAction('finish_r1')}
              disabled={actions.pendingAction === 'finish_r1'}
              className="inline-flex rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-100 transition hover:border-red-300/50 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actions.pendingAction === 'finish_r1' ? 'Завершаем R1...' : '■ Завершить R1'}
            </button>
          ) : null}
          {operatorState?.canSeedR2 ? (
            <button
              type="button"
              onClick={actions.onOpenR2Seed}
              disabled={actions.r2SeedLoading}
              className="inline-flex rounded-full border border-[#5b4713] bg-[#ffd24a] px-4 py-2 text-sm font-semibold text-[#17130b] transition hover:bg-[#ffe07f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actions.r2SeedLoading ? 'Готовим R2...' : '▶ Запустить R2'}
            </button>
          ) : null}
          {operatorState?.canFinishR2 ? (
            <button
              type="button"
              onClick={() => actions.onAction('finish_r2')}
              disabled={actions.pendingAction === 'finish_r2'}
              className="inline-flex rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-100 transition hover:border-red-300/50 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actions.pendingAction === 'finish_r2' ? 'Завершаем R2...' : '■ Завершить R2'}
            </button>
          ) : null}
        </div>

        {isNextModule &&
        operatorState &&
        !isFinishedTournamentRecord &&
        (operatorState.stage === 'r2_finished' ||
          (operatorState.stage === 'r1_finished' &&
            !operatorState.rounds.some((r) => r.roundType === 'r2'))) ? (
          <div className="mt-3 rounded-[18px] border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm leading-relaxed text-sky-100/95">
            <span className="font-semibold text-sky-50">Календарь: </span>
            «Завершить R1/R2» закрывает только раунд в судейской системе. Чтобы на сайте турнир стал «завершённым», на
            странице{' '}
            <span className="whitespace-nowrap font-mono text-xs text-sky-200/90">/admin/tournaments/…/thai-live</span>{' '}
            нажмите «Завершить турнир в календаре» или в списке турниров выставьте статус «Завершён».
          </div>
        ) : null}

        {isReady && isNextModule && data.tournamentId ? (
          <div className="mt-4 rounded-[18px] border border-emerald-400/25 bg-emerald-500/10 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-emerald-200/90">Зрители</div>
            <a
              href={`/live/thai/${encodeURIComponent(data.tournamentId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex text-sm font-medium text-emerald-100 underline decoration-emerald-400/50 underline-offset-2 hover:text-white"
            >
              Публичное табло (без PIN и судейских ссылок)
            </a>
          </div>
        ) : null}
      </section>

      {isBootstrapPending && !isManualRosterMode ? (
        <ThaiDrawPreviewPanel
          preview={bootstrap.drawPreview}
          loading={bootstrap.drawPreviewLoading || bootstrap.phase === 'bootstrapping'}
          disabled={bootstrap.phase === 'blocked'}
          message={bootstrap.drawPreview ? null : 'Соберите dry-run жеребьёвку, затем подтвердите запуск R1.'}
          onShuffle={bootstrap.onOpenPreview}
          onConfirm={() => bootstrap.onConfirmPreview(bootstrap.drawPreview?.seed)}
        />
      ) : null}

      {operatorState?.canSeedR2 ? (
        <ThaiR2SeedEditor
          draft={actions.r2SeedDraft}
          loading={actions.r2SeedLoading}
          message={
            actions.r2SeedDraft
              ? null
              : 'Откройте автопосев, проверьте зоны R2 по итогам R1, при необходимости скорректируйте их и затем подтвердите запуск R2.'
          }
          onReload={actions.onOpenR2Seed}
          onConfirm={actions.onConfirmR2Seed}
        />
      ) : null}

      {isReady && judgeState && operatorState ? (
        <>
          {operatorState.rounds.map((round) => (
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
                {round.courts.map((court) => {
                  const qrDataUrl = makeQrDataUrl(
                    resolveAbsoluteJudgeUrl(court.judgeUrl, typeof window === 'undefined' ? '' : window.location.origin),
                    {
                      scale: 4,
                      margin: 1,
                      dark: '#17130b',
                      light: '#ffffff',
                    },
                  );
                  return (
                    <article
                      key={court.courtId}
                      className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.26)]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">
                            {round.roundType === 'r2' ? court.label : `Court ${court.label}`}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-[#4b3c15] bg-[#1b160d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ffd24a]">
                              PIN {court.pin}
                            </span>
                            <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#aeb6c8]">
                              Tour {court.currentTourNo}
                            </span>
                            <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#aeb6c8]">
                              {court.currentTourStatus}
                            </span>
                          </div>
                        </div>
                        <img
                          src={qrDataUrl}
                          alt={`QR for court ${court.label}`}
                          className="h-20 w-20 rounded-2xl border border-[#2e2a1d] bg-white p-2"
                        />
                      </div>

                      <div className="mt-4 grid gap-2">
                        {court.playerNames.map((name) => (
                          <div
                            key={`${court.courtId}-${name}`}
                            className="rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-sm font-medium text-white/88"
                          >
                            {name}
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
                              {isNextModule && data.tournamentId && operatorState ? (
                                <ThaiConfirmedTourScoreEditor
                                  tournamentId={data.tournamentId}
                                  roundType={round.roundType}
                                  pointLimit={
                                    round.roundType === 'r2' ? operatorState.pointLimitR2 : operatorState.pointLimitR1
                                  }
                                  tour={tour}
                                  onSaved={bootstrap.onRefresh}
                                />
                              ) : null}
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
                                      <td className="py-2 px-2 text-center">{row.totalDiff > 0 ? `+${row.totalDiff}` : row.totalDiff}</td>
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

              {round.roundType === 'r1' && operatorState.canReshuffleR1 ? (
                <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-[#7d8498]">
                    Перемешивание только до первых подтверждённых туров; сбрасывает пары на всех кортах R1.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined' && !window.confirm(RESHUFFLE_R1_CONFIRM_MESSAGE)) return;
                      actions.onAction('reshuffle_r1');
                    }}
                    disabled={actions.pendingAction === 'reshuffle_r1'}
                    className="inline-flex shrink-0 rounded-full border border-amber-500/35 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:border-amber-400/50 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actions.pendingAction === 'reshuffle_r1' ? 'Перемешиваем...' : 'Перемешать R1'}
                  </button>
                </div>
              ) : null}
            </section>
          ))}

          {operatorState.finalResults.length ? (
            <section className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">Finals</div>
              <h2 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">Итоговые зоны</h2>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {operatorState.finalResults.map((zone) => (
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
        </>
      ) : null}
    </div>
  );
}
