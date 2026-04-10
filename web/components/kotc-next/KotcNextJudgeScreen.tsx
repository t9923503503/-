'use client';

import { startTransition, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { KotcNextJudgeSnapshot } from '@/lib/kotc-next';

type ToastTone = 'info' | 'success' | 'error';

interface ToastState {
  tone: ToastTone;
  message: string;
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

function formatVariant(variant: string): string {
  const normalized = String(variant || '').trim().toUpperCase();
  if (normalized === 'MM' || normalized === 'WW' || normalized === 'MN') return normalized;
  return 'MF';
}

function draftKey(pin: string): string {
  return `kotcn:judge:${String(pin || '').trim().toUpperCase()}`;
}

function sanitizeSnapshot(candidate: unknown): KotcNextJudgeSnapshot | null {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const value = candidate as Record<string, unknown>;
  if (!value.pinCode || !value.liveState || !Array.isArray(value.pairs)) return null;
  return candidate as KotcNextJudgeSnapshot;
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

function pairStat(snapshot: KotcNextJudgeSnapshot, pairIdx: number) {
  return snapshot.liveState.pairs.find((pair) => pair.pairIdx === pairIdx) ?? null;
}

async function requestJudgeAction(
  pin: string,
  raundNo: number,
  action: 'start' | 'king-point' | 'takeover' | 'undo' | 'finish',
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

export function KotcNextJudgeScreen({
  initialSnapshot,
}: {
  initialSnapshot: KotcNextJudgeSnapshot;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [submitting, setSubmitting] = useState<null | 'start' | 'king-point' | 'takeover' | 'undo' | 'finish'>(null);
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
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(draftKey(snapshot.pinCode), JSON.stringify(snapshot));
  }, [snapshot]);

  useEffect(() => {
    if (!toast) return;
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

  const canStart = snapshot.liveState.status === 'pending';
  const canPlay = snapshot.liveState.status === 'running';
  const currentKing = pairLabel(snapshot, snapshot.liveState.kingPairIdx);
  const currentChallenger = pairLabel(snapshot, snapshot.liveState.challengerPairIdx);

  async function runAction(action: 'start' | 'king-point' | 'takeover' | 'undo' | 'finish') {
    if (submitting) return;
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      setOnline(false);
      setToast({ tone: 'error', message: 'Нет сети. Ждите...' });
      return;
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
            : action === 'finish'
              ? 'Раунд завершён.'
              : action === 'undo'
                ? 'Последнее действие отменено.'
                : action === 'king-point'
                  ? 'King point засчитан.'
                  : 'Takeover засчитан.',
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

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[radial-gradient(circle_at_top,rgba(255,210,74,0.08),transparent_14%),linear-gradient(180deg,#080813,#0d0d18_28%,#090913)] px-3 pb-8 pt-4 text-white">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        <header className="rounded-[24px] border border-[#33280f] bg-[linear-gradient(180deg,rgba(21,18,32,0.98),rgba(12,12,24,0.98))] px-4 py-4 shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.34em] text-[#8e7b48]">KOTC Next Judge</div>
              <h1 className="mt-2 truncate text-3xl font-heading uppercase tracking-[0.08em] text-[#ffd24a] sm:text-4xl">
                {snapshot.roundType.toUpperCase()} · {snapshot.courtLabel}
              </h1>
              <p className="mt-2 text-sm text-[#c1c7d6]/82">
                {snapshot.tournamentName} · {snapshot.tournamentDate}
                {snapshot.tournamentTime ? ` · ${snapshot.tournamentTime}` : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.24em] ${connectionClasses(online)}`}>
                {online ? 'ONLINE' : 'OFF'}
              </span>
              <span className="rounded-full border border-[#4b3c15] bg-[#1b160d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ffd24a]">
                {formatVariant(snapshot.variant)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#aeb6c8]">
                PIN {snapshot.pinCode}
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[18px] border border-[#5b4713] bg-[#18140d] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">King</div>
              <div className="mt-2 text-base font-semibold text-white">{currentKing}</div>
            </div>
            <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[#7d8498]">Challenger</div>
              <div className="mt-2 text-base font-semibold text-white">{currentChallenger}</div>
            </div>
            <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[#7d8498]">Timer</div>
              <div className={`mt-2 text-2xl font-black tracking-[0.06em] ${remainingMs === 0 && canPlay ? 'text-red-300' : 'text-white'}`}>
                {formatRemaining(remainingMs)}
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-[#9aa1b3]">
            Queue: {snapshot.liveState.queueOrder.map((pairIdx) => pairLabel(snapshot, pairIdx)).join(' · ') || '—'}
          </div>
        </header>

        {toast ? (
          <div className={`rounded-[18px] border px-4 py-3 text-sm font-medium shadow-[0_12px_40px_rgba(0,0,0,0.22)] ${toneClasses(toast.tone)}`}>
            {toast.message}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={!canStart || submitting !== null}
            onClick={() => void runAction('start')}
            className="rounded-[22px] border border-[#5b4713] bg-[#ffd24a] px-5 py-5 text-left text-[#17130b] shadow-[0_16px_48px_rgba(245,158,11,0.2)] transition hover:bg-[#ffe07f] disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
          >
            <div className="text-[11px] uppercase tracking-[0.24em]">Raund</div>
            <div className="mt-2 text-2xl font-black uppercase tracking-[0.06em]">
              {submitting === 'start' ? 'Запуск…' : 'Start'}
            </div>
          </button>
          <button
            type="button"
            disabled={!canPlay || submitting !== null}
            onClick={() => void runAction('finish')}
            className="rounded-[22px] border border-red-400/30 bg-red-500/10 px-5 py-5 text-left text-red-100 shadow-[0_16px_48px_rgba(127,29,29,0.18)] transition hover:border-red-300/50 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="text-[11px] uppercase tracking-[0.24em]">Raund</div>
            <div className="mt-2 text-2xl font-black uppercase tracking-[0.06em]">
              {submitting === 'finish' ? 'Фиксация…' : 'Finish'}
            </div>
          </button>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={!canPlay || submitting !== null}
            onClick={() => void runAction('king-point')}
            className="rounded-[24px] border border-[#5b4713] bg-[#ffd24a] px-5 py-6 text-left text-[#17130b] shadow-[0_20px_60px_rgba(245,158,11,0.24)] transition hover:bg-[#ffe07f] disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
          >
            <div className="text-[11px] uppercase tracking-[0.24em]">Action</div>
            <div className="mt-2 text-3xl font-black uppercase tracking-[0.08em]">
              {submitting === 'king-point' ? '…' : 'King Point'}
            </div>
            <div className="mt-2 text-sm font-medium">{currentKing} удержал трон.</div>
          </button>
          <button
            type="button"
            disabled={!canPlay || submitting !== null}
            onClick={() => void runAction('takeover')}
            className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,17,29,0.98),rgba(12,12,24,0.98))] px-5 py-6 text-left text-white shadow-[0_20px_60px_rgba(0,0,0,0.3)] transition hover:border-white/20 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="text-[11px] uppercase tracking-[0.24em] text-[#8f7c4a]">Action</div>
            <div className="mt-2 text-3xl font-black uppercase tracking-[0.08em]">
              {submitting === 'takeover' ? '…' : 'Takeover'}
            </div>
            <div className="mt-2 text-sm font-medium text-white/82">{currentChallenger} забрал трон.</div>
          </button>
        </section>

        <section className="rounded-[18px] border border-[#2a2a3f] bg-[linear-gradient(180deg,rgba(18,17,29,0.98),rgba(12,12,24,0.98))] px-4 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">Undo</div>
              <div className="mt-1 text-sm text-white/82">
                Вернуть последнее игровое событие текущего раунда.
              </div>
            </div>
            <button
              type="button"
              disabled={!snapshot.canUndo || !canPlay || submitting !== null}
              onClick={() => void runAction('undo')}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting === 'undo' ? 'Undo…' : 'Undo'}
            </button>
          </div>
        </section>

        <section className="rounded-[18px] border border-[#2a2a3f] bg-[linear-gradient(180deg,rgba(18,17,29,0.98),rgba(12,12,24,0.98))] px-4 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
          <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">Standings</div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-white/88">
              <thead className="text-[10px] uppercase tracking-[0.18em] text-[#7d8498]">
                <tr>
                  <th className="px-3 py-2">Pair</th>
                  <th className="px-3 py-2 text-center">KP</th>
                  <th className="px-3 py-2 text-center">TO</th>
                  <th className="px-3 py-2 text-center">Games</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row) => {
                  const isKing = row.pairIdx === snapshot.liveState.kingPairIdx;
                  const isChallenger = row.pairIdx === snapshot.liveState.challengerPairIdx;
                  return (
                    <tr key={`standing-${row.pairIdx}`} className="border-t border-white/6">
                      <td className="px-3 py-2 font-semibold">
                        <div className="flex items-center gap-2">
                          <span>{pairLabel(snapshot, row.pairIdx)}</span>
                          {isKing ? (
                            <span className="rounded-full border border-[#5b4713] bg-[#18140d] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[#ffd24a]">
                              KING
                            </span>
                          ) : null}
                          {isChallenger ? (
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[#aeb6c8]">
                              NEXT
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center text-[#ffd24a]">{row.kingWins}</td>
                      <td className="px-3 py-2 text-center">{row.takeovers}</td>
                      <td className="px-3 py-2 text-center">{row.gamesPlayed}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[18px] border border-[#2a2a3f] bg-[linear-gradient(180deg,rgba(18,17,29,0.98),rgba(12,12,24,0.98))] px-4 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
          <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">Raund history</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {snapshot.raundHistory.map((entry) => (
              <div
                key={`raund-history-${entry.raundNo}`}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-[#c7cada]"
              >
                R{entry.raundNo} · {String(entry.status || '').toUpperCase()}
              </div>
            ))}
          </div>
        </section>

        <button
          type="button"
          onClick={() => startTransition(() => router.refresh())}
          className="w-full rounded-[18px] border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold uppercase tracking-[0.22em] text-white/80 transition hover:border-white/20 hover:bg-white/10"
        >
          Обновить
        </button>
      </div>
    </div>
  );
}
