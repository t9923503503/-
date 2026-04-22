'use client';

import Link from 'next/link';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { KotcNextJudgeSnapshot, KotcNextPairLiveState } from '@/lib/kotc-next';
import { useScreenWakeLock } from '@/components/kotc-live/wake-lock';

type JudgeAction = 'start' | 'king-point' | 'takeover' | 'undo' | 'finish' | 'reset';
type ManualSlot = 'king' | 'challenger';
type ManualDirection = 'prev' | 'next';
type PendingAction =
  | JudgeAction
  | 'manual-king-prev'
  | 'manual-king-next'
  | 'manual-challenger-prev'
  | 'manual-challenger-next';
type ToastTone = 'info' | 'success' | 'error';

interface ToastState {
  tone: ToastTone;
  message: string;
}

interface JudgeUiPrefs {
  showStandings: boolean;
  showArrowHelp: boolean;
  showScoreHistory: boolean;
}

type JudgeSound = 'score' | 'error';

function scheduleTone(
  context: AudioContext,
  {
    startAt,
    duration,
    frequency,
    endFrequency = frequency,
    gain,
    type,
  }: {
    startAt: number;
    duration: number;
    frequency: number;
    endFrequency?: number;
    gain: number;
    type: OscillatorType;
  },
) {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), startAt + duration);
  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.exponentialRampToValueAtTime(gain, startAt + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

function toneClasses(tone: ToastTone): string {
  if (tone === 'success') return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100';
  if (tone === 'error') return 'border-red-400/30 bg-red-500/15 text-red-100';
  return 'border-amber-400/30 bg-amber-500/15 text-amber-100';
}

function connectionClasses(online: boolean): string {
  return online
    ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100'
    : 'border-red-400/25 bg-red-500/15 text-red-100';
}

function roundTabClasses(active: boolean, available: boolean): string {
  if (active) return 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]';
  if (!available) return 'border-white/10 bg-white/5 text-white/28';
  return 'border-[#2a2a44] bg-[#161625] text-[#c6cad6] hover:border-[#5a5a8e]';
}

function courtTabClasses(active: boolean, available: boolean): string {
  if (active) return 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]';
  if (!available) return 'border-white/10 bg-white/5 text-white/28';
  return 'border-[#2a2a44] bg-[#1a1a2d] text-[#c6cad6] hover:border-[#5a5a8e]';
}

function formatVariant(variant: string): string {
  const normalized = String(variant || '').trim().toUpperCase();
  if (normalized === 'MM' || normalized === 'WW' || normalized === 'MN') return normalized;
  return 'MF';
}

function draftKey(pin: string): string {
  return `kotcn:judge:${String(pin || '').trim().toUpperCase()}`;
}

function uiPrefsKey(pin: string): string {
  return `kotcn:judge-ui:${String(pin || '').trim().toUpperCase()}`;
}

function vibrate(ms: number): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(ms);
  } catch {
    // ignore unsupported/blocked haptics
  }
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatTournamentMeta(snapshot: KotcNextJudgeSnapshot): string {
  const rawDate = String(snapshot.tournamentDate || '').trim();
  const rawTime = String(snapshot.tournamentTime || '').trim();
  const dateSource = rawTime ? `${rawDate}T${rawTime}` : rawDate;
  const parsed = new Date(dateSource);
  const hasDate = rawDate.length > 0;
  if (hasDate && Number.isFinite(parsed.getTime())) {
    const dateText = new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(parsed);
    const timeText = rawTime
      ? new Intl.DateTimeFormat('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        }).format(parsed)
      : '';
    return [snapshot.tournamentName, dateText, timeText].filter(Boolean).join(' · ');
  }
  return [snapshot.tournamentName, rawDate, rawTime.slice(0, 5)].filter(Boolean).join(' · ');
}

function getPairShortLabel(snapshot: KotcNextJudgeSnapshot, pairIdx: number): string {
  const pair = snapshot.pairs.find((item) => item.pairIdx === pairIdx) ?? null;
  if (!pair) return `#${pairIdx + 1}`;
  const names = [pair.primaryPlayer?.name || '', pair.secondaryPlayer?.name || '']
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => value.split(/\s+/)[0] || value)
    .map((value) => value.slice(0, 10));
  if (!names.length) return pair.label.slice(0, 18);
  return names.join(' / ');
}

function snapshotProgressScore(snapshot: KotcNextJudgeSnapshot): number {
  const aggregateStats = snapshot.liveState.pairs.reduce(
    (total, pair) => total + pair.kingWins + pair.takeovers + pair.gamesPlayed,
    0,
  );
  const statusScore =
    snapshot.liveState.status === 'running' ? 3 : snapshot.liveState.status === 'finished' ? 2 : 1;
  const startedAtScore = snapshot.liveState.timerStartedAt ? 1 : 0;
  return (
    snapshot.liveState.currentRaundNo * 1000 +
    aggregateStats * 10 +
    snapshot.liveState.queueOrder.length +
    statusScore +
    startedAtScore
  );
}

function readStoredDraft(pin: string): KotcNextJudgeSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(draftKey(pin));
    if (!raw) return null;
    return JSON.parse(raw) as KotcNextJudgeSnapshot;
  } catch {
    return null;
  }
}

