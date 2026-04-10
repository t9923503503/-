'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { SudyamBootstrapPayload } from '@/lib/sudyam-bootstrap';
import type { ThaiDrawPreview, ThaiR2SeedDraft, ThaiR2SeedZone } from '@/lib/thai-live/types';
import {
  ThaiOperatorPanel,
  type ThaiOperatorBootstrapPhase,
  type ThaiOperatorPanelActionName,
} from '@/components/thai-live/ThaiOperatorPanel';

function getErrorText(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

export function ThaiTournamentControlClient({ tournamentId }: { tournamentId: string }) {
  const id = String(tournamentId || '').trim();
  const [thaiLivePayload, setThaiLivePayload] = useState<SudyamBootstrapPayload | null>(null);
  const [thaiLivePhase, setThaiLivePhase] = useState<ThaiOperatorBootstrapPhase>('idle');
  const [thaiLiveMessage, setThaiLiveMessage] = useState<string | null>(null);
  const [thaiLiveLoading, setThaiLiveLoading] = useState(() => Boolean(String(tournamentId || '').trim()));
  const [thaiLivePendingAction, setThaiLivePendingAction] = useState<ThaiOperatorPanelActionName | null>(null);
  const [thaiDrawPreview, setThaiDrawPreview] = useState<ThaiDrawPreview | null>(null);
  const [thaiDrawPreviewLoading, setThaiDrawPreviewLoading] = useState(false);
  const [thaiR2SeedDraft, setThaiR2SeedDraft] = useState<ThaiR2SeedDraft | null>(null);
  const [thaiR2SeedLoading, setThaiR2SeedLoading] = useState(false);
  const [syncRatingLoading, setSyncRatingLoading] = useState(false);
  const [syncRatingMessage, setSyncRatingMessage] = useState<string | null>(null);
  const [finishCalendarLoading, setFinishCalendarLoading] = useState(false);
  const [finishCalendarMessage, setFinishCalendarMessage] = useState<string | null>(null);

  const resetThaiLiveState = useCallback(() => {
    setThaiLivePayload(null);
    setThaiLivePhase('idle');
    setThaiLiveMessage(null);
    setThaiLiveLoading(false);
    setThaiLivePendingAction(null);
    setThaiDrawPreview(null);
    setThaiDrawPreviewLoading(false);
    setThaiR2SeedDraft(null);
    setThaiR2SeedLoading(false);
  }, []);

  const loadThaiLive = useCallback(async () => {
    if (!id) {
      resetThaiLiveState();
      return;
    }
    setThaiLiveLoading(true);
    setThaiLiveMessage(null);
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(id)}/thai-live`, {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as SudyamBootstrapPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось загрузить Thai live state');
      }
      setThaiLivePayload(payload);
      setThaiLivePhase(payload.thaiJudgeBlockedReason ? 'blocked' : 'idle');
    } catch (error) {
      setThaiLivePhase('error');
      setThaiLiveMessage(getErrorText(error, 'Не удалось загрузить Thai live state'));
      setThaiLivePayload(null);
    } finally {
      setThaiLiveLoading(false);
    }
  }, [id, resetThaiLiveState]);

  useEffect(() => {
    void loadThaiLive();
  }, [loadThaiLive]);

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

    if (action === 'preview_draw') {
      setThaiDrawPreviewLoading(true);
    } else if (action === 'preview_r2_seed' || action === 'confirm_r2_seed') {
      setThaiR2SeedLoading(true);
    } else if (action !== 'bootstrap_r1') {
      setThaiLivePendingAction(action as ThaiOperatorPanelActionName);
    }

    if (action === 'bootstrap_r1') {
      setThaiLivePhase('bootstrapping');
    }
    setThaiLiveMessage(null);

    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(id)}/thai-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          seed: options?.seed,
          zones: options?.zones,
        }),
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
      setThaiLivePayload(result.payload);
      setThaiLivePhase(result.payload.thaiJudgeBlockedReason ? 'blocked' : 'idle');
      if (action === 'preview_draw') {
        setThaiDrawPreview(result.preview ?? null);
      } else if (action === 'bootstrap_r1' || action === 'reshuffle_r1') {
        setThaiDrawPreview(null);
      }
      if (action === 'preview_r2_seed') {
        setThaiR2SeedDraft(result.r2SeedDraft ?? null);
      } else if (action === 'confirm_r2_seed') {
        setThaiR2SeedDraft(null);
      }
    } catch (error) {
      setThaiLivePhase('error');
      setThaiLiveMessage(getErrorText(error, 'Thai action failed'));
    } finally {
      setThaiDrawPreviewLoading(false);
      setThaiR2SeedLoading(false);
      setThaiLivePendingAction(null);
    }
  }

  const rosterMode =
    thaiLivePayload &&
    String(thaiLivePayload.bootstrapState.settings.thaiRosterMode || '').trim().toLowerCase() === 'manual'
      ? 'manual'
      : 'random';

  const opState = thaiLivePayload?.thaiOperatorState;
  const hasFinishedRound = Boolean(
    opState?.rounds?.some((r) => r.roundStatus === 'finished'),
  );
  const canSyncToRating =
    Boolean(opState) &&
    (hasFinishedRound ||
      ['r1_finished', 'r2_finished'].includes(String(opState?.stage ?? '')));

  const tournamentRecordStatus = String(
    thaiLivePayload?.bootstrapState?.tournament?.status ?? '',
  ).toLowerCase();
  const hasR2InModel = Boolean(opState?.rounds?.some((r) => r.roundType === 'r2'));
  const playDoneForCalendar =
    Boolean(opState) &&
    (opState!.stage === 'r2_finished' ||
      (opState!.stage === 'r1_finished' && !hasR2InModel));
  const canMarkCalendarFinished =
    tournamentRecordStatus !== 'finished' && playDoneForCalendar;

  async function markTournamentFinishedInCalendar() {
    if (!id) return;
    setFinishCalendarLoading(true);
    setFinishCalendarMessage(null);
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
      setFinishCalendarMessage('Турнир отмечен как завершённый в календаре, Thai-итоги автоматически записаны в рейтинг и архив.');
      await loadThaiLive();
    } catch (error) {
      setFinishCalendarMessage(getErrorText(error, 'Ошибка'));
    } finally {
      setFinishCalendarLoading(false);
    }
  }

  async function syncThaiResultsToRating() {
    if (!id) return;
    setSyncRatingLoading(true);
    setSyncRatingMessage(null);
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
      setSyncRatingMessage(
        `Записано строк: ${data.inserted ?? 0} (раунд ${data.roundUsed ?? '—'}). Рейтинг и архив обновятся после обновления страницы.`,
      );
    } catch (error) {
      setSyncRatingMessage(getErrorText(error, 'Ошибка синхронизации'));
    } finally {
      setSyncRatingLoading(false);
    }
  }

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
            disabled={finishCalendarLoading}
            onClick={() => void markTournamentFinishedInCalendar()}
            className="mt-3 rounded-lg border border-sky-400/45 bg-sky-500/20 px-4 py-2 text-sm font-medium text-sky-50 hover:bg-sky-500/30 disabled:opacity-50"
          >
            {finishCalendarLoading ? 'Сохраняем…' : 'Завершить турнир в календаре'}
          </button>
          {finishCalendarMessage ? (
            <p
              className={`mt-2 text-xs ${
                finishCalendarMessage.includes('завершён') ? 'text-emerald-200' : 'text-red-200'
              }`}
            >
              {finishCalendarMessage}
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
            disabled={syncRatingLoading}
            onClick={() => void syncThaiResultsToRating()}
            className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-50 hover:bg-amber-500/25 disabled:opacity-50"
          >
            {syncRatingLoading ? 'Запись…' : 'Пересчитать Thai в рейтинг / архив'}
          </button>
          {syncRatingMessage ? (
            <p
              className={`mt-2 text-xs ${syncRatingMessage.includes('Записано') ? 'text-emerald-200' : 'text-red-200'}`}
            >
              {syncRatingMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      {thaiLivePayload ? null : !thaiLiveLoading && thaiLiveMessage ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{thaiLiveMessage}</div>
      ) : null}
    </div>
  );
}
