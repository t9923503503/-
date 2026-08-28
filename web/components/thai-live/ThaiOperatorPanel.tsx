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
import { ThaiInlineActionConfirm } from '@/components/thai-live/ThaiInlineActionConfirm';
import { ThaiR2SeedEditor } from '@/components/thai-live/ThaiR2SeedEditor';
import { ThaiStandingsTable } from '@/components/thai-live/ThaiStandingsTable';

export const THAI_OPERATOR_RELEASE_GUARD = 'LPVOLLEY_THAI_OPERATOR_V2_ONLY_20260810';

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

function formatThaiStatusLabel(status: string | undefined): string {
  switch (String(status || '').trim().toLowerCase()) {
    case 'pending':
      return '\u041e\u0436\u0438\u0434\u0430\u0435\u0442';
    case 'live':
      return '\u0438\u0434\u0451\u0442';
    case 'confirmed':
    case 'finished':
      return '\u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043d';
    case 'cancelled':
      return '\u043e\u0442\u043c\u0435\u043d\u0451\u043d';
    default:
      return status || '\u2014';
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

function findActiveThaiJudgeUrl(data: SudyamBootstrapPayload): string | null {
  const operatorState = data.thaiOperatorState;
  const activeRound =
    operatorState?.rounds.find((round) => round.roundStatus === 'live') ??
    operatorState?.rounds.find((round) => round.roundStatus === 'pending') ??
    operatorState?.rounds.find((round) => round.roundStatus === 'finished');
  const activeCourt =
    activeRound?.courts.find((court) => court.currentTourStatus === 'pending') ??
    activeRound?.courts.find((court) => court.currentTourStatus === 'confirmed') ??
    activeRound?.courts[0];

  return activeCourt?.judgeUrl || data.thaiJudgeState?.courts[0]?.judgeUrl || null;
}

const RESHUFFLE_R1_CONFIRM_MESSAGE =
  'Перемешать R1 — это полный сброс жеребьёвки и составов на кортах (новый seed).\n\n' +
  'Делайте это только если ни один тур ещё не подтверждён судьями.\n\n' +
  'Продолжить?';

const FINISH_R1_CONFIRM_MESSAGE =
  'Завершить R1?\n\n' +
  'Все туры R1 будут закрыты. Это действие нельзя отменить.\n\n' +
  'Продолжить?';

const FINISH_R2_CONFIRM_MESSAGE =
  'Завершить R2?\n\n' +
  'Турнир будет завершён в судейской системе. Это действие нельзя отменить.\n\n' +
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
    anyLoading: boolean;
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
  const judgeModule = 'Next';
  const blockedReason = String(data.thaiJudgeBlockedReason || '').trim();
  const isNextModule = data.thaiJudgeModule === 'next';
  const tournamentStatusKey = String(data.bootstrapState?.tournament?.status || '').trim().toLowerCase();
  const isFinishedTournamentRecord = tournamentStatusKey === 'finished';
  const isReady =
    isNextModule &&
    Boolean(judgeState) &&
    Boolean(operatorState) &&
    (!blockedReason || isFinishedTournamentRecord);
  const thaiJudgeHref = findActiveThaiJudgeUrl(data);
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
  const progressRound =
    operatorState?.rounds.find((round) => round.roundStatus === 'live') ??
    operatorState?.rounds.find((round) => round.roundStatus === 'pending') ??
    operatorState?.rounds.at(-1);
  const progressMatches = progressRound?.courts.flatMap((court) => court.tours.flatMap((tour) => tour.matches)) ?? [];
  const confirmedMatches = progressMatches.filter((match) => match.status === 'confirmed').length;
  const remainingMatches = Math.max(0, progressMatches.length - confirmedMatches);
  const stageKey = operatorState?.stage ?? 'setup';
  const stageSteps = [
    { key: 'setup', label: 'Подготовка', done: stageKey !== 'setup', current: stageKey === 'setup' },
    {
      key: 'r1',
      label: 'R1',
      done: stageKey === 'r1_finished' || stageKey === 'r2_live' || stageKey === 'r2_finished',
      current: stageKey === 'r1_live',
    },
    {
      key: 'r2',
      label: 'R2',
      done: stageKey === 'r2_finished',
      current: stageKey === 'r1_finished' || stageKey === 'r2_live',
    },
    { key: 'finish', label: 'Финиш', done: stageKey === 'r2_finished', current: stageKey === 'r2_finished' },
  ];
  const currentStatusText = isBootstrapPending
    ? 'Подготовьте первый раунд и судейские корты.'
    : operatorState?.canFinishR1
      ? 'Все матчи R1 подтверждены. Раунд можно завершать.'
      : operatorState?.canSeedR2
        ? 'R1 завершён. Проверьте посев и подготовьте R2.'
        : operatorState?.canFinishR2
          ? 'Все матчи R2 подтверждены. Турнир можно завершать.'
          : progressRound
            ? `${progressRound.roundType.toUpperCase()} · ${remainingMatches > 0 ? `осталось подтвердить ${remainingMatches} матч(а)` : 'результаты подтверждены'}`
            : 'Турнир готов к работе.';
  const bootstrapMessage =
    bootstrap.message ||
    (bootstrap.phase === 'bootstrapping'
      ? 'Готовим судейские корты Thai...'
      : isBootstrapPending
        ? isManualRosterMode
          ? 'Ручная расстановка R1 готова. Запустите R1, когда слоты кортов заполнены.'
          : 'У турнира еще нет подготовленного состояния Thai Next.'
        : null);

  return (
    <div data-judge-ui-release={THAI_OPERATOR_RELEASE_GUARD} className="space-y-4">
      <section className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(21,18,33,0.98),rgba(12,12,24,0.98))] px-4 py-4 shadow-[0_24px_70px_rgba(0,0,0,0.34)] sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#9a8452]">Thai · управление</div>
            <h2 className="mt-1 text-xl font-black leading-tight text-white sm:text-2xl">
              {data.title || title}
            </h2>
            <details className="mt-2 max-w-2xl text-xs text-[#c7cada]/72">
              <summary className="cursor-pointer text-[#aeb6c8]">Как работает этот этап</summary>
              <p className="mt-2 leading-5">{subtitle}</p>
            </details>
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

        <nav aria-label="Этап турнира" className="mt-4 grid grid-cols-4 gap-1">
          {stageSteps.map((step) => (
            <div
              key={step.key}
              className={`flex min-h-9 items-center justify-center rounded-xl border px-1.5 text-center text-[9px] font-bold uppercase tracking-[0.06em] sm:text-[10px] ${
                step.current
                  ? 'border-[#ffd24a] bg-[#ffd24a]/15 text-[#ffe47a]'
                  : step.done
                    ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
                    : 'border-white/8 bg-white/[0.03] text-white/35'
              }`}
            >
              {step.label}
            </div>
          ))}
        </nav>

        <div className="mt-3 rounded-[20px] border border-[#ffd24a]/25 bg-[#17130b]/92 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ffd24a]">Сейчас</div>
          <p className="mt-1 text-sm font-semibold leading-5 text-white">{currentStatusText}</p>
          <div className="sticky bottom-[4.75rem] z-20 mt-3 rounded-[18px] bg-[#17130b]/95 backdrop-blur md:static md:bg-transparent">
            {isBootstrapPending && isManualRosterMode ? (
              <button type="button" onClick={() => bootstrap.onConfirmPreview()} disabled={bootstrap.phase === 'bootstrapping'} className="flex min-h-14 w-full items-center justify-center rounded-2xl border border-[#5b4713] bg-[#ffd24a] px-5 py-3 text-base font-black text-[#17130b] disabled:opacity-50">
                {bootstrap.phase === 'bootstrapping' ? 'Запускаем R1…' : 'Запустить R1'}
              </button>
            ) : isBootstrapPending ? (
              <button type="button" onClick={bootstrap.onOpenPreview} disabled={bootstrap.drawPreviewLoading} className="flex min-h-14 w-full items-center justify-center rounded-2xl border border-[#5b4713] bg-[#ffd24a] px-5 py-3 text-base font-black text-[#17130b] disabled:opacity-50">
                {bootstrap.drawPreviewLoading ? 'Готовим жеребьёвку…' : 'Подготовить жеребьёвку R1'}
              </button>
            ) : operatorState?.canFinishR1 ? (
              <ThaiInlineActionConfirm label="Завершить R1" armedLabel="Подтвердить завершение R1" description={FINISH_R1_CONFIRM_MESSAGE} onConfirm={() => actions.onAction('finish_r1')} disabled={actions.anyLoading} busy={actions.pendingAction === 'finish_r1'} tone="danger" className="min-h-14 w-full justify-center text-base font-black" />
            ) : operatorState?.canSeedR2 ? (
              <button type="button" onClick={actions.onOpenR2Seed} disabled={actions.anyLoading} className="flex min-h-14 w-full items-center justify-center rounded-2xl border border-[#5b4713] bg-[#ffd24a] px-5 py-3 text-base font-black text-[#17130b] disabled:opacity-50">
                {actions.r2SeedLoading ? 'Готовим R2…' : 'Подготовить R2'}
              </button>
            ) : operatorState?.canFinishR2 ? (
              <ThaiInlineActionConfirm label="Завершить R2" armedLabel="Подтвердить завершение R2" description={FINISH_R2_CONFIRM_MESSAGE} onConfirm={() => actions.onAction('finish_r2')} disabled={actions.anyLoading} busy={actions.pendingAction === 'finish_r2'} tone="danger" className="min-h-14 w-full justify-center text-base font-black" />
            ) : thaiJudgeHref ? (
              <a href={thaiJudgeHref} target="_blank" rel="noopener noreferrer" className="flex min-h-14 w-full items-center justify-center rounded-2xl border border-[#5b4713] bg-[#ffd24a] px-5 py-3 text-base font-black text-[#17130b]">
                Открыть активный корт
              </a>
            ) : (
              <button type="button" onClick={bootstrap.onRefresh} className="flex min-h-14 w-full items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-base font-black text-white">
                Обновить состояние
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
          {progressRound ? (
            <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">Прогресс матчей</div>
              <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">
                {confirmedMatches}/{progressMatches.length}
              </div>
            </div>
          ) : null}
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
          <details className="mt-3 rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-[#aeb6c8]">
            <summary className="cursor-pointer font-semibold">Параметры состава и туров</summary>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <span>Туров: {tourCountLabel}</span>
              <span>Roster: {operatorState.rosterTotal}</span>
              <span>{formatThaiPoolLabel(variant, 0)}: {operatorState.rosterPrimaryCount}</span>
              {(variant === 'MF' || variant === 'MN') ? <span>{formatThaiPoolLabel(variant, 1)}: {operatorState.rosterSecondaryCount}</span> : null}
            </div>
          </details>
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
          {thaiTournamentHref && (isReady || !isNextModule) ? (
            <a
              href={thaiTournamentHref ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-full border border-[#5b4713] bg-[#ffd24a] px-4 py-2 text-sm font-semibold text-[#17130b] transition hover:bg-[#ffe07f]"
            >
              {isNextModule ? 'Открыть турнир' : 'Open Thai legacy'}
            </a>
          ) : null}
          {isReady && isNextModule && thaiJudgeHref ? (
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
              Повторить запуск
            </button>
          ) : null}
        </div>

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
            <details
              key={round.roundId}
              id={`thai-round-${round.roundType}`}
              open={round.roundStatus !== 'finished'}
              className="group scroll-mt-24 space-y-3"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
                <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">
                    {round.roundType.toUpperCase()} • {formatThaiStatusLabel(round.roundStatus)}
                  </h2>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-[#7d8498]">
                    {round.currentTourNo}/{round.tourCount} тур
                  </div>
                </div>
                </div>
                {round.roundType === 'r1' && round.roundStatus === 'finished' ? (
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/75 group-open:hidden">
                    Открыть R1
                  </span>
                ) : null}
              </summary>

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
                    <details
                      key={court.courtId}
                      id={`thai-court-${round.roundType}-${court.courtNo}`}
                      open={court.currentTourStatus !== 'finished'}
                      className="scroll-mt-24 rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.26)]"
                    >
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 marker:hidden [&::-webkit-details-marker]:hidden">
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
                              {formatThaiStatusLabel(court.currentTourStatus)}
                            </span>
                          </div>
                        </div>
                        {court.currentTourStatus === 'finished' ? (
                          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
                            Результаты
                          </span>
                        ) : (
                          <img
                            src={qrDataUrl}
                            alt={`QR for court ${court.label}`}
                            className="h-16 w-16 rounded-xl border border-[#2e2a1d] bg-white p-1.5 sm:h-20 sm:w-20 sm:rounded-2xl sm:p-2"
                          />
                        )}
                      </summary>

                      <details className="mt-3 rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-2">
                        <summary className="cursor-pointer text-xs font-semibold text-[#aeb6c8]">
                          Состав корта · {court.playerNames.length} игроков
                        </summary>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {court.playerNames.map((name) => (
                            <div
                              key={`${court.courtId}-${name}`}
                              className="min-w-0 truncate rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-sm font-medium text-white/88"
                            >
                              {name}
                            </div>
                          ))}
                        </div>
                      </details>

                      <div className="mt-4 rounded-[18px] border border-white/8 bg-[#10101a] p-3">
                        <div className="text-[10px] uppercase tracking-[0.26em] text-[#7d8498]">Туры</div>
                        <div className="mt-3 space-y-2">
                          {court.tours.map((tour) => (
                            <div key={tour.tourId} className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">Тур {tour.tourNo}</div>
                                <div className="text-[10px] uppercase tracking-[0.24em] text-[#aeb6c8]">{formatThaiStatusLabel(tour.status)}</div>
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
                                  canConfirmPending={tour.status === 'pending' && tour.tourNo === court.currentTourNo}
                                  onSaved={bootstrap.onRefresh}
                                />
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>

                      <ThaiStandingsTable className="mt-4" groups={court.standingsGroups} tourCount={round.tourCount} />

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
                    </details>
                  );
                })}
              </div>

              {round.roundType === 'r1' && operatorState.canReshuffleR1 ? (
                <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-[#7d8498]">
                    Перемешивание только до первых подтверждённых туров; сбрасывает пары на всех кортах R1.
                  </p>
                  <ThaiInlineActionConfirm
                    label="Перемешать R1"
                    armedLabel="Подтвердить reshuffle"
                    description={RESHUFFLE_R1_CONFIRM_MESSAGE}
                    onConfirm={() => actions.onAction('reshuffle_r1')}
                    disabled={actions.anyLoading}
                    busy={actions.pendingAction === 'reshuffle_r1'}
                    tone="warn"
                  />
                </div>
              ) : null}
            </details>
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