function clearStoredDraft(pin: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(draftKey(pin));
  } catch {
    // ignore storage errors
  }
}

function shouldPreferLocalDraft(
  localSnapshot: KotcNextJudgeSnapshot | null,
  serverSnapshot: KotcNextJudgeSnapshot,
): localSnapshot is KotcNextJudgeSnapshot {
  if (!localSnapshot) return false;
  if (localSnapshot.pinCode !== serverSnapshot.pinCode) return false;
  if (localSnapshot.currentRaundInstanceKey !== serverSnapshot.currentRaundInstanceKey) return false;
  if (localSnapshot.liveState.status === 'finished') return false;
  if (localSnapshot.currentRaundRevision !== serverSnapshot.currentRaundRevision) {
    return localSnapshot.currentRaundRevision > serverSnapshot.currentRaundRevision;
  }
  return snapshotProgressScore(localSnapshot) > snapshotProgressScore(serverSnapshot);
}

function readUiPrefs(pin: string): JudgeUiPrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(uiPrefsKey(pin));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<JudgeUiPrefs> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      showStandings: parsed.showStandings !== false,
      showArrowHelp: parsed.showArrowHelp !== false,
      showScoreHistory: parsed.showScoreHistory !== false,
    };
  } catch {
    return null;
  }
}

function formatEventClock(playedAt: string): string {
  const parsed = new Date(playedAt);
  if (!Number.isFinite(parsed.getTime())) return '--:--:--';
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(parsed);
}

function pairLabel(snapshot: KotcNextJudgeSnapshot, pairIdx: number): string {
  return snapshot.pairs.find((pair) => pair.pairIdx === pairIdx)?.label ?? `Pair ${pairIdx + 1}`;
}

function pairStat(snapshot: KotcNextJudgeSnapshot, pairIdx: number): KotcNextPairLiveState | null {
  return snapshot.liveState.pairs.find((pair) => pair.pairIdx === pairIdx) ?? null;
}

function describeEvent(snapshot: KotcNextJudgeSnapshot, event: KotcNextJudgeSnapshot['currentEvents'][number]): string {
  const king = pairLabel(snapshot, event.kingPairIdx);
  const challenger = pairLabel(snapshot, event.challengerPairIdx);
  return event.eventType === 'takeover'
    ? `${challenger} забрал трон у ${king}`
    : `${king} взял очко против ${challenger}`;
}

function formatRoundType(roundType: string): string {
  return String(roundType || '').trim().toUpperCase() === 'R2' ? 'ТУР 2' : 'ТУР 1';
}

function formatRoundStatus(status: string): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'running') return 'LIVE';
  if (normalized === 'finished') return 'FINISH';
  return 'WAIT';
}

function formatCourtTabLabel(label: string, courtNo: number): string {
  return String(label || '').trim().toUpperCase() || `K${courtNo}`;
}

function manualActionKey(slot: ManualSlot, direction: ManualDirection): PendingAction {
  return `manual-${slot}-${direction}` as PendingAction;
}

