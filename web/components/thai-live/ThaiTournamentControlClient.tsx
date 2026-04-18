'use client';

import Link from 'next/link';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { SudyamBootstrapPayload } from '@/lib/sudyam-bootstrap';
import type { ThaiDrawPreview, ThaiR2SeedDraft, ThaiR2SeedZone } from '@/lib/thai-live/types';
import {
  ThaiOperatorPanel,
  type ThaiOperatorBootstrapPhase,
  type ThaiOperatorPanelActionName,
} from '@/components/thai-live/ThaiOperatorPanel';
import { getThaiErrorText } from '@/lib/thai-ui-helpers';

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
};

type ThaiClientAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_OK'; payload: SudyamBootstrapPayload }
  | { type: 'LOAD_ERROR'; message: string }
  | { type: 'SILENT_REFRESH_OK'; payload: SudyamBootstrapPayload }
  | { type: 'THAI_ACTION_START'; name: string }
  | {
      type: 'THAI_ACTION_OK';
      payload: SudyamBootstrapPayload;
      preview?: ThaiDrawPreview | null;
      r2SeedDraft?: ThaiR2SeedDraft | null;
      actionName: string;
    }
  | { type: 'THAI_ACTION_ERROR'; message: string }
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
      return { ...state, loading: true, message: null };
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
      };
    case 'SILENT_REFRESH_OK':
      return {
        ...state,
        payload: action.payload,
        phase: phaseFromPayload(action.payload),
        lastRefreshedAt: Date.now(),
      };
    case 'LOAD_ERROR':
      return {
        ...state,
        loading: false,
        payload: null,
        phase: 'error',
        message: action.message,
      };
    case 'THAI_ACTION_START': {
      const name = action.name;
      return {
        ...state,
        message: null,
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
        phase: 'error',
        message: action.message,
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
  };
}

const POLL_INTERVAL_MS = 12_000;

function shouldPoll(state: ThaiClientState): boolean {
  if (!state.payload) return false;
  const stage = state.payload.thaiOperatorState?.stage;
  if (!stage) return false;
  const tournamentStatus = String(state.payload.bootstrapState?.tournament?.status ?? '').toLowerCase();
  if (tournamentStatus === 'finished') return false;
  return stage === 'r1_live' || stage === 'r2_live';
}

