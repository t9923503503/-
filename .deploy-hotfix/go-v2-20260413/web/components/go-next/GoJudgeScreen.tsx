'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GoJudgeSnapshot, GoWalkover } from '@/lib/go-next/types';
import { GoCourtTabs } from './GoCourtTabs';
import { GoMatchCard } from './GoMatchCard';

export function GoJudgeScreen({ pin, initialSnapshot }: { pin: string; initialSnapshot?: GoJudgeSnapshot | null }) {
  const [snapshot, setSnapshot] = useState<GoJudgeSnapshot | null>(initialSnapshot ?? null);
  const [currentCourt, setCurrentCourt] = useState<number>(initialSnapshot?.currentCourt ?? 1);
  const [currentMatchId, setCurrentMatchId] = useState<string>('');
  const [scoreA, setScoreA] = useState<number[]>([]);
  const [scoreB, setScoreB] = useState<number[]>([]);
  const [walkover, setWalkover] = useState<GoWalkover>('none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadSnapshot = useCallback(async () => {
    if (!pin) return;
    const response = await fetch(`/api/go/judge/${encodeURIComponent(pin)}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) return;
    setSnapshot(payload as GoJudgeSnapshot);
    setCurrentCourt((payload as GoJudgeSnapshot).currentCourt || 1);
  }, [pin]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const court = useMemo(
    () => snapshot?.courts.find((item) => item.courtNo === currentCourt) ?? snapshot?.courts[0] ?? null,
    [currentCourt, snapshot?.courts],
  );

  const match = useMemo(() => {
    const fallbackId = court?.currentMatchId ?? '';
    const wantedId = currentMatchId || fallbackId;
    return court?.matches.find((item) => item.matchId === wantedId) ?? court?.matches[0] ?? null;
  }, [court, currentMatchId]);

  useEffect(() => {
    if (!match) return;
    setCurrentMatchId(match.matchId);
    setScoreA(match.scoreA ?? []);
    setScoreB(match.scoreB ?? []);
    setWalkover('none');
  }, [match?.matchId]);

  function addPoint(team: 'A' | 'B') {
    const index = Math.max(scoreA.length, scoreB.length) - 1;
    const nextIndex = index < 0 ? 0 : index;
    if (team === 'A') {
      const next = [...scoreA];
      next[nextIndex] = (next[nextIndex] ?? 0) + 1;
      setScoreA(next);
      if (scoreB[nextIndex] == null) {
        const s = [...scoreB];
        s[nextIndex] = 0;
        setScoreB(s);
      }
      return;
    }
    const next = [...scoreB];
    next[nextIndex] = (next[nextIndex] ?? 0) + 1;
    setScoreB(next);
    if (scoreA[nextIndex] == null) {
      const s = [...scoreA];
      s[nextIndex] = 0;
      setScoreA(s);
    }
  }

  function undoPoint(team: 'A' | 'B') {
    if (team === 'A') {
      const next = [...scoreA];
      const idx = next.length - 1;
      if (idx >= 0) next[idx] = Math.max(0, (next[idx] ?? 0) - 1);
      setScoreA(next);
      return;
    }
    const next = [...scoreB];
    const idx = next.length - 1;
    if (idx >= 0) next[idx] = Math.max(0, (next[idx] ?? 0) - 1);
    setScoreB(next);
  }

  async function submitScore() {
    if (!match) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/go/judge/${encodeURIComponent(pin)}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          walkover === 'none'
            ? {
                matchId: match.matchId,
                scoreA,
                scoreB,
              }
            : {
                matchId: match.matchId,
                walkover,
              },
        ),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const text = typeof payload?.error === 'string' ? payload.error : 'Не удалось сохранить счёт';
        throw new Error(text);
      }
      setSnapshot(payload as GoJudgeSnapshot);
      setWalkover('none');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить счёт');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-5">
      <h1 className="text-xl font-bold text-white">GO Judge</h1>
      <GoCourtTabs
        courts={(snapshot?.courts ?? []).map((item) => ({ courtNo: item.courtNo, label: item.label }))}
        currentCourt={currentCourt}
        onChange={setCurrentCourt}
      />

      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex flex-wrap gap-2">
          {(court?.matches ?? []).map((item) => (
            <button
              key={item.matchId}
              type="button"
              onClick={() => setCurrentMatchId(item.matchId)}
              className={`rounded-lg border px-2 py-1 text-xs ${
                item.matchId === currentMatchId
                  ? 'border-brand/60 bg-brand/20 text-brand'
                  : 'border-white/10 bg-white/5 text-white/70'
              }`}
            >
              Матч {item.matchNo}
            </button>
          ))}
        </div>
      </div>

      {match ? <GoMatchCard match={match} /> : null}

      {match ? (
        <section className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => addPoint('A')}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
            >
              +1 A
            </button>
            <button
              type="button"
              onClick={() => addPoint('B')}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
            >
              +1 B
            </button>
            <button
              type="button"
              onClick={() => undoPoint('A')}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
            >
              Undo A
            </button>
            <button
              type="button"
              onClick={() => undoPoint('B')}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
            >
              Undo B
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-white/60">Walkover:</span>
            <select
              value={walkover}
              onChange={(event) => setWalkover(event.target.value as GoWalkover)}
              className="rounded border border-white/15 bg-black/30 px-2 py-1 text-white"
            >
              <option value="none">none</option>
              <option value="team_a">team_a</option>
              <option value="team_b">team_b</option>
              <option value="mutual">mutual</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => void submitScore()}
            disabled={saving}
            className="mt-3 w-full rounded-lg border border-brand/60 bg-brand/20 px-3 py-2 text-sm font-semibold text-brand disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Submit Score'}
          </button>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
