'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SudyamBootstrapPayload } from '@/lib/sudyam-bootstrap';
import type { KotcNextR2SeedZone } from '@/lib/kotc-next';
import { KotcNextOperatorPanel, type KotcNextOperatorBootstrapPhase } from './KotcNextOperatorPanel';

function getErrorText(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

export function KotcNextTournamentWorkspace({
  initialData,
}: {
  initialData: SudyamBootstrapPayload;
}) {
  const router = useRouter();
  const [activeData, setActiveData] = useState(initialData);
  const [phase, setPhase] = useState<KotcNextOperatorBootstrapPhase>(
    initialData.kotcJudgeBlockedReason ? 'blocked' : 'idle',
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    'preview_r2_seed' | 'confirm_r2_seed' | 'bootstrap_r2' | 'finish_r1' | 'finish_r2' | null
  >(null);
  const [r2SeedDraft, setR2SeedDraft] = useState<KotcNextR2SeedZone[] | null>(
    initialData.kotcOperatorState?.r2SeedDraft ?? null,
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
      | 'bootstrap_r2'
      | 'finish_r1'
      | 'finish_r2',
    options?: { zones?: KotcNextR2SeedZone[] },
  ) {
    if (!activeData.tournamentId) return;

    if (action === 'bootstrap_r1') {
      setPhase('bootstrapping');
    } else {
      setPendingAction(action);
      setR2SeedLoading(action === 'preview_r2_seed' || action === 'confirm_r2_seed' || action === 'bootstrap_r2');
    }
    setMessage(null);

    try {
      const response = await fetch('/api/sudyam/kotcn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: activeData.tournamentId,
          action,
          zones: options?.zones,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        payload?: SudyamBootstrapPayload;
        state?: SudyamBootstrapPayload['kotcOperatorState'];
        r2SeedDraft?: KotcNextR2SeedZone[];
      };
      if (!response.ok || !payload.payload) {
        throw new Error(payload.error || 'KOTC Next action failed');
      }

      setActiveData(payload.payload);
      setPhase(payload.payload.kotcJudgeBlockedReason ? 'blocked' : 'idle');
      if (action === 'preview_r2_seed') {
        setR2SeedDraft(payload.r2SeedDraft ?? null);
      } else if (action === 'confirm_r2_seed' || action === 'bootstrap_r2') {
        setR2SeedDraft(null);
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

  return (
    <KotcNextOperatorPanel
      data={activeData}
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
        r2SeedLoading,
        onAction: (action) => void runKotcAction(action),
        onOpenR2Seed: () => void runKotcAction('preview_r2_seed'),
        onConfirmR2Seed: (zones) => void runKotcAction('confirm_r2_seed', { zones }),
      }}
    />
  );
}
