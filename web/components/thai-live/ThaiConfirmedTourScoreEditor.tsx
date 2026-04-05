'use client';

import { useEffect, useState } from 'react';
import type { ThaiOperatorTourSummary } from '@/lib/thai-live/types';

export function ThaiConfirmedTourScoreEditor({
  tournamentId,
  roundType,
  pointLimit,
  tour,
  onSaved,
}: {
  tournamentId: string;
  roundType: 'r1' | 'r2';
  pointLimit: number;
  tour: ThaiOperatorTourSummary;
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

  useEffect(() => {
    setScores(tour.matches.map((m) => ({ s1: String(m.team1Score ?? ''), s2: String(m.team2Score ?? '') })));
    setErr(null);
  }, [tour.tourId, snapshot]);

  if (tour.status !== 'confirmed') {
    return null;
  }

  async function submit() {
    setErr(null);
    const trimmed = reason.trim();
    if (trimmed.length < 4) {
      setErr('Укажите причину (не короче 4 символов).');
      return;
    }
    const matches = tour.matches.map((m, idx) => ({
      matchId: m.matchId,
      team1Score: Math.trunc(Number(scores[idx]?.s1)),
      team2Score: Math.trunc(Number(scores[idx]?.s2)),
    }));
    if (matches.some((m) => !Number.isFinite(m.team1Score) || !Number.isFinite(m.team2Score))) {
      setErr('Введите целые числа для всех полей счёта.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/thai-correct-tour`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tourId: tour.tourId, reason: trimmed, matches }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось сохранить');
      }
      setOpen(false);
      setReason('');
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/90 underline decoration-amber-400/40 underline-offset-2 hover:text-amber-100"
        >
          Исправить счёт тура
        </button>
      ) : (
        <div className="space-y-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-amber-200/85">
            {roundType.toUpperCase()} · лимит {pointLimit} (победитель набирает ровно {pointLimit})
          </div>
          <div className="space-y-2">
            {tour.matches.map((match, idx) => (
              <div key={match.matchId} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-xs text-white/80">
                  <span className="text-[#8f7c4a]">M{match.matchNo}</span>{' '}
                  <span className="text-white/70">{match.team1Label}</span>
                  <span className="px-1 text-[#7d8498]">vs</span>
                  <span className="text-white/70">{match.team2Label}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
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
                    className="w-14 rounded-lg border border-white/15 bg-[#0f0f18] px-2 py-1.5 text-center text-sm font-semibold text-white"
                    aria-label={`Счёт команды 1, матч ${match.matchNo}`}
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
                    className="w-14 rounded-lg border border-white/15 bg-[#0f0f18] px-2 py-1.5 text-center text-sm font-semibold text-white"
                    aria-label={`Счёт команды 2, матч ${match.matchNo}`}
                  />
                </div>
              </div>
            ))}
          </div>
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#7d8498]">Причина исправления</span>
            <textarea
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              rows={2}
              placeholder="Например: судья перепутал стороны при вводе"
              className="mt-1 w-full rounded-xl border border-white/12 bg-[#0f0f18] px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
          </label>
          {err ? <p className="text-xs text-red-300">{err}</p> : null}
          <p className="text-[10px] leading-relaxed text-[#7d8498]">
            После сохранения пересчитается таблица тура на корте. Если уже идёт или завершён R2, состав зон R2 от этого не
            меняется — при необходимости обсудите сброс с администратором.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => submit()}
              className="rounded-full border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-amber-100 transition hover:bg-amber-500/25 disabled:opacity-50"
            >
              {busy ? 'Сохраняем…' : 'Сохранить счёт'}
            </button>
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
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
