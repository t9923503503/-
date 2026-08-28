'use client';

import Link from 'next/link';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { SudyamBootstrapPayload } from '@/lib/sudyam-bootstrap';
import type {
  ThaiDrawPreview,
  ThaiOperatorStateSummary,
  ThaiR2SeedDraft,
  ThaiR2SeedZone,
} from '@/lib/thai-live/types';
import { ThaiInlineActionConfirm } from '@/components/thai-live/ThaiInlineActionConfirm';
import {
  ThaiOperatorPanel,
  type ThaiOperatorBootstrapPhase,
  type ThaiOperatorPanelActionName,
} from '@/components/thai-live/ThaiOperatorPanel';
import { ThaiPlayerReplacementPanel } from '@/components/thai-live/ThaiPlayerReplacementPanel';
import { getThaiErrorText } from '@/lib/thai-ui-helpers';
import TournamentControlMobileNav from '@/components/admin/TournamentControlMobileNav';

// ─── State ──────────────────────────────────────────────────────────────────

type ThaiClientState = {
  payload: SudyamBootstrapPayload | null;
  phase: ThaiOperatorBootstrapPhase;
  message: string | null;
  loading: boolean;
  pendingAction: ThaiOperatorPanelActionName | null;
  drawPreview: ThaiDrawPreview | null;
  drawPreviewLoading: boolean;
  r2SeedDraft: ThaiR2SeedDraft | null;
  r2SeedLoading: boolean;
  syncRating: { loading: boolean; message: string | null };
  finishCalendar: { loading: boolean; message: string | null };
  lastRefreshedAt: number | null;
  refreshError: string | null;
  actionError: string | null;
};

type ThaiClientAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_OK'; payload: SudyamBootstrapPayload }
  | { type: 'LOAD_ERROR'; message: string }
  | { type: 'SILENT_REFRESH_OK'; payload: SudyamBootstrapPayload }
  | { type: 'SILENT_REFRESH_ERROR'; message: string }
  | { type: 'THAI_ACTION_START'; name: string }
  | {
      type: 'THAI_ACTION_OK';
      payload: SudyamBootstrapPayload;
      preview?: ThaiDrawPreview | null;
      r2SeedDraft?: ThaiR2SeedDraft | null;
      actionName: string;
    }
  | { type: 'THAI_ACTION_ERROR'; name: string; message: string }
  | { type: 'SYNC_START' }
  | { type: 'SYNC_OK'; message: string }
  | { type: 'SYNC_ERROR'; message: string }
  | { type: 'CALENDAR_START' }
  | { type: 'CALENDAR_OK'; message: string }
  | { type: 'CALENDAR_ERROR'; message: string };

function phaseFromPayload(payload: SudyamBootstrapPayload): ThaiOperatorBootstrapPhase {
  return payload.thaiJudgeBlockedReason ? 'blocked' : 'idle';
}

