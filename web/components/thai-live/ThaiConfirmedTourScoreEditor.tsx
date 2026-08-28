'use client';

import { useEffect, useState } from 'react';
import type { ThaiOperatorTourSummary } from '@/lib/thai-live/types';

export function ThaiConfirmedTourScoreEditor({
  tournamentId,
  roundType,
  pointLimit,
  tour,
  canConfirmPending = false,
  onSaved,
}: {
  tournamentId: string;
  roundType: 'r1' | 'r2';
  pointLimit: number;
  tour: ThaiOperatorTourSummary;
  canConfirmPending?: boolean;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [scores, setScores] = useState(() =>
    tour.matches.map((m) => ({ s1: String(m.team1Score ?? ''), s2: String(m.team2Score ?? '') })),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const snapshot = tour.matches.map((m) => `${m.matchId}:${m.team1Score}:${m.team2Score}`).join('|');
  const isPendingConfirm = canConfirmPending && tour.status === 'pending';
  const isCorrection = tour.status === 'confirmed';
  const scoreInputClass = isPendingConfirm
    ? 'w-16 rounded-xl border border-amber-300/30 bg-[#0f0f18] px-2 py-2 text-center text-base font-black text-white shadow-inner shadow-black/30'
    : 'w-14 rounded-lg border border-white/15 bg-[#0f0f18] px-2 py-1.5 text-center text-sm font-semibold text-white';

  useEffect(() => {
    setScores(tour.matches.map((m) => ({ s1: String(m.team1Score ?? ''), s2: String(m.team2Score ?? '') })));
    setErr(null);
    setOpen(isPendingConfirm);
  }, [tour.tourId, snapshot, isPendingConfirm]);

  if (!isPendingConfirm && !isCorrection) {
    return null;
  }

  async function submit() {
    setErr(null);
    const trimmed = reason.trim();
    if (isCorrection && trimmed.length < 4) {
      setErr('\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u043f\u0440\u0438\u0447\u0438\u043d\u0443 (\u043d\u0435 \u043a\u043e\u0440\u043e\u0447\u0435 4 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432).');
      return;
    }
    const matches = tour.matches.map((m, idx) => ({
      matchId: m.matchId,
      team1Score: Math.trunc(Number(scores[idx]?.s1)),
      team2Score: Math.trunc(Number(scores[idx]?.s2)),
    }));
    if (matches.some((m) => !Number.isFinite(m.team1Score) || !Number.isFinite(m.team2Score))) {
      setErr('\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0446\u0435\u043b\u044b\u0435 \u0447\u0438\u0441\u043b\u0430 \u0434\u043b\u044f \u0432\u0441\u0435\u0445 \u043f\u043e\u043b\u0435\u0439 \u0441\u0447\u0451\u0442\u0430.');
      return;
    }

    setBusy(true);
    try {
      const endpoint = isPendingConfirm ? 'thai-confirm-tour' : 'thai-correct-tour';
      const res = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isPendingConfirm ? { tourId: tour.tourId, matches } : { tourId: tour.tourId, reason: trimmed, matches },
        ),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c');
      }
      setOpen(false);
      setReason('');
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      {!open && !isPendingConfirm ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/90 underline decoration-amber-400/40 underline-offset-2 hover:text-amber-100"
        >
          {isPendingConfirm
            ? '\u041f\u0440\u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0442\u0443\u0440\u0430'
            : '\u0418\u0441\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u0447\u0451\u0442 \u0442\u0443\u0440\u0430'}
        </button>
      ) : open ? (
        <div className="space-y-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-[0.22em] text-amber-200/85">
              {isPendingConfirm
                ? '\u0411\u044b\u0441\u0442\u0440\u044b\u0439 \u0432\u0432\u043e\u0434 \u0431\u0435\u0437 \u0441\u0443\u0434\u044c\u0438'
                : '\u041a\u043e\u0440\u0440\u0435\u043a\u0446\u0438\u044f \u0441\u0447\u0451\u0442\u0430'}
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[#aeb6c8]">
              {roundType.toUpperCase()} · {'\u043b\u0438\u043c\u0438\u0442'} {pointLimit}
            </div>
          </div>

          <div className="space-y-2">
            {tour.matches.map((match, idx) => (
              <div
                key={match.matchId}
                className="rounded-xl border border-white/8 bg-black/10 p-2 sm:flex sm:items-center sm:justify-between sm:gap-3"
              >
                <div className="min-w-0 text-xs text-white/80">
                  <span className="text-[#8f7c4a]">M{match.matchNo}</span>{' '}
                  <span className="text-white/70">{match.team1Label}</span>
                  <span className="px-1 text-[#7d8498]">vs</span>
                  <span className="text-white/70">{match.team2Label}</span>
                </div>
                <div className="mt-2 flex shrink-0 items-center gap-2 sm:mt-0">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={pointLimit}
                    value={scores[idx]?.s1 ?? ''}
                    onChange={(ev) => {
                      const next = [...scores];
                      next[idx] = { ...next[idx], s1: ev.target.value };
                      setScores(next);
                    }}
                    className={scoreInputClass}
                    aria-label={`\u0421\u0447\u0451\u0442 \u043a\u043e\u043c\u0430\u043d\u0434\u044b 1, \u043c\u0430\u0442\u0447 ${match.matchNo}`}
                  />
                  <span className="text-[#7d8498]">:</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={pointLimit}
                    value={scores[idx]?.s2 ?? ''}
                    onChange={(ev) => {
                      const next = [...scores];
                      next[idx] = { ...next[idx], s2: ev.target.value };
                      setScores(next);
                    }}
                    className={scoreInputClass}
                    aria-label={`\u0421\u0447\u0451\u0442 \u043a\u043e\u043c\u0430\u043d\u0434\u044b 2, \u043c\u0430\u0442\u0447 ${match.matchNo}`}
                  />
                </div>
              </div>
            ))}
          </div>

          {isCorrection ? (
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#7d8498]">
                {'\u041f\u0440\u0438\u0447\u0438\u043d\u0430 \u0438\u0441\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f'}
              </span>
              <textarea
                value={reason}
                onChange={(ev) => setReason(ev.target.value)}
                rows={2}
                placeholder="\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: \u0441\u0443\u0434\u044c\u044f \u043f\u0435\u0440\u0435\u043f\u0443\u0442\u0430\u043b \u0441\u0442\u043e\u0440\u043e\u043d\u044b"
                className="mt-1 w-full rounded-xl border border-white/12 bg-[#0f0f18] px-3 py-2 text-sm text-white placeholder:text-white/30"
              />
            </label>
          ) : null}

          {err ? <p className="text-xs text-red-300">{err}</p> : null}
          <p className="text-[10px] leading-relaxed text-[#7d8498]">
            {isPendingConfirm
              ? '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0434\u0432\u0430 \u0441\u0447\u0451\u0442\u0430 \u043f\u043e \u0438\u0433\u0440\u0430\u043c \u0442\u0443\u0440\u0430. \u041f\u043e\u0441\u043b\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f \u0442\u0443\u0440 \u0437\u0430\u043a\u0440\u043e\u0435\u0442\u0441\u044f, \u0442\u0430\u0431\u043b\u0438\u0446\u0430 \u043a\u043e\u0440\u0442\u0430 \u043f\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044f, \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0442\u0443\u0440 \u043e\u0442\u043a\u0440\u043e\u0435\u0442\u0441\u044f \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438.'
              : '\u041f\u043e\u0441\u043b\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f \u043f\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044f \u0442\u0430\u0431\u043b\u0438\u0446\u0430 \u0442\u0443\u0440\u0430 \u043d\u0430 \u043a\u043e\u0440\u0442\u0435.'}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => submit()}
              className="rounded-full border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-amber-100 transition hover:bg-amber-500/25 disabled:opacity-50"
            >
              {busy
                ? '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c\u2026'
                : isPendingConfirm
                  ? '\u0417\u0430\u043f\u0438\u0441\u0430\u0442\u044c \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0442\u0443\u0440\u0430'
                  : '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0441\u0447\u0451\u0442'}
            </button>
            {!isPendingConfirm ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setErr(null);
                  setReason('');
                  setScores(tour.matches.map((m) => ({ s1: String(m.team1Score ?? ''), s2: String(m.team2Score ?? '') })));
                }}
                className="rounded-full border border-white/12 px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/5 disabled:opacity-50"
              >
                {'\u041e\u0442\u043c\u0435\u043d\u0430'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