// ─── Component ───────────────────────────────────────────────────────────────

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
  } = state;

  const anyLoading =
    thaiLiveLoading ||
    thaiLivePendingAction !== null ||
    thaiDrawPreviewLoading ||
    thaiR2SeedLoading ||
    syncRating.loading ||
    finishCalendar.loading;

  const loadThaiLive = useCallback(async () => {
    if (!id) return;
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
    }
  }, [id]);

  const silentRefresh = useCallback(async () => {
    if (!id) return;
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(id)}/thai-live`, {
        cache: 'no-store',
      });
      if (!response.ok) return;
      const data = (await response.json().catch(() => null)) as SudyamBootstrapPayload | null;
      if (data) dispatch({ type: 'SILENT_REFRESH_OK', payload: data });
    } catch {
      // silent — не показываем ошибку фонового обновления
    }
  }, [id]);

  useEffect(() => {
    if (!initialPayload) {
      void loadThaiLive();
    }
  }, [initialPayload, loadThaiLive]);

  // Polling: каждые 12с пока идёт активный раунд
  const stateRef = useRef(state);
  stateRef.current = state;
  const anyLoadingRef = useRef(anyLoading);
  anyLoadingRef.current = anyLoading;

  useEffect(() => {
    const timer = setInterval(() => {
      if (!anyLoadingRef.current && shouldPoll(stateRef.current)) {
        void silentRefresh();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [silentRefresh]);

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
      dispatch({ type: 'THAI_ACTION_ERROR', message: getThaiErrorText(error, 'Thai action failed') });
    }
  }

  async function markTournamentFinishedInCalendar() {
    if (!id) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Завершить турнир в календаре?\n\nСтатус турнира будет изменён на «завершён» — это увидят участники на сайте.\n\nПродолжить?',
      )
    )
      return;
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
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Пересчитать Thai в рейтинг / архив?\n\nИтоги последнего завершённого раунда будут записаны в рейтинг и архив.\n\nПродолжить?',
      )
    )
      return;
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
        message: `Записано строк: ${data.inserted ?? 0} (раунд ${data.roundUsed ?? '—'}). Рейтинг и архив обновятся после обновления страницы.`,
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

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/tournaments"
            className="text-xs font-semibold uppercase tracking-wider text-brand hover:text-brand/80"
          >
            ← Турниры
          </Link>
          <h1 className="mt-2 text-xl font-bold text-white sm:text-2xl">Thai Tournament Control</h1>
          <p className="mt-1 text-sm text-text-secondary">Турнир ID: {id}</p>
          {thaiLivePayload?.thaiJudgeModule === 'next' && thaiLivePayload?.thaiOperatorState ? (
            <a
              href={`/live/thai/${encodeURIComponent(id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-medium text-sky-300 underline decoration-sky-400/40 underline-offset-2 hover:text-sky-200"
            >
              Ссылка для зрителей →
            </a>
          ) : null}
          <Link
            href={printHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100 hover:border-emerald-400/50 hover:bg-emerald-500/15"
          >
            Распечатать расписание R1/R2
            <span className="text-[10px] font-normal uppercase tracking-wide text-emerald-200/70">постер · П+Н</span>
          </Link>
          <p className="mt-3 max-w-xl text-xs text-text-secondary">
            Кнопки «Завершить R1» / «Завершить R2» закрывают раунд в судейской системе. Чтобы турнир стал «завершённым» в
            календаре и на карточке события, отдельно нажмите «Завершить турнир в календаре» ниже или выставьте статус
            «Завершён» в{' '}
            <Link href="/admin/tournaments" className="text-brand hover:underline">
              списке турниров
            </Link>
            . Для Thai Next в этот момент итоги последнего завершённого раунда автоматически попадут в общий рейтинг и архив.
          </p>
        </div>
      </div>

      {thaiLiveLoading && !thaiLivePayload ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-text-secondary">Загружаем…</div>
      ) : null}

      {secAgo !== null && secAgo > 0 && !thaiLiveLoading ? (
        <p className="text-right text-[11px] text-text-secondary/60">обновлено {secAgo} сек назад</p>
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

      {thaiLivePayload && canMarkCalendarFinished ? (
        <div className="rounded-xl border border-sky-500/35 bg-sky-500/10 p-4">
          <h2 className="text-sm font-semibold text-sky-100">Календарь и карточка турнира</h2>
          <p className="mt-1 text-xs text-text-secondary">
            Игровая часть Thai уже завершена (R2 или только R1 без второго раунда). Нажмите, чтобы в базе у турнира
            статус стал «завершён» — так это увидят участники на сайте.
          </p>
          <button
            type="button"
            disabled={anyLoading}
            onClick={() => void markTournamentFinishedInCalendar()}
            className="mt-3 rounded-lg border border-sky-400/45 bg-sky-500/20 px-4 py-2 text-sm font-medium text-sky-50 hover:bg-sky-500/30 disabled:opacity-50"
          >
            {finishCalendar.loading ? 'Сохраняем…' : 'Завершить турнир в календаре'}
          </button>
          {finishCalendar.message ? (
            <p
              className={`mt-2 text-xs ${
                finishCalendar.message.includes('завершён') ? 'text-emerald-200' : 'text-red-200'
              }`}
            >
              {finishCalendar.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {thaiLivePayload && canSyncToRating ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h2 className="text-sm font-semibold text-amber-100">Рейтинг и архив</h2>
          <p className="mt-1 text-xs text-text-secondary">
            Обычно Thai Next записывает итоги в общий рейтинг автоматически при переводе турнира в статус «завершён».
            Эта кнопка нужна для ручной пересинхронизации после корректировки счёта или если хотите подготовить таблицу
            результатов заранее по последнему завершённому раунду (R2, если он завершён, иначе R1).
          </p>
          <button
            type="button"
            disabled={anyLoading}
            onClick={() => void syncThaiResultsToRating()}
            className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-50 hover:bg-amber-500/25 disabled:opacity-50"
          >
            {syncRating.loading ? 'Запись…' : 'Пересчитать Thai в рейтинг / архив'}
          </button>
          {syncRating.message ? (
            <p
              className={`mt-2 text-xs ${syncRating.message.includes('Записано') ? 'text-emerald-200' : 'text-red-200'}`}
            >
              {syncRating.message}
            </p>
          ) : null}
        </div>
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