function reducer(state: ThaiClientState, action: ThaiClientAction): ThaiClientState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, loading: true, message: null, actionError: null };
    case 'LOAD_OK':
      return {
        ...state,
        loading: false,
        payload: action.payload,
        phase: phaseFromPayload(action.payload),
        message: null,
        pendingAction: null,
        drawPreview: null,
        drawPreviewLoading: false,
        r2SeedDraft: null,
        r2SeedLoading: false,
        lastRefreshedAt: Date.now(),
        refreshError: null,
        actionError: null,
      };
    case 'SILENT_REFRESH_OK':
      return {
        ...state,
        payload: action.payload,
        phase: phaseFromPayload(action.payload),
        lastRefreshedAt: Date.now(),
        refreshError: null,
      };
    case 'SILENT_REFRESH_ERROR':
      return {
        ...state,
        refreshError: action.message,
      };
    case 'LOAD_ERROR':
      return {
        ...state,
        loading: false,
        payload: state.payload,
        phase: state.payload ? state.phase : 'error',
        message: state.payload ? state.message : action.message,
        refreshError: action.message,
      };
    case 'THAI_ACTION_START': {
      const name = action.name;
      return {
        ...state,
        message: null,
        actionError: null,
        phase: name === 'bootstrap_r1' ? 'bootstrapping' : state.phase,
        pendingAction:
          name === 'preview_draw' || name === 'preview_r2_seed' || name === 'confirm_r2_seed' || name === 'bootstrap_r1'
            ? state.pendingAction
            : (name as ThaiOperatorPanelActionName),
        drawPreviewLoading: name === 'preview_draw' ? true : state.drawPreviewLoading,
        r2SeedLoading: name === 'preview_r2_seed' || name === 'confirm_r2_seed' ? true : state.r2SeedLoading,
      };
    }
    case 'THAI_ACTION_OK': {
      const { payload, preview, r2SeedDraft, actionName } = action;
      return {
        ...state,
        payload,
        phase: phaseFromPayload(payload),
        pendingAction: null,
        drawPreviewLoading: false,
        r2SeedLoading: false,
        lastRefreshedAt: Date.now(),
        refreshError: null,
        actionError: null,
        drawPreview:
          actionName === 'preview_draw'
            ? (preview ?? null)
            : actionName === 'bootstrap_r1' || actionName === 'reshuffle_r1'
              ? null
              : state.drawPreview,
        r2SeedDraft:
          actionName === 'preview_r2_seed'
            ? (r2SeedDraft ?? null)
            : actionName === 'confirm_r2_seed'
              ? null
              : state.r2SeedDraft,
      };
    }
    case 'THAI_ACTION_ERROR':
      return {
        ...state,
        phase: action.name === 'bootstrap_r1' ? 'error' : state.phase,
        message: action.name === 'bootstrap_r1' ? action.message : state.message,
        actionError: action.message,
        pendingAction: null,
        drawPreviewLoading: false,
        r2SeedLoading: false,
      };
    case 'SYNC_START':
      return { ...state, syncRating: { loading: true, message: null } };
    case 'SYNC_OK':
      return { ...state, syncRating: { loading: false, message: action.message } };
    case 'SYNC_ERROR':
      return { ...state, syncRating: { loading: false, message: action.message } };
    case 'CALENDAR_START':
      return { ...state, finishCalendar: { loading: true, message: null } };
    case 'CALENDAR_OK':
      return { ...state, finishCalendar: { loading: false, message: action.message } };
    case 'CALENDAR_ERROR':
      return { ...state, finishCalendar: { loading: false, message: action.message } };
  }
}

function makeInitialState(initialPayload: SudyamBootstrapPayload | null): ThaiClientState {
  return {
    payload: initialPayload,
    phase: initialPayload ? phaseFromPayload(initialPayload) : 'idle',
    message: null,
    loading: false,
    pendingAction: null,
    drawPreview: null,
    drawPreviewLoading: false,
    r2SeedDraft: null,
    r2SeedLoading: false,
    syncRating: { loading: false, message: null },
    finishCalendar: { loading: false, message: null },
    lastRefreshedAt: initialPayload ? Date.now() : null,
    refreshError: null,
    actionError: null,
  };
}

const STALE_WARNING_MS = 25_000;
const THAI_LIVE_POLL_MS = 9_000;

// ─── Component ───────────────────────────────────────────────────────────────

function formatThaiChecklistStatus(status: string | undefined): string {
  switch (String(status || '').trim().toLowerCase()) {
    case 'done':
      return '\u0433\u043e\u0442\u043e\u0432\u043e';
    case 'pending':
      return '\u043e\u0436\u0438\u0434\u0430\u0435\u0442';
    case 'unavailable':
      return '\u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e';
    default:
      return status || '\u2014';
  }
}

type ThaiOperatorDashboard = {
  stageLabel: string;
  matchProgressLabel: string;
  confirmedMatches: number;
  totalMatches: number;
  currentRoundLabel: string;
  currentTourLabel: string;
  courtsNeedAction: number;
  nextActionLabel: string;
  attentionItems: Array<{ key: string; tone: 'danger' | 'warn' | 'info' | 'success'; title: string; detail: string }>;
};