async function requestJudgeAction(
  pin: string,
  raundNo: number,
  action: JudgeAction,
): Promise<KotcNextJudgeSnapshot> {
  const response = await fetch(
    `/api/kotc-next/judge/${encodeURIComponent(pin)}/raund/${raundNo}/${action}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    snapshot?: KotcNextJudgeSnapshot;
  };
  if (!response.ok || !payload.snapshot) {
    throw new Error(payload.error || 'KOTC Next judge action failed');
  }
  return payload.snapshot;
}

async function requestManualPairAction(
  pin: string,
  raundNo: number,
  slot: ManualSlot,
  direction: ManualDirection,
): Promise<KotcNextJudgeSnapshot> {
  const response = await fetch(
    `/api/kotc-next/judge/${encodeURIComponent(pin)}/raund/${raundNo}/manual-pair`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, direction }),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    snapshot?: KotcNextJudgeSnapshot;
  };
  if (!response.ok || !payload.snapshot) {
    throw new Error(payload.error || 'KOTC Next manual pair update failed');
  }
  return payload.snapshot;
}

async function requestResetRaundAction(
  pin: string,
  raundNo: number,
): Promise<KotcNextJudgeSnapshot> {
  const response = await fetch(
    `/api/kotc-next/judge/${encodeURIComponent(pin)}/raund/${raundNo}/reset`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    snapshot?: KotcNextJudgeSnapshot;
  };
  if (!response.ok || !payload.snapshot) {
    throw new Error(payload.error || 'KOTC Next judge reset failed');
  }
  return payload.snapshot;
}

function ManualArrowButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/20 text-xl font-black text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35 sm:h-12 sm:w-12 sm:text-2xl"
    >
      {label.includes('влево') ? '←' : '→'}
    </button>
  );
}

export function KotcNextJudgeScreen({
  initialSnapshot,
}: {
  initialSnapshot: KotcNextJudgeSnapshot;
}) {
  const router = useRouter();
  const audioContextRef = useRef<AudioContext | null>(null);
  const restoredDraftPinRef = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [submitting, setSubmitting] = useState<PendingAction | null>(null);
  const [online, setOnline] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [showStandings, setShowStandings] = useState(true);
  const [showArrowHelp, setShowArrowHelp] = useState(true);
  const [showScoreHistory, setShowScoreHistory] = useState(true);

  useScreenWakeLock(true);

  useEffect(() => {
    setSnapshot(initialSnapshot);
    setRestoredDraft(false);
  }, [initialSnapshot]);

  useEffect(() => {
    const prefs = readUiPrefs(initialSnapshot.pinCode);
    if (!prefs) return;
    setShowStandings(prefs.showStandings);
    setShowArrowHelp(prefs.showArrowHelp);
    setShowScoreHistory(prefs.showScoreHistory);
  }, [initialSnapshot.pinCode]);

  useEffect(() => {
    if (restoredDraftPinRef.current === initialSnapshot.pinCode) return;
    const localDraft = readStoredDraft(initialSnapshot.pinCode);
    if (!shouldPreferLocalDraft(localDraft, initialSnapshot)) return;

    restoredDraftPinRef.current = initialSnapshot.pinCode;
    setSnapshot(localDraft);
    setRestoredDraft(true);
    setToast({
      tone: 'info',
      message: 'Восстановлен локальный черновик судьи. Обновляем данные сервера…',
    });
    if (typeof window !== 'undefined' && window.navigator.onLine) {
      startTransition(() => router.refresh());
    }
  }, [initialSnapshot, router]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.add('judge-workspace');
    return () => {
      document.body.classList.remove('judge-workspace');
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncOnline = () => setOnline(window.navigator.onLine);
    syncOnline();
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (!context) return;
      void context.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const shouldDropDraft =
      snapshot.liveState.status === 'finished' ||
      (snapshot.liveState.status === 'pending' && snapshot.currentEvents.length === 0);

    if (shouldDropDraft) {
      clearStoredDraft(snapshot.pinCode);
      return;
    }

    window.localStorage.setItem(draftKey(snapshot.pinCode), JSON.stringify(snapshot));
  }, [snapshot]);

  useEffect(() => {
    if (!toast || typeof window === 'undefined') return;
    const timeoutId = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      uiPrefsKey(snapshot.pinCode),
      JSON.stringify({ showStandings, showArrowHelp, showScoreHistory } satisfies JudgeUiPrefs),
    );
  }, [showStandings, showArrowHelp, showScoreHistory, snapshot.pinCode]);

  const remainingMs = useMemo(() => {
    if (!snapshot.liveState.timerStartedAt) {
      return snapshot.liveState.timerMinutes * 60 * 1000;
    }
    const startedAt = new Date(snapshot.liveState.timerStartedAt).getTime();
    if (!Number.isFinite(startedAt)) {
      return snapshot.liveState.timerMinutes * 60 * 1000;
    }
    return Math.max(0, startedAt + snapshot.liveState.timerMinutes * 60 * 1000 - nowTs);
  }, [snapshot.liveState.timerMinutes, snapshot.liveState.timerStartedAt, nowTs]);

  const standings = useMemo(
    () =>
      [...snapshot.liveState.pairs].sort(
        (left, right) =>
          right.kingWins - left.kingWins ||
          right.takeovers - left.takeovers ||
          left.pairIdx - right.pairIdx,
      ),
    [snapshot.liveState.pairs],
  );

  const queueCards = useMemo(
    () => [snapshot.liveState.kingPairIdx, snapshot.liveState.challengerPairIdx, ...snapshot.liveState.queueOrder],
    [snapshot.liveState.challengerPairIdx, snapshot.liveState.kingPairIdx, snapshot.liveState.queueOrder],
  );

  const selectedRoundNav = useMemo(
    () => snapshot.roundNav.find((round) => round.isSelected) ?? snapshot.roundNav[0] ?? null,
    [snapshot.roundNav],
  );

  const canStart = snapshot.liveState.status === 'pending';
  const canPlay = snapshot.liveState.status === 'running';
  const canManualAdjust = snapshot.liveState.status !== 'finished';
  const timerDanger = canPlay && remainingMs === 0;
  const timerWarning = canPlay && remainingMs > 0 && remainingMs <= 30_000;
  const currentKing = pairLabel(snapshot, snapshot.liveState.kingPairIdx);
  const currentChallenger = pairLabel(snapshot, snapshot.liveState.challengerPairIdx);
  const kingStat = pairStat(snapshot, snapshot.liveState.kingPairIdx);
  const challengerStat = pairStat(snapshot, snapshot.liveState.challengerPairIdx);
  const scoreHistory = useMemo(
    () => [...snapshot.currentEvents].sort((left, right) => right.seqNo - left.seqNo),
    [snapshot.currentEvents],
  );

  function ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const existing = audioContextRef.current;
    if (existing) {
      if (existing.state === 'suspended') {
        void existing.resume().catch(() => {});
      }
      return existing;
    }
    const AudioContextCtor =
      window.AudioContext ??
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    const context = new AudioContextCtor();
    if (context.state === 'suspended') {
      void context.resume().catch(() => {});
    }
    audioContextRef.current = context;
    return context;
  }

  function playJudgeSound(sound: JudgeSound) {
    const context = ensureAudioContext();
    if (!context) return;
    const startAt = context.currentTime + 0.01;
    if (sound === 'score') {
      scheduleTone(context, { startAt, duration: 0.09, frequency: 880, endFrequency: 1100, gain: 0.05, type: 'sine' });
      scheduleTone(context, { startAt: startAt + 0.08, duration: 0.12, frequency: 1320, endFrequency: 1560, gain: 0.04, type: 'triangle' });
      return;
    }
    scheduleTone(context, { startAt, duration: 0.18, frequency: 220, endFrequency: 140, gain: 0.16, type: 'square' });
    scheduleTone(context, { startAt: startAt + 0.12, duration: 0.22, frequency: 196, endFrequency: 122, gain: 0.18, type: 'sawtooth' });
  }

  async function runAction(action: JudgeAction) {
    if (submitting) return;
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      setOnline(false);
      setToast({ tone: 'error', message: 'Нет сети. Дождитесь подключения и повторите действие.' });
      return;
    }

    if (action === 'king-point' || action === 'takeover') {
      playJudgeSound('score');
      vibrate(35);
    }

    setSubmitting(action);
    try {
      const next = await requestJudgeAction(snapshot.pinCode, snapshot.liveState.currentRaundNo, action);
      setSnapshot(next);
      if (action === 'start' || action === 'finish' || action === 'undo') {
        vibrate(action === 'undo' ? 18 : 24);
      }
      setToast({
        tone: 'success',
        message:
          action === 'start'
            ? 'Раунд запущен.'
            : action === 'reset'
              ? 'Раунд сброшен.'
            : action === 'finish'
              ? 'Раунд завершён.'
              : action === 'undo'
                ? 'Последнее действие отменено.'
                : action === 'king-point'
                  ? 'Очко короля зафиксировано.'
                  : 'Смена короля зафиксирована.',
      });
      if (action === 'finish') {
        startTransition(() => router.refresh());
      }
    } catch (error) {
      setToast({
        tone: 'error',
        message: error instanceof Error ? error.message : 'KOTC Next judge action failed',
      });
    } finally {
      setSubmitting(null);
    }
  }

  async function runUndoAction() {
    if (submitting || !snapshot.canUndo || !canPlay) return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Отменить последнее начисление очка или смену трона?');
      if (!confirmed) return;
    }
    await runAction('undo');
  }

  async function runManualPairAction(slot: ManualSlot, direction: ManualDirection) {
    if (submitting) return;
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      setOnline(false);
      setToast({ tone: 'error', message: 'Нет сети. Ручная замена пары недоступна офлайн.' });
      return;
    }

    playJudgeSound('error');
    vibrate(18);
    const key = manualActionKey(slot, direction);
    setSubmitting(key);
    try {
      const next = await requestManualPairAction(snapshot.pinCode, snapshot.liveState.currentRaundNo, slot, direction);
      setSnapshot(next);
      setToast({
        tone: 'info',
        message:
          slot === 'king'
            ? 'Пара короля вручную переставлена.'
            : 'Пара претендента вручную переставлена.',
      });
    } catch (error) {
      setToast({
        tone: 'error',
        message: error instanceof Error ? error.message : 'KOTC Next manual pair update failed',
      });
    } finally {
      setSubmitting(null);
    }
  }

  async function runResetRaundAction() {
    if (submitting) return;
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      setOnline(false);
      setToast({ tone: 'error', message: 'Нет сети. Сброс раунда недоступен офлайн.' });
      return;
    }
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Сбросить текущий раунд? Очередь и игровые события будут очищены.');
      if (!confirmed) return;
    }

    setSubmitting('reset');
    try {
      const next = await requestResetRaundAction(snapshot.pinCode, snapshot.liveState.currentRaundNo);
      setSnapshot(next);
      vibrate(24);
      setToast({ tone: 'success', message: 'Раунд сброшен.' });
    } catch (error) {
      setToast({
        tone: 'error',
        message: error instanceof Error ? error.message : 'KOTC Next judge reset failed',
      });
    } finally {
      setSubmitting(null);
    }
  }

  async function runFinishAction() {
    if (submitting || !canPlay) return;
    if (typeof window !== 'undefined') {
      const confirmations = [
        'Завершить текущий раунд? После финиша результат будет зафиксирован.',
        `Подтвердите финиш для ${snapshot.courtLabel} (${formatRoundType(snapshot.roundType)}).`,
        'Последнее подтверждение: точно нажать «Финиш» сейчас?',
      ];
      for (const confirmationMessage of confirmations) {
        if (!window.confirm(confirmationMessage)) return;
      }
    }
    await runAction('finish');
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[radial-gradient(circle_at_top,rgba(255,214,10,0.12),transparent_18%),linear-gradient(180deg,#050507,#080913_28%,#040405)] px-2.5 pb-6 pt-3 text-white sm:px-3 sm:pb-10 sm:pt-4">
      <div className="mx-auto flex w-full max-w-[430px] flex-col gap-3 sm:max-w-[780px] sm:gap-4">
        <header className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,14,18,0.98),rgba(8,8,12,0.98))] px-3 py-4 shadow-[0_28px_80px_rgba(0,0,0,0.4)] sm:rounded-[28px] sm:px-4 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/72 sm:px-3 sm:text-[11px] sm:tracking-[0.24em]">
              PIN {snapshot.pinCode}
            </div>
            <div className="min-w-0 text-center">
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/35 sm:text-[11px] sm:tracking-[0.34em]">Панель судьи</div>
              <h1 className="mt-1 text-[28px] font-heading uppercase tracking-[0.06em] text-white sm:text-4xl sm:tracking-[0.08em]">
                Король корта
              </h1>
              <p className="mt-1 text-[11px] text-white/45 sm:text-xs">{formatTournamentMeta(snapshot)}</p>
            </div>
            <div className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] sm:px-3 sm:text-[11px] sm:tracking-[0.24em] ${connectionClasses(online)}`}>
              {online ? 'ONLINE' : 'OFFLINE'}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-1.5 sm:mt-5 sm:gap-2">
            <div className="rounded-[14px] border border-[#5b4713] bg-[#ffd400] px-3.5 py-2 text-sm font-black uppercase tracking-[0.04em] text-black sm:rounded-[18px] sm:px-5 sm:py-3 sm:text-lg sm:tracking-[0.05em]">
              {formatRoundType(snapshot.roundType)}
            </div>
            {snapshot.raundHistory.map((entry) => {
              const active = entry.raundNo === snapshot.liveState.currentRaundNo;
              return (
                <div
                  key={`raund-pill-${entry.raundNo}`}
                  className={`rounded-[14px] border px-3 py-2 text-sm font-bold uppercase tracking-[0.04em] sm:rounded-[18px] sm:px-4 sm:py-3 sm:text-base sm:tracking-[0.05em] ${
                    active
                      ? 'border-[#f6d40f] bg-[#16140a] text-[#ffd400]'
                      : 'border-white/10 bg-[#171724] text-white/45'
                  }`}
                >
                  РАУНД {entry.raundNo}
                </div>
              );
            })}
            <div className="mx-1 hidden h-8 w-px bg-white/10 sm:block" />
            <div className="rounded-[14px] border border-[#f6d40f] bg-[#16140a] px-3 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[#ffd400] sm:rounded-[18px] sm:px-4 sm:py-3 sm:text-base sm:tracking-[0.05em]">
              {snapshot.courtLabel}
            </div>
            <div className="rounded-[14px] border border-white/10 bg-[#171724] px-3 py-2 text-sm font-bold uppercase tracking-[0.04em] text-white/45 sm:rounded-[18px] sm:px-4 sm:py-3 sm:text-base sm:tracking-[0.05em]">
              {formatVariant(snapshot.variant)}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-3 sm:mt-5">
            <div className="flex min-w-0 flex-wrap gap-2">
              <div className="w-full text-[10px] font-semibold uppercase tracking-[0.22em] text-white/38">Туры</div>
              {snapshot.roundNav.map((round) => {
                const preferredCourt =
                  round.courts.find((court) => court.courtNo === snapshot.courtNo && court.isAvailable) ??
                  round.courts.find((court) => court.isAvailable) ??
                  null;
                const href = preferredCourt?.judgeUrl ?? null;
                const className = `rounded-full border px-4 py-2 text-[13px] font-bold uppercase tracking-[0.08em] transition sm:px-5 sm:py-3 sm:text-[14px] ${roundTabClasses(round.isSelected, round.isAvailable)} ${!round.isAvailable || !href ? 'cursor-not-allowed opacity-55' : ''}`;
                if (!href || !round.isAvailable) {
                  return (
                    <span key={`round-nav-${round.roundNo}`} aria-disabled="true" className={className}>
                      {round.label}
                    </span>
                  );
                }
                return (
                  <Link
                    key={`round-nav-${round.roundNo}`}
                    href={href}
                    prefetch={false}
                    className={className}
                    aria-current={round.isSelected ? 'page' : undefined}
                  >
                    {round.label}
                  </Link>
                );
              })}
            </div>

            {selectedRoundNav ? (
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <div className="w-full text-right text-[10px] font-semibold uppercase tracking-[0.22em] text-white/38">Корты</div>
                {selectedRoundNav.courts.map((court) => {
                  const className = `rounded-full border px-4 py-2 text-[13px] font-bold uppercase tracking-[0.08em] transition sm:px-5 sm:py-3 sm:text-[14px] ${courtTabClasses(court.isSelected, court.isAvailable)} ${!court.isAvailable || !court.judgeUrl ? 'cursor-not-allowed opacity-55' : ''}`;
                  if (!court.isAvailable || !court.judgeUrl) {
                    return (
                      <span key={`court-nav-${selectedRoundNav.roundNo}-${court.courtNo}`} aria-disabled="true" className={className}>
                        {formatCourtTabLabel(court.label, court.courtNo)}
                      </span>
                    );
                  }
                  return (
                    <Link
                      key={`court-nav-${selectedRoundNav.roundNo}-${court.courtNo}`}
                      href={court.judgeUrl}
                      prefetch={false}
                      className={className}
                      aria-current={court.isSelected ? 'page' : undefined}
                    >
                      {formatCourtTabLabel(court.label, court.courtNo)}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 sm:mt-5 sm:gap-3">
            {queueCards.map((pairIdx, index) => {
              const active = index === 0 || index === 1;
              return (
                <div
                  key={`queue-${pairIdx}-${index}`}
                  className={`min-w-[92px] rounded-[18px] border px-3 py-2 text-left sm:min-w-[132px] sm:px-4 sm:py-3 ${
                    active
                      ? index === 0
                        ? 'border-[#f6d40f] bg-[#16140a] text-[#ffd400]'
                        : 'border-[#2fd35a] bg-[#0a1b12] text-[#8dffab]'
                      : 'border-white/10 bg-white/[0.03] text-white/72'
                  }`}
                  title={pairLabel(snapshot, pairIdx)}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">
                    {index === 0 ? 'KING' : index === 1 ? 'NEXT' : `Q${index - 1}`}
                  </div>
                  <div className="mt-1 text-sm font-black leading-tight sm:text-base">
                    {getPairShortLabel(snapshot, pairIdx)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 lg:mt-5 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/42 sm:text-[12px] sm:tracking-[0.26em]">Осталось</div>
              <div className={`mt-1 text-5xl font-black leading-none tracking-[0.01em] sm:text-6xl sm:tracking-[0.02em] ${timerDanger ? 'text-red-400' : timerWarning ? 'text-orange-300' : 'text-[#ffd400]'}`}>
                {formatRemaining(remainingMs)}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.15em] sm:text-xs sm:tracking-[0.2em]">
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/72">
                  {formatRoundStatus(snapshot.liveState.status)}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/72">
                  {snapshot.courtLabel}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/72">
                  {snapshot.params.ppc} пар
                </span>
                {restoredDraft ? (
                  <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-amber-100">
                    LOCAL DRAFT
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={!canStart || submitting !== null}
                onClick={() => void runAction('start')}
                className="min-h-[62px] rounded-[20px] border border-[#3ee04d]/30 bg-[#31d848] px-4 py-3 text-base font-black uppercase tracking-[0.05em] text-white shadow-[0_18px_50px_rgba(49,216,72,0.24)] transition hover:bg-[#47e05b] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none sm:min-h-[72px] sm:rounded-[22px] sm:px-6 sm:py-4 sm:text-lg sm:tracking-[0.06em]"
              >
                {submitting === 'start' ? 'Старт…' : 'Старт'}
              </button>
              <button
                type="button"
                disabled={!canPlay || submitting !== null}
                onClick={() => void runFinishAction()}
                className="min-h-[62px] rounded-[20px] border border-red-400/30 bg-red-500/10 px-4 py-3 text-base font-black uppercase tracking-[0.05em] text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35 sm:min-h-[72px] sm:rounded-[22px] sm:px-6 sm:py-4 sm:text-lg sm:tracking-[0.06em]"
              >
                {submitting === 'finish' ? 'Финиш…' : 'Финиш'}
              </button>
            </div>
          </div>
        </header>

        {toast ? (
          <div className={`rounded-[18px] border px-4 py-3 text-sm font-medium shadow-[0_12px_40px_rgba(0,0,0,0.22)] ${toneClasses(toast.tone)}`}>
            {toast.message}
          </div>
        ) : null}

        <section className="grid grid-cols-2 gap-2.5 sm:gap-4">
          <article className="rounded-[22px] border-[3px] border-[#f2d100] bg-[linear-gradient(180deg,rgba(34,26,4,0.96),rgba(18,14,3,0.98))] px-3 py-3 shadow-[0_24px_80px_rgba(242,209,0,0.12)] sm:rounded-[30px] sm:border-4 sm:px-5 sm:py-5">
            <div className="flex items-center justify-between gap-3">
              <ManualArrowButton
                label="Король влево"
                onClick={() => void runManualPairAction('king', 'prev')}
                disabled={!canManualAdjust || submitting !== null}
              />
              <div className="rounded-full border border-[#f2d100]/30 bg-[#161105] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#f2d100] sm:px-4 sm:py-2 sm:text-[11px] sm:tracking-[0.22em]">
                Пара короля
              </div>
              <ManualArrowButton
                label="Король вправо"
                onClick={() => void runManualPairAction('king', 'next')}
                disabled={!canManualAdjust || submitting !== null}
              />
            </div>

            <div className="mt-3 sm:mt-4">
              <h2 className="text-xl font-black leading-tight text-white sm:text-3xl">{currentKing}</h2>
              {showArrowHelp ? (
                <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-white/48 sm:text-xs sm:tracking-[0.18em]">
                  Ручная перестановка пары короля без начисления очка
                </p>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-[1fr_124px] gap-3 sm:mt-6 sm:grid-cols-[1fr_168px] sm:gap-4">
              <div>
                <div className="text-[72px] font-black leading-none text-[#ffd400] sm:text-[96px]">
                  {kingStat?.kingWins ?? 0}
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-white/62 sm:mt-3 sm:text-sm">
                  <div>Смен трона: {kingStat?.takeovers ?? 0}</div>
                  <div>Сыграно игр: {kingStat?.gamesPlayed ?? 0}</div>
                </div>
              </div>
              <div className="grid gap-3">
                <button
                  type="button"
                  disabled={!canPlay || submitting !== null}
                  onClick={() => void runAction('king-point')}
                  className="min-h-[132px] rounded-[22px] border border-[#2fd35a] bg-[#35d64c] px-3 py-5 text-center text-5xl font-black text-white transition hover:bg-[#47e05b] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/30 sm:min-h-[168px] sm:rounded-[26px] sm:px-4 sm:py-6 sm:text-6xl"
                >
                  +1
                  <div className="mt-2 text-[11px] uppercase tracking-[0.12em] sm:mt-3 sm:text-sm sm:tracking-[0.16em]">Очко короля</div>
                </button>
              </div>
            </div>
          </article>

          <article className="rounded-[22px] border-[3px] border-[#2370ff] bg-[linear-gradient(180deg,rgba(7,17,42,0.96),rgba(4,11,29,0.98))] px-3 py-3 shadow-[0_24px_80px_rgba(35,112,255,0.14)] sm:rounded-[30px] sm:border-4 sm:px-5 sm:py-5">
            <div className="flex items-center justify-between gap-3">
              <ManualArrowButton
                label="Претендент влево"
                onClick={() => void runManualPairAction('challenger', 'prev')}
                disabled={!canManualAdjust || submitting !== null}
              />
              <div className="rounded-full border border-[#2370ff]/30 bg-[#091730] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#50bbff] sm:px-4 sm:py-2 sm:text-[11px] sm:tracking-[0.22em]">
                Пара претендент
              </div>
              <ManualArrowButton
                label="Претендент вправо"
                onClick={() => void runManualPairAction('challenger', 'next')}
                disabled={!canManualAdjust || submitting !== null}
              />
            </div>

            <div className="mt-3 sm:mt-4">
              <h2 className="text-xl font-black leading-tight text-white sm:text-3xl">{currentChallenger}</h2>
              {showArrowHelp ? (
                <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-white/48 sm:text-xs sm:tracking-[0.18em]">
                  Ручная перестановка претендента и очереди за ним
                </p>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-[1fr_124px] gap-3 sm:mt-6 sm:grid-cols-[1fr_168px] sm:gap-4">
              <div>
                <div className="text-[72px] font-black leading-none text-white sm:text-[96px]">
                  {challengerStat?.kingWins ?? 0}
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-white/62 sm:mt-3 sm:text-sm">
                  <div>Захватов трона: {challengerStat?.takeovers ?? 0}</div>
                  <div>Сыграно игр: {challengerStat?.gamesPlayed ?? 0}</div>
                </div>
              </div>
              <div className="grid gap-3">
                <button
                  type="button"
                  disabled={!canPlay || submitting !== null}
                  onClick={() => void runAction('takeover')}
                  className="min-h-[132px] rounded-[22px] border border-[#2fd35a] bg-[#35d64c] px-3 py-5 text-center text-5xl font-black text-white transition hover:bg-[#47e05b] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/30 sm:min-h-[168px] sm:rounded-[26px] sm:px-4 sm:py-6 sm:text-6xl"
                >
                  +1
                  <div className="mt-2 text-[11px] uppercase tracking-[0.12em] sm:mt-3 sm:text-sm sm:tracking-[0.16em]">Смена трона</div>
                </button>
              </div>
            </div>
          </article>
        </section>

        <section className="rounded-[22px] border border-white/8 bg-[#171717] px-3 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.32)] sm:rounded-[28px] sm:px-4 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/44 sm:text-[12px] sm:tracking-[0.26em]">Турнирная таблица</div>
              <div className="mt-1 text-[11px] text-white/55 sm:text-sm">Очки короля, захваты трона и сыгранные игры по текущему корту.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowStandings((value) => !value)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/10 sm:px-4 sm:text-sm"
              >
                {showStandings ? 'Свернуть таблицу' : 'Развернуть таблицу'}
              </button>
              <button
                type="button"
                onClick={() => setShowArrowHelp((value) => !value)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/10 sm:px-4 sm:text-sm"
              >
                {showArrowHelp ? 'Скрыть подсказки стрелок' : 'Показать подсказки стрелок'}
              </button>
              <button
                type="button"
                onClick={() => startTransition(() => router.refresh())}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/10 sm:px-4 sm:text-sm"
              >
                Обновить
              </button>
            </div>
          </div>

          {showStandings ? (
            <div className="mt-3 overflow-hidden rounded-[18px] border border-white/8 sm:mt-4 sm:rounded-[24px]">
            <table className="min-w-full text-left">
              <thead className="bg-[#1f1f1f] text-[10px] uppercase tracking-[0.14em] text-white/38 sm:text-[12px] sm:tracking-[0.2em]">
                <tr>
                  <th className="px-3 py-3 sm:px-5 sm:py-4">Пара</th>
                  <th className="px-2 py-3 text-center sm:px-4 sm:py-4">КО</th>
                  <th className="px-2 py-3 text-center sm:px-4 sm:py-4">ТБ</th>
                  <th className="px-2 py-3 text-center sm:px-4 sm:py-4">ИГР</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, index) => {
                  const isKing = row.pairIdx === snapshot.liveState.kingPairIdx;
                  const isChallenger = row.pairIdx === snapshot.liveState.challengerPairIdx;
                  return (
                    <tr
                      key={`standing-${row.pairIdx}`}
                      className={`border-t border-white/8 ${
                        isKing
                          ? 'bg-[#2a2100]/95 text-[#ffd400]'
                          : isChallenger
                            ? 'bg-[#08182d]/95 text-[#50bbff]'
                            : 'bg-[#141414] text-white/84'
                      }`}
                    >
                      <td className="px-3 py-3 sm:px-5 sm:py-4">
                        <div className="flex items-center gap-3">
                          <span className="w-4 text-xs font-black text-white/55 sm:w-5 sm:text-sm">{index + 1}</span>
                          <div>
                            <div className="text-sm font-bold leading-tight sm:text-lg">{pairLabel(snapshot, row.pairIdx)}</div>
                            <div className="mt-1 text-[10px] uppercase tracking-[0.1em] text-white/42 sm:text-xs sm:tracking-[0.16em]">
                              {isKing ? 'King' : isChallenger ? 'Challenger' : 'Queue'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-center text-xl font-black sm:px-4 sm:py-4 sm:text-3xl">{row.kingWins}</td>
                      <td className="px-2 py-3 text-center text-xl font-black sm:px-4 sm:py-4 sm:text-3xl">{row.takeovers}</td>
                      <td className="px-2 py-3 text-center text-xl font-black sm:px-4 sm:py-4 sm:text-3xl">{row.gamesPlayed}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          ) : null}

          <div className="mt-3 grid gap-2.5 sm:mt-4 sm:gap-3 sm:grid-cols-2">
            <div className="rounded-[18px] border border-white/8 bg-[#101010] px-3 py-3 sm:rounded-[22px] sm:px-4 sm:py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/42 sm:text-[12px] sm:tracking-[0.26em]">Очередь на замену</div>
              <div className="mt-2 text-[11px] text-white/74 sm:text-sm">
                {snapshot.liveState.queueOrder.length > 0
                  ? snapshot.liveState.queueOrder.map((pairIdx) => pairLabel(snapshot, pairIdx)).join(' · ')
                  : 'Очередь пуста'}
              </div>
            </div>
            <div className="rounded-[18px] border border-white/8 bg-[#101010] px-3 py-3 sm:rounded-[22px] sm:px-4 sm:py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/42 sm:text-[12px] sm:tracking-[0.26em]">История раундов</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {snapshot.raundHistory.map((entry) => (
                  <div
                    key={`history-${entry.raundNo}`}
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] sm:px-3 sm:py-1.5 sm:text-[11px] sm:tracking-[0.16em] ${
                      entry.raundNo === snapshot.liveState.currentRaundNo
                        ? 'border-[#f2d100]/40 bg-[#2a2100] text-[#ffd400]'
                        : 'border-white/10 bg-white/5 text-white/60'
                    }`}
                  >
                    РАУНД {entry.raundNo} · {formatRoundStatus(entry.status)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[22px] border border-white/8 bg-[#171717] px-3 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.32)] sm:rounded-[28px] sm:px-4 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/44 sm:text-[12px] sm:tracking-[0.26em]">История начисления очков</div>
              <div className="mt-1 text-[11px] text-white/55 sm:text-sm">Последние очки и смены трона с точным временем.</div>
            </div>
            <button
              type="button"
              onClick={() => setShowScoreHistory((value) => !value)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/10 sm:px-4 sm:text-sm"
            >
              {showScoreHistory ? 'Свернуть историю' : 'Развернуть историю'}
            </button>
          </div>

          {showScoreHistory ? (
            <div className="mt-3 space-y-2 sm:mt-4">
              {scoreHistory.length ? (
                scoreHistory.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-[18px] border border-white/8 bg-[#101010] px-3 py-3 sm:px-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">
                        #{event.seqNo} · {event.eventType === 'takeover' ? 'Смена трона' : 'Очко'}
                      </div>
                      <div className="text-[11px] font-semibold text-white/58 sm:text-sm">
                        {formatEventClock(event.playedAt)}
                      </div>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-white sm:text-base">
                      {describeEvent(snapshot, event)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-white/8 bg-[#101010] px-3 py-3 text-sm text-white/62 sm:px-4">
                  История пока пустая.
                </div>
              )}
            </div>
          ) : null}
        </section>

        <section className="grid gap-2.5 sm:grid-cols-3 sm:gap-4">
          <button
            type="button"
            disabled={!snapshot.canUndo || !canPlay || submitting !== null}
            onClick={() => void runUndoAction()}
            className="rounded-[18px] border border-amber-300/25 bg-amber-500/10 px-3 py-3 text-sm font-black uppercase tracking-[0.08em] text-amber-100 transition hover:bg-amber-500/18 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35 sm:rounded-[22px] sm:px-4 sm:py-4 sm:text-base"
          >
            {submitting === 'undo' ? 'Отмена…' : 'Отмена последнего'}
          </button>
          <button
            type="button"
            disabled={submitting !== null || snapshot.liveState.status === 'finished'}
            onClick={() => void runResetRaundAction()}
            className="rounded-[18px] border border-red-500/35 bg-red-500/10 px-3 py-3 text-sm font-black uppercase tracking-[0.08em] text-red-200 transition hover:bg-red-500/18 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35 sm:rounded-[22px] sm:px-4 sm:py-4 sm:text-base"
          >
            {submitting === 'reset' ? 'Сброс…' : 'Сброс раунда'}
          </button>
          <button
            type="button"
            onClick={() => startTransition(() => router.refresh())}
            className="rounded-[18px] border border-white/10 bg-white/5 px-3 py-3 text-sm font-black uppercase tracking-[0.08em] text-white/80 transition hover:border-white/20 hover:bg-white/10 sm:rounded-[22px] sm:px-4 sm:py-4 sm:text-base"
          >
            Обновить
          </button>
        </section>
      </div>
    </div>
  );
}
