'use client';

import Link from 'next/link';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { KotcNextJudgeSnapshot, KotcNextPairLiveState } from '@/lib/kotc-next';

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

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function pairLabel(snapshot: KotcNextJudgeSnapshot, pairIdx: number): string {
  return snapshot.pairs.find((pair) => pair.pairIdx === pairIdx)?.label ?? `Pair ${pairIdx + 1}`;
}

function pairStat(snapshot: KotcNextJudgeSnapshot, pairIdx: number): KotcNextPairLiveState | null {
  return snapshot.liveState.pairs.find((pair) => pair.pairIdx === pairIdx) ?? null;
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
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [submitting, setSubmitting] = useState<PendingAction | null>(null);
  const [online, setOnline] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

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
    window.localStorage.setItem(draftKey(snapshot.pinCode), JSON.stringify(snapshot));
  }, [snapshot]);

  useEffect(() => {
    if (!toast || typeof window === 'undefined') return;
    const timeoutId = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

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
  const currentKing = pairLabel(snapshot, snapshot.liveState.kingPairIdx);
  const currentChallenger = pairLabel(snapshot, snapshot.liveState.challengerPairIdx);
  const kingStat = pairStat(snapshot, snapshot.liveState.kingPairIdx);
  const challengerStat = pairStat(snapshot, snapshot.liveState.challengerPairIdx);

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
    }

    setSubmitting(action);
    try {
      const next = await requestJudgeAction(snapshot.pinCode, snapshot.liveState.currentRaundNo, action);
      setSnapshot(next);
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

  async function runManualPairAction(slot: ManualSlot, direction: ManualDirection) {
    if (submitting) return;
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      setOnline(false);
      setToast({ tone: 'error', message: 'Нет сети. Ручная замена пары недоступна офлайн.' });
      return;
    }

    playJudgeSound('error');
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
              <p className="mt-1 text-[11px] text-white/45 sm:text-xs">
                {snapshot.tournamentName} · {snapshot.tournamentDate}
                {snapshot.tournamentTime ? ` · ${snapshot.tournamentTime}` : ''}
              </p>
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
                  className={`flex h-12 w-12 items-center justify-center rounded-full border text-xl font-black sm:h-16 sm:w-16 sm:text-2xl ${
                    active
                      ? index === 0
                        ? 'border-[#f6d40f] text-[#ffd400]'
                        : 'border-[#2fd35a] text-[#2fd35a]'
                      : 'border-white/10 text-white/28'
                  }`}
                  title={pairLabel(snapshot, pairIdx)}
                >
                  {index + 1}
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 lg:mt-5 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/42 sm:text-[12px] sm:tracking-[0.26em]">Осталось</div>
              <div className={`mt-1 text-5xl font-black leading-none tracking-[0.01em] sm:text-6xl sm:tracking-[0.02em] ${remainingMs === 0 && canPlay ? 'text-red-400' : 'text-[#ffd400]'}`}>
                {formatRemaining(remainingMs)}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] uppercase tracking-[0.15em] text-white/42 sm:gap-2 sm:text-xs sm:tracking-[0.2em]">
                <span>{formatRoundStatus(snapshot.liveState.status)}</span>
                <span>·</span>
                <span>{snapshot.courtLabel}</span>
                <span>·</span>
                <span>{snapshot.params.ppc} пар</span>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={!canStart || submitting !== null}
                onClick={() => void runAction('start')}
                className="rounded-[18px] border border-[#3ee04d]/30 bg-[#31d848] px-4 py-3 text-base font-black uppercase tracking-[0.05em] text-white shadow-[0_18px_50px_rgba(49,216,72,0.24)] transition hover:bg-[#47e05b] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none sm:rounded-[22px] sm:px-6 sm:py-4 sm:text-lg sm:tracking-[0.06em]"
              >
                {submitting === 'start' ? 'Старт…' : 'Старт'}
              </button>
              <button
                type="button"
                disabled={!canPlay || submitting !== null}
                onClick={() => void runFinishAction()}
                className="rounded-[18px] border border-red-400/30 bg-red-500/10 px-4 py-3 text-base font-black uppercase tracking-[0.05em] text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35 sm:rounded-[22px] sm:px-6 sm:py-4 sm:text-lg sm:tracking-[0.06em]"
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
              <p className="mt-2 text-[11px] leading-4 text-white/55 sm:text-sm sm:leading-5">
                Стрелки сверху вручную крутят порядок короля без начисления очков. Используйте их, если очередь на корте сбилась.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-[1fr_92px] gap-3 sm:mt-6 sm:grid-cols-[1fr_132px] sm:gap-4">
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
                  className="rounded-[18px] border border-[#2fd35a] bg-[#35d64c] px-3 py-4 text-center text-4xl font-black text-white transition hover:bg-[#47e05b] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/30 sm:rounded-[22px] sm:px-4 sm:py-5 sm:text-5xl"
                >
                  +1
                  <div className="mt-1.5 text-[10px] uppercase tracking-[0.12em] sm:mt-2 sm:text-sm sm:tracking-[0.16em]">Очко</div>
                </button>
                <button
                  type="button"
                  disabled={!snapshot.canUndo || !canPlay || submitting !== null}
                  onClick={() => void runAction('undo')}
                  className="rounded-[18px] border border-[#5c531f] bg-[#1d1a07] px-3 py-3 text-center text-[32px] font-black text-white transition hover:bg-[#2a250b] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/30 sm:rounded-[22px] sm:px-4 sm:py-4 sm:text-3xl"
                >
                  -1
                  <div className="mt-1.5 text-[10px] uppercase tracking-[0.12em] sm:mt-2 sm:text-sm sm:tracking-[0.16em]">Отмена</div>
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
              <p className="mt-2 text-[11px] leading-4 text-white/55 sm:text-sm sm:leading-5">
                Стрелки претендента меняют только challenger и очередь за ним, не трогая очки и статистику раунда.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-[1fr_92px] gap-3 sm:mt-6 sm:grid-cols-[1fr_132px] sm:gap-4">
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
                  className="rounded-[18px] border border-[#2fd35a] bg-[#35d64c] px-3 py-4 text-center text-4xl font-black text-white transition hover:bg-[#47e05b] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/30 sm:rounded-[22px] sm:px-4 sm:py-5 sm:text-5xl"
                >
                  +1
                  <div className="mt-1.5 text-[10px] uppercase tracking-[0.12em] sm:mt-2 sm:text-sm sm:tracking-[0.16em]">Очко</div>
                </button>
                <button
                  type="button"
                  disabled={!snapshot.canUndo || !canPlay || submitting !== null}
                  onClick={() => void runAction('undo')}
                  className="rounded-[18px] border border-[#1d3d75] bg-[#0c1a36] px-3 py-3 text-center text-[32px] font-black text-white transition hover:bg-[#12264b] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/30 sm:rounded-[22px] sm:px-4 sm:py-4 sm:text-3xl"
                >
                  -1
                  <div className="mt-1.5 text-[10px] uppercase tracking-[0.12em] sm:mt-2 sm:text-sm sm:tracking-[0.16em]">Отмена</div>
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
            <button
              type="button"
              onClick={() => startTransition(() => router.refresh())}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/10 sm:px-4 sm:text-sm"
            >
              Обновить
            </button>
          </div>

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

        <section className="grid grid-cols-2 gap-2.5 sm:gap-4">
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