function formatThaiOperatorStage(stage: string | undefined): string {
  switch (stage) {
    case 'r1_live':
      return 'R1 идет';
    case 'r1_finished':
      return 'R1 завершен';
    case 'r2_live':
      return 'R2 идет';
    case 'r2_finished':
      return 'R2 завершен';
    default:
      return 'Настройка';
  }
}

function buildThaiOperatorDashboard(
  opState: ThaiOperatorStateSummary | null | undefined,
  canSyncToRating: boolean,
  canMarkCalendarFinished: boolean,
  secAgo: number | null,
): ThaiOperatorDashboard | null {
  if (!opState) return null;

  let confirmedMatches = 0;
  let totalMatches = 0;
  const pendingCourts: string[] = [];
  const liveRound = opState.rounds.find((round) => round.roundStatus === 'live');
  const currentRound = liveRound ?? opState.rounds.find((round) => round.roundStatus === 'pending') ?? opState.rounds.at(-1);

  for (const round of opState.rounds) {
    for (const court of round.courts) {
      for (const tour of court.tours) {
        for (const match of tour.matches) {
          totalMatches += 1;
          if (match.status === 'confirmed') confirmedMatches += 1;
        }
      }
      if (round.roundStatus === 'live' && court.currentTourStatus === 'pending') {
        pendingCourts.push(`${round.roundType.toUpperCase()} ${court.label} · тур ${court.currentTourNo}`);
      }
    }
  }

  const attentionItems: ThaiOperatorDashboard['attentionItems'] = [];
  if (pendingCourts.length) {
    attentionItems.push({
      key: 'pending-courts',
      tone: 'warn',
      title: `Ждут подтверждения: ${pendingCourts.length}`,
      detail: pendingCourts.slice(0, 4).join(', '),
    });
  }
  if (opState.canFinishR1) {
    attentionItems.push({
      key: 'finish-r1',
      tone: 'success',
      title: 'R1 готов к закрытию',
      detail: 'Все условия выполнены, можно завершить первый раунд.',
    });
  }
  if (opState.canSeedR2) {
    attentionItems.push({
      key: 'seed-r2',
      tone: 'success',
      title: 'R2 готов к запуску',
      detail: 'Проверьте зоны автопосева и подтвердите старт R2.',
    });
  }
  if (opState.canFinishR2) {
    attentionItems.push({
      key: 'finish-r2',
      tone: 'success',
      title: 'R2 готов к закрытию',
      detail: 'Все туры R2 закрыты, можно завершить игровой этап.',
    });
  }
  if (canSyncToRating) {
    attentionItems.push({
      key: 'sync-rating',
      tone: 'info',
      title: 'Можно обновить рейтинг',
      detail: 'Суммарные итоги всех завершенных раундов доступны для записи в архив.',
    });
  }
  if (canMarkCalendarFinished) {
    attentionItems.push({
      key: 'finish-calendar',
      tone: 'info',
      title: 'Турнир готов к завершению',
      detail: 'Одно действие сохранит результаты и закроет турнир на сайте.',
    });
  }
  if (!attentionItems.length) {
    attentionItems.push({
      key: 'all-clear',
      tone: 'success',
      title: 'Критичных действий нет',
      detail: secAgo == null ? 'Ожидаем первый live-снимок.' : `Последний снимок: ${secAgo} сек назад.`,
    });
  }

  const nextActionLabel = opState.canFinishR1
    ? 'Завершить R1'
    : opState.canSeedR2
      ? 'Проверить R2 seed'
      : opState.canFinishR2
        ? 'Завершить R2'
        : canMarkCalendarFinished
          ? 'Завершить турнир'
          : canSyncToRating
            ? 'Синхронизировать рейтинг'
            : 'Следить за кортами';

  return {
    stageLabel: formatThaiOperatorStage(opState.stage),
    matchProgressLabel: `${confirmedMatches}/${totalMatches}`,
    confirmedMatches,
    totalMatches,
    currentRoundLabel: currentRound ? currentRound.roundType.toUpperCase() : '—',
    currentTourLabel: currentRound ? `${currentRound.currentTourNo}/${currentRound.tourCount}` : '—',
    courtsNeedAction: pendingCourts.length,
    nextActionLabel,
    attentionItems,
  };
}

