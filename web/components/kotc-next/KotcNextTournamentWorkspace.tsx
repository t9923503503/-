'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SudyamBootstrapPayload } from '@/lib/sudyam-bootstrap';
import type { KotcNextR2ManualZone, KotcNextR2SeedZone } from '@/lib/kotc-next/types';
import { KotcNextOperatorPanel, type KotcNextOperatorBootstrapPhase } from './KotcNextOperatorPanel';

function getErrorText(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

export function KotcNextTournamentWorkspace({
  initialData,
  cockpitV3Enabled,
}: {
  initialData: SudyamBootstrapPayload;
  cockpitV3Enabled: boolean;
}) {
  const router = useRouter();
  const [activeData, setActiveData] = useState(initialData);
  const [phase, setPhase] = useState<KotcNextOperatorBootstrapPhase>(
    initialData.kotcJudgeBlockedReason ? 'blocked' : 'idle',
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    | 'preview_r2_seed'
    | 'confirm_r2_seed'
    | 'preview_manual_r2'
    | 'confirm_manual_r2'
    | 'bootstrap_r2'
    | 'finish_r1'
    | 'finish_r2'
    | 'close_tournament'
    | 'reset_r2'
    | 'adjust_r1_pair_score'
    | 'adjust_r2_pair_score'
    | 'start_raund'
    | 'pause_raund'
    | 'resume_raund'
    | 'finish_raund'
    | 'set_remaining_time'
    | 'force_finish_round'
    | 'force_finish_all_rounds'
    | 'admin_reset'
    | null
  >(null);
  const [r2SeedDraft, setR2SeedDraft] = useState<KotcNextR2SeedZone[] | null>(
    initialData.kotcOperatorState?.r2SeedDraft ?? null,
  );
  const [manualR2Draft, setManualR2Draft] = useState<KotcNextR2ManualZone[] | null>(
    initialData.kotcOperatorState?.manualR2Draft ?? null,
  );
  const [r2SeedLoading, setR2SeedLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date>(() => new Date());
  const actionInProgressRef = useRef(false);

  useEffect(() => {
    setActiveData(initialData);
    setPhase(initialData.kotcJudgeBlockedReason ? 'blocked' : 'idle');
    setMessage(null);
    setPendingAction(null);
    setR2SeedDraft(initialData.kotcOperatorState?.r2SeedDraft ?? null);
    setManualR2Draft(initialData.kotcOperatorState?.manualR2Draft ?? null);
    setR2SeedLoading(false);
    setLastUpdatedAt(new Date());
  }, [initialData]);

  useEffect(() => {
    actionInProgressRef.current = phase === 'bootstrapping' || pendingAction !== null;
  }, [phase, pendingAction]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!actionInProgressRef.current) {
        startTransition(() => router.refresh());
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, [router]);

  async function runKotcAction(
    action:
      | 'bootstrap_r1'
      | 'preview_r2_seed'
      | 'confirm_r2_seed'
      | 'preview_manual_r2'
      | 'confirm_manual_r2'
      | 'bootstrap_r2'
      | 'finish_r1'
      | 'finish_r2'
      | 'close_tournament'
      | 'reset_r2'
      | 'adjust_r1_pair_score'
      | 'adjust_r2_pair_score',
    options?: { zones?: KotcNextR2SeedZone[]; manualDraft?: KotcNextR2ManualZone[]; courtNo?: number; raundNo?: number; pairIdx?: number; delta?: number },
  ) {
    if (!activeData.tournamentId) return;

    if (action === 'bootstrap_r1') {
      setPhase('bootstrapping');
    } else {
      setPendingAction(action);
      setR2SeedLoading(
        action === 'preview_r2_seed' ||
        action === 'confirm_r2_seed' ||
        action === 'preview_manual_r2' ||
        action === 'confirm_manual_r2' ||
        action === 'bootstrap_r2',
      );
    }
    setMessage(null);

    try {
      const useAdminRoute =
        Boolean(activeData.canAdminResetKotcNext || activeData.canAdminForceFinishKotcRound) ||
        action === 'close_tournament' ||
        action === 'preview_manual_r2' ||
        action === 'confirm_manual_r2' ||
        action === 'reset_r2' ||
        action === 'adjust_r2_pair_score';
      const isAdminOnlyAction =
        useAdminRoute;
      const response = await fetch(
        isAdminOnlyAction
          ? `/api/admin/tournaments/${encodeURIComponent(activeData.tournamentId)}/kotcn-action`
          : '/api/sudyam/kotcn',
        {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(isAdminOnlyAction ? {} : { tournamentId: activeData.tournamentId }),
            action,
            zones: options?.zones,
            manualDraft: options?.manualDraft,
            courtNo: options?.courtNo,
            raundNo: options?.raundNo,
            pairIdx: options?.pairIdx,
            delta: options?.delta,
          }),
        });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        payload?: SudyamBootstrapPayload;
        state?: SudyamBootstrapPayload['kotcOperatorState'];
        r2SeedDraft?: KotcNextR2SeedZone[];
        manualR2Draft?: KotcNextR2ManualZone[];
      };
      if (!response.ok || !payload.payload) {
        throw new Error(payload.error || 'KOTC Next action failed');
      }

      const nextData: SudyamBootstrapPayload = payload.state
        ? { ...payload.payload, kotcOperatorState: payload.state }
        : payload.payload;

      setActiveData(nextData);
      setPhase(nextData.kotcJudgeBlockedReason ? 'blocked' : 'idle');
      if (action === 'preview_r2_seed') {
        setR2SeedDraft(payload.r2SeedDraft ?? null);
      } else if (action === 'confirm_r2_seed' || action === 'bootstrap_r2' || action === 'reset_r2') {
        setR2SeedDraft(null);
      }
      if (action === 'preview_manual_r2') {
        setManualR2Draft(payload.manualR2Draft ?? null);
      } else if (action === 'confirm_manual_r2') {
        setManualR2Draft(payload.state?.manualR2Draft ?? payload.payload.kotcOperatorState?.manualR2Draft ?? null);
      } else if (action === 'reset_r2') {
        setManualR2Draft(null);
      }
      if (action === 'close_tournament') {
        setMessage('Турнир закрыт: результаты опубликованы в рейтинг и архив.');
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setPhase('error');
      setMessage(getErrorText(error, 'KOTC Next action failed'));
    } finally {
      setPendingAction(null);
      setR2SeedLoading(false);
      if (action === 'bootstrap_r1') {
        setPhase('idle');
      }
    }
  }

  async function runAdminReset(reason: string) {
    if (!activeData.tournamentId) return;
    setPendingAction('admin_reset');
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(activeData.tournamentId)}/reset-kotc-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        payload?: SudyamBootstrapPayload;
        state?: SudyamBootstrapPayload['kotcOperatorState'];
      };
      if (!response.ok || !payload.payload) {
        throw new Error(payload.error || 'KOTC Next reset failed');
      }
      const nextData: SudyamBootstrapPayload = payload.state
        ? { ...payload.payload, kotcOperatorState: payload.state }
        : payload.payload;
      setActiveData(nextData);
      setPhase(nextData.kotcJudgeBlockedReason ? 'blocked' : 'idle');
      setR2SeedDraft(null);
      setManualR2Draft(null);
      startTransition(() => router.refresh());
    } catch (error) {
      setPhase('error');
      setMessage(getErrorText(error, 'KOTC Next reset failed'));
    } finally {
      setPendingAction(null);
    }
  }

  async function runControlAction(
    action: 'start_raund' | 'pause_raund' | 'resume_raund' | 'finish_raund' | 'set_remaining_time' | 'force_finish_court' | 'force_finish_all',
    options: {
      roundNo?: number;
      courtNo?: number;
      raundNo?: number;
      reason?: string;
      acknowledgeOffline?: boolean;
      payload?: Record<string, unknown>;
    } = {},
  ) {
    if (!activeData.tournamentId || !activeData.kotcOperatorState) return;
    setPendingAction(action === 'force_finish_court' ? 'force_finish_round' : action === 'force_finish_all' ? 'force_finish_all_rounds' : action);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/tournaments/${encodeURIComponent(activeData.tournamentId)}/kotcn-control`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commandId: `kotcn-inline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            action,
            roundNo: options.roundNo,
            courtNo: options.courtNo,
            raundNo: options.raundNo,
            expectedRevision: activeData.kotcOperatorState.controlRevision,
            reason: options.reason,
            acknowledgeOffline: options.acknowledgeOffline,
            payload: options.payload,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        state?: SudyamBootstrapPayload['kotcOperatorState'];
        appliedAt?: string;
        affectedCourts?: number[];
      };
      if (!response.ok || !payload.state) {
        if (response.status === 409) {
          startTransition(() => router.refresh());
        }
        throw new Error(payload.error || 'KOTC Next control action failed');
      }
      setActiveData((prev) => ({
        ...prev,
        kotcOperatorState: payload.state ?? prev.kotcOperatorState,
      }));
      setPhase('idle');
      setLastUpdatedAt(new Date());
      const courts = payload.affectedCourts?.length ? ` Корты: ${payload.affectedCourts.join(', ')}.` : '';
      setMessage(`Команда применена.${courts}`);
    } catch (error) {
      setPhase('error');
      setMessage(getErrorText(error, 'KOTC Next control action failed'));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <KotcNextOperatorPanel
      data={activeData}
      cockpitV3Enabled={cockpitV3Enabled}
      bootstrap={{
        phase,
        message,
        lastUpdatedAt,
        onBootstrapR1: () => void runKotcAction('bootstrap_r1'),
        onRefresh: () => startTransition(() => router.refresh()),
      }}
      actions={{
        pendingAction,
        r2SeedDraft,
        manualR2Draft,
        r2SeedLoading,
        onAction: (action) => void runKotcAction(action),
        onAdjustR1PairScore: (courtNo, raundNo, pairIdx, delta) =>
          void runKotcAction('adjust_r1_pair_score', { courtNo, raundNo, pairIdx, delta }),
        onAdjustR2PairScore: (courtNo, raundNo, pairIdx, delta) =>
          void runKotcAction('adjust_r2_pair_score', { courtNo, raundNo, pairIdx, delta }),
        onOpenR2Seed: () => void runKotcAction('preview_r2_seed'),
        onConfirmR2Seed: (zones) => void runKotcAction('confirm_r2_seed', { zones }),
        onOpenManualR2: () => void runKotcAction('preview_manual_r2'),
        onConfirmManualR2: (manualDraft) => void runKotcAction('confirm_manual_r2', { manualDraft }),
        onResetR2: () => void runKotcAction('reset_r2'),
        onControlAction: (action, options) => void runControlAction(action, options),
        onSetRemainingTime: (roundNo, raundNo, remainingSeconds, reason) =>
          void runControlAction('set_remaining_time', {
            roundNo,
            raundNo,
            reason,
            payload: { remainingMs: Math.round(remainingSeconds * 1000) },
          }),
        onAdminReset: (reason) => void runAdminReset(reason),
        onAdminForceFinishAllRounds: (reason) => void runControlAction('force_finish_all', { reason }),
        onAdminForceFinishRound: (roundNo, courtNo, raundNo, reason) =>
          void runControlAction('force_finish_court', { roundNo, courtNo, raundNo, reason }),
      }}
      onReplacementChanged={(payload) => {
        if (payload) setActiveData(payload);
        startTransition(() => router.refresh());
      }}
    />
  );
}