export function ThaiTournamentControlClient({
  tournamentId,
  initialPayload = null,
}: {
  tournamentId: string;
  initialPayload?: SudyamBootstrapPayload | null;
}) {
  const id = String(tournamentId || '').trim();
  const [state, dispatch] = useReducer(reducer, initialPayload, makeInitialState);

  const {
    payload: thaiLivePayload,
    phase: thaiLivePhase,
    message: thaiLiveMessage,
    loading: thaiLiveLoading,
    pendingAction: thaiLivePendingAction,
    drawPreview: thaiDrawPreview,
    drawPreviewLoading: thaiDrawPreviewLoading,
    r2SeedDraft: thaiR2SeedDraft,
    r2SeedLoading: thaiR2SeedLoading,
    syncRating,
    finishCalendar,
    refreshError,
    actionError,
  } = state;

  const anyLoading =
    thaiLiveLoading ||
    thaiLivePendingAction !== null ||
    thaiDrawPreviewLoading ||
    thaiR2SeedLoading ||
    syncRating.loading ||
    finishCalendar.loading;
  const stateRef = useRef(state);
  stateRef.current = state;
  const loadInFlightRef = useRef(false);
  const silentRefreshInFlightRef = useRef(false);

  const loadThaiLive = useCallback(async () => {
    if (!id || loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    dispatch({ type: 'LOAD_START' });
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(id)}/thai-live`, {
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as SudyamBootstrapPayload & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Не удалось загрузить Thai live state');
      }
      dispatch({ type: 'LOAD_OK', payload: data });
    } catch (error) {
      dispatch({ type: 'LOAD_ERROR', message: getThaiErrorText(error, 'Не удалось загрузить Thai live state') });
    } finally {
      loadInFlightRef.current = false;
    }
  }, [id]);

  const silentRefreshThaiLive = useCallback(async () => {
    if (!id || loadInFlightRef.current || silentRefreshInFlightRef.current) return;
    silentRefreshInFlightRef.current = true;
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(id)}/thai-live`, {
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as SudyamBootstrapPayload & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Не удалось обновить Thai live state');
      }
      dispatch({ type: 'SILENT_REFRESH_OK', payload: data });
    } catch (error) {
      dispatch({
        type: 'SILENT_REFRESH_ERROR',
        message: getThaiErrorText(error, 'Не удалось обновить Thai live state'),
      });
    } finally {
      silentRefreshInFlightRef.current = false;
    }
  }, [id]);


  useEffect(() => {
    if (!initialPayload) {
      void loadThaiLive();
    }
  }, [initialPayload, loadThaiLive]);

  useEffect(() => {
    const tick = setInterval(() => {
      const current = stateRef.current;
      const busy =
        current.loading ||
        current.pendingAction !== null ||
        current.drawPreviewLoading ||
        current.r2SeedLoading ||
        current.syncRating.loading ||
        current.finishCalendar.loading;
      if (!current.payload || busy) return;
      void silentRefreshThaiLive();
    }, THAI_LIVE_POLL_MS);
    return () => clearInterval(tick);
  }, [silentRefreshThaiLive]);



  // Таймер "обновлено X сек назад"
  const [secAgo, setSecAgo] = useState<number | null>(null);
  useEffect(() => {
    const tick = setInterval(() => {
      const ts = stateRef.current.lastRefreshedAt;
      setSecAgo(ts ? Math.floor((Date.now() - ts) / 1000) : null);
    }, 5000);
    return () => clearInterval(tick);
  }, []);

  const printHref = `/admin/tournaments/${encodeURIComponent(id)}/schedule-print`;

  async function runThaiAdminAction(
    action:
      | 'bootstrap_r1'
      | 'preview_draw'
      | 'reshuffle_r1'
      | 'finish_r1'
      | 'preview_r2_seed'
      | 'confirm_r2_seed'
      | 'finish_r2',
    options?: { seed?: number; zones?: ThaiR2SeedZone[] },
  ) {
    if (!id) return;
    dispatch({ type: 'THAI_ACTION_START', name: action });
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(id)}/thai-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, seed: options?.seed, zones: options?.zones }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        payload?: SudyamBootstrapPayload;
        preview?: ThaiDrawPreview;
        r2SeedDraft?: ThaiR2SeedDraft;
      };
      if (!response.ok || !result.payload) {
        throw new Error(result.error || 'Thai action failed');
      }
      dispatch({
        type: 'THAI_ACTION_OK',
        payload: result.payload,
        preview: result.preview,
        r2SeedDraft: result.r2SeedDraft,
        actionName: action,
      });
    } catch (error) {
      dispatch({ type: 'THAI_ACTION_ERROR', name: action, message: getThaiErrorText(error, 'Thai action failed') });
    }
  }

  async function markTournamentFinishedInCalendar() {
    if (!id) return;
    dispatch({ type: 'CALENDAR_START' });
    try {
      const response = await fetch('/api/admin/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'tournament_status',
          tournamentId: id,
          status: 'finished',
          reason: 'Thai: раунды завершены, оператор закрыл турнир в календаре',
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Не удалось обновить статус');
      }
      dispatch({
        type: 'CALENDAR_OK',
        message: 'Турнир отмечен как завершённый в календаре, Thai-итоги автоматически записаны в рейтинг и архив.',
      });
      await loadThaiLive();
    } catch (error) {
      dispatch({ type: 'CALENDAR_ERROR', message: getThaiErrorText(error, 'Ошибка') });
    }
  }

  async function syncThaiResultsToRating() {
    if (!id) return;
    dispatch({ type: 'SYNC_START' });
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(id)}/sync-thai-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        inserted?: number;
        roundUsed?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || 'Не удалось записать итоги');
      }
      dispatch({
        type: 'SYNC_OK',
        message: `Записано строк: ${data.inserted ?? 0} (финальные места: ${data.roundUsed ?? '—'}, статистика: все завершённые раунды). Рейтинг и архив обновятся после обновления страницы.`,
      });
    } catch (error) {
      dispatch({ type: 'SYNC_ERROR', message: getThaiErrorText(error, 'Ошибка синхронизации') });
    }
  }

  const rosterMode =
    thaiLivePayload &&
    String(thaiLivePayload.bootstrapState.settings.thaiRosterMode || '').trim().toLowerCase() === 'manual'
      ? 'manual'
      : 'random';

  const opState = thaiLivePayload?.thaiOperatorState;
  const hasFinishedRound = Boolean(opState?.rounds?.some((r) => r.roundStatus === 'finished'));
  const canSyncToRating =
    Boolean(opState) &&
    (hasFinishedRound || ['r1_finished', 'r2_finished'].includes(String(opState?.stage ?? '')));

  const tournamentRecordStatus = String(
    thaiLivePayload?.bootstrapState?.tournament?.status ?? '',
  ).toLowerCase();
  const hasR2InModel = Boolean(opState?.rounds?.some((r) => r.roundType === 'r2'));
  const playDoneForCalendar =
    Boolean(opState) &&
    (opState!.stage === 'r2_finished' || (opState!.stage === 'r1_finished' && !hasR2InModel));
  const canMarkCalendarFinished = tournamentRecordStatus !== 'finished' && playDoneForCalendar;
  const staleMs = state.lastRefreshedAt ? Date.now() - state.lastRefreshedAt : null;
  const isStale = !anyLoading && staleMs !== null && staleMs > STALE_WARNING_MS;
  const checklist = thaiLivePayload?.thaiCompletionChecklist ?? null;
  const opsLog = thaiLivePayload?.thaiOpsLog ?? [];

  return (
    <div id="thai-live-overview" className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-4 px-3 pb-24 pt-3 sm:px-4 sm:pt-5 md:pb-6">
      <div className="flex items-center justify-between gap-3 px-1">
        <Link
          href="/admin/tournaments"
          className="text-xs font-semibold uppercase tracking-wider text-brand hover:text-brand/80"
        >
          ← Турниры
        </Link>
        <details className="relative text-right text-[11px] text-text-secondary">
          <summary className="cursor-pointer list-none rounded-full border border-white/10 bg-white/5 px-3 py-1.5 marker:hidden [&::-webkit-details-marker]:hidden">
            О турнире
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-white/10 bg-[#11111d] p-3 text-left shadow-xl">
            <div className="font-semibold text-white">Thai Tournament Control</div>
            <div className="mt-1 break-all">ID: {id}</div>
            <p className="mt-2 leading-4">После последнего раунда завершите турнир: результаты автоматически попадут в общий рейтинг и архив, а календарь обновится.</p>
          </div>
        </details>
      </div>

      {thaiLiveLoading && !thaiLivePayload ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-text-secondary">Загружаем…</div>
      ) : null}

      {secAgo !== null && secAgo > 0 && !thaiLiveLoading ? (
        <p className="-mt-2 text-right text-[11px] text-text-secondary/60">обновлено {secAgo} сек назад</p>
      ) : null}

      {refreshError && !thaiLiveLoading ? (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
          <div className="font-semibold">Не удалось обновить Thai live state</div>
          <div className="mt-1">{refreshError}</div>
          <button
            type="button"
            onClick={() => void loadThaiLive()}
            className="mt-3 rounded-lg border border-red-300/35 bg-red-500/20 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-red-50"
          >
            Повторить
          </button>
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="font-semibold">Не удалось выполнить действие Thai Live</div>
          <div className="mt-1">{actionError}</div>
        </div>
      ) : null}

      {isStale ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          Снимок Thai live устарел. Данные не обновлялись уже {Math.max(1, Math.floor((staleMs ?? 0) / 1000))} сек.
          <button
            type="button"
            onClick={() => void loadThaiLive()}
            className="ml-3 rounded-lg border border-amber-300/35 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-amber-50"
          >
            Обновить сейчас
          </button>
        </div>
      ) : null}

      {thaiLivePayload ? (
        <ThaiOperatorPanel
          data={thaiLivePayload}
          title="Thai Tournament Control"
          subtitle={
            rosterMode === 'manual'
              ? 'R1 из ручной расстановки по кортам; дальше — завершение R1, R2 и финиш.'
              : 'Жеребьёвка R1, завершение R1, R2 seed и финиш.'
          }
          bootstrap={{
            phase: thaiLivePhase,
            message: thaiLiveMessage,
            onRetry: () => void runThaiAdminAction('bootstrap_r1', { seed: thaiDrawPreview?.seed }),
            onOpenPreview: () =>
              void runThaiAdminAction('preview_draw', {
                seed: thaiDrawPreview ? thaiDrawPreview.seed + 1 : undefined,
              }),
            drawPreview: thaiDrawPreview,
            drawPreviewLoading: thaiDrawPreviewLoading || thaiLiveLoading,
            onConfirmPreview: (seed) => void runThaiAdminAction('bootstrap_r1', { seed }),
            onRefresh: () => void loadThaiLive(),
          }}
          actions={{
            pendingAction: thaiLivePendingAction,
            anyLoading,
            onAction: (action) => void runThaiAdminAction(action),
            r2SeedDraft: thaiR2SeedDraft,
            r2SeedLoading: thaiR2SeedLoading || thaiLiveLoading,
            onOpenR2Seed: () => void runThaiAdminAction('preview_r2_seed'),
            onConfirmR2Seed: (zones) => void runThaiAdminAction('confirm_r2_seed', { zones }),
          }}
        />
      ) : null}

      {thaiLivePayload ? (
        <ThaiPlayerReplacementPanel
          tournamentId={id}
          participants={thaiLivePayload.bootstrapState.participants}
          disabled={anyLoading}
          onChanged={loadThaiLive}
        />
      ) : null}

      <div id="thai-live-results" className="scroll-mt-24" />

      {checklist?.nextAction === 'mark_calendar_finished' && canMarkCalendarFinished ? (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
          <h2 className="text-sm font-semibold text-emerald-50">Турнир готов к завершению</h2>
          <p className="mt-1 text-xs text-emerald-100/75">Рейтинг, архив и календарь обновятся автоматически.</p>
          <div className="mt-3">
            <ThaiInlineActionConfirm
              label="Завершить турнир"
              armedLabel="Подтвердить завершение"
              description="Итоги будут автоматически записаны в рейтинг и архив, после чего турнир закроется в календаре и на сайте."
              onConfirm={() => void markTournamentFinishedInCalendar()}
              disabled={anyLoading}
              busy={finishCalendar.loading}
              tone="accent"
            />
          </div>
        </div>
      ) : null}

      {thaiLivePayload && tournamentRecordStatus === 'finished' && canSyncToRating ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h2 className="text-sm font-semibold text-amber-100">Рейтинг и архив</h2>
          <p className="mt-1 text-xs text-text-secondary">
            Итоги уже записываются автоматически при завершении турнира. Используйте эту кнопку только если после этого
            исправили счёт и хотите обновить рейтинг и архив повторно.
          </p>
          <div className="mt-3">
            <ThaiInlineActionConfirm
              label="Пересчитать Thai в рейтинг / архив"
              armedLabel="Подтвердить синхронизацию"
              description="Суммарные итоги R1 + R2 будут записаны в рейтинг и архив; финальные места останутся по R2."
              onConfirm={() => void syncThaiResultsToRating()}
              disabled={anyLoading}
              busy={syncRating.loading}
              tone="warn"
            />
          </div>
          {syncRating.message ? (
            <p
              className={`mt-2 text-xs ${syncRating.message.includes('Записано') ? 'text-emerald-200' : 'text-red-200'}`}
            >
              {syncRating.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {thaiLivePayload?.thaiOpsLog?.length ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-semibold text-white">Журнал Thai-операций</h2>
          <div className="mt-3 space-y-2">
            {opsLog.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-white">{entry.title}</div>
                  <div className="text-[11px] text-text-secondary/70">{entry.createdAt}</div>
                </div>
                <div className="mt-1 text-xs text-text-secondary">{entry.summary}</div>
                <div className="mt-2 text-[11px] text-text-secondary/70">
                  {entry.actorRole} · {entry.actorId}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {opState ? (
        <TournamentControlMobileNav
          format="THAI"
          overviewTargetId="thai-live-overview"
          resultsTargetId="thai-live-results"
          rounds={opState.rounds.map((round) => ({
            key: round.roundType,
            label: round.roundType.toUpperCase(),
            status: round.roundStatus,
            targetId: `thai-round-${round.roundType}`,
            active: round.roundStatus === 'live' || round.roundStatus === 'pending',
            courts: round.courts.map((court) => ({
              key: court.courtId,
              label: round.roundType === 'r2' ? court.label : `Корт ${court.label}`,
              status: `${court.currentTourStatus} · тур ${court.currentTourNo}`,
              targetId: `thai-court-${round.roundType}-${court.courtNo}`,
              judgeUrl: court.judgeUrl,
              active: round.roundStatus === 'live' && court.currentTourStatus === 'pending',
            })),
          }))}
          extras={[
            { href: `/live/thai/${encodeURIComponent(id)}`, label: 'Табло', note: 'Экран для зрителей', external: true },
            { href: printHref, label: 'Печать', note: 'Расписание R1/R2', external: true },
            { href: `/admin/tournaments/${encodeURIComponent(id)}/edit`, label: 'Настройки', note: 'Карточка турнира' },
            { href: '/admin/tournaments', label: 'Все турниры', note: 'Вернуться к списку' },
          ]}
        />
      ) : null}

      {!thaiLivePayload && !thaiLiveLoading ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          {thaiLiveMessage ? (
            <p className="text-sm text-red-200">{thaiLiveMessage}</p>
          ) : (
            <p className="text-sm text-text-secondary">Данные турнира недоступны.</p>
          )}
          <Link
            href="/admin/tournaments"
            className="mt-3 inline-block text-xs font-semibold uppercase tracking-wider text-brand hover:text-brand/80"
          >
            ← Вернуться к списку турниров
          </Link>
        </div>
      ) : null}
    </div>
  );
}
