'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GoJudgeActionName, GoJudgeMatchView, GoJudgeSnapshot, GoWalkover } from '@/lib/go-next/types';
import { GoCourtTabs } from './GoCourtTabs';

type TeamSide = 'A' | 'B';

function canScoreMatch(match: { teamA: { label: string }; teamB: { label: string } } | null): boolean {
  if (!match) return false;
  const a = String(match.teamA?.label || '').trim().toUpperCase();
  const b = String(match.teamB?.label || '').trim().toUpperCase();
  return Boolean(a) && Boolean(b) && a !== 'TBD' && b !== 'TBD';
}

function setTargetFor(match: GoJudgeMatchView): number {
  const idx = match.judgeState.activeSetIndex;
  if (idx >= 2) return 15;
  const firstA = match.scoreA[0] ?? 0;
  const firstB = match.scoreB[0] ?? 0;
  if (Math.max(firstA, firstB) >= 15 && Math.max(firstA, firstB) < 21) return 15;
  return 21;
}

function isWinningPointLabel(match: GoJudgeMatchView, team: TeamSide): boolean {
  const idx = match.judgeState.activeSetIndex;
  const a = match.scoreA[idx] ?? 0;
  const b = match.scoreB[idx] ?? 0;
  const nextA = team === 'A' ? a + 1 : a;
  const nextB = team === 'B' ? b + 1 : b;
  const target = setTargetFor(match);
  return Math.max(nextA, nextB) >= target && Math.abs(nextA - nextB) >= 2;
}

function currentServerName(match: GoJudgeMatchView): string {
  const current = match.judgeState.currentServer;
  if (!current) return 'не выбран';
  const players = current.team === 'A' ? match.teamA.players : match.teamB.players;
  return players.find((item) => item.slot === current.playerSlot)?.name || 'не выбран';
}

function shortTeamLabel(label: string): string {
  const normalized = String(label || '').trim();
  if (!normalized) return 'TBD';
  return normalized;
}

function matchCardTitle(match: GoJudgeMatchView): string {
  return `${shortTeamLabel(match.teamA.label)} vs ${shortTeamLabel(match.teamB.label)}`;
}

function nextMatchOnCourt(matches: GoJudgeMatchView[], currentMatchId: string): GoJudgeMatchView | null {
  const idx = matches.findIndex((item) => item.matchId === currentMatchId);
  const pool = idx >= 0 ? matches.slice(idx + 1) : matches;
  const candidate = pool.find((item) => item.status !== 'finished' && canScoreMatch(item));
  return candidate ?? null;
}

export function GoJudgeScreen({ pin, initialSnapshot }: { pin: string; initialSnapshot?: GoJudgeSnapshot | null }) {
  const [snapshot, setSnapshot] = useState<GoJudgeSnapshot | null>(initialSnapshot ?? null);
  const [currentCourt, setCurrentCourt] = useState<number>(initialSnapshot?.currentCourt ?? 1);
  const [currentMatchId, setCurrentMatchId] = useState<string>('');
  const [walkover, setWalkover] = useState<GoWalkover>('none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pauseHint, setPauseHint] = useState('');

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
    return (
      court?.matches.find((item) => item.matchId === wantedId) ??
      court?.matches.find((item) => canScoreMatch(item) && item.status !== 'finished') ??
      court?.matches.find((item) => item.status !== 'finished') ??
      court?.matches[0] ??
      null
    );
  }, [court, currentMatchId]);

  useEffect(() => {
    if (!match) return;
    setCurrentMatchId(match.matchId);
    setWalkover('none');
    setError('');
  }, [match?.matchId]);

  async function applyAction(action: GoJudgeActionName, payload: Record<string, unknown> = {}) {
    if (!match) return;
    setError('');
    const response = await fetch(`/api/go/judge/${encodeURIComponent(pin)}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matchId: match.matchId,
        action,
        payload,
        expectedVersion: match.version,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 409) {
      if (body?.snapshot) setSnapshot(body.snapshot as GoJudgeSnapshot);
      else await loadSnapshot();
      throw new Error('Версия обновилась на другом устройстве. Данные синхронизированы.');
    }
    if (!response.ok) {
      throw new Error(typeof body?.error === 'string' ? body.error : 'Не удалось выполнить действие');
    }
    setSnapshot(body as GoJudgeSnapshot);
  }

  async function startMatch(target: GoJudgeMatchView) {
    setCurrentMatchId(target.matchId);
    if (!canScoreMatch(target)) {
      setError('Матч ещё не сформирован: пары TBD.');
      return;
    }
    try {
      setPauseHint('');
      await applyAction('mark_live');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось запустить матч');
    }
  }

  async function quickSwitchServe() {
    if (!match) return;
    const current = match.judgeState.currentServer;
    if (!current) {
      setError('Сначала выберите подающего.');
      return;
    }
    const nextTeam: TeamSide = current.team === 'A' ? 'B' : 'A';
    const nextSlot = match.judgeState.lastServer[nextTeam] ?? match.judgeState.startServerByTeam[nextTeam] ?? 1;
    try {
      await applyAction('manual_server_override', { team: nextTeam, playerSlot: nextSlot });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сменить подачу');
    }
  }

  async function submitScore() {
    if (!match) return;
    if (!canScoreMatch(match)) {
      setError('Матч ещё не сформирован: пары TBD. Выберите матч с готовыми участниками.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/go/judge/${encodeURIComponent(pin)}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          walkover === 'none'
            ? { matchId: match.matchId, scoreA: match.scoreA, scoreB: match.scoreB }
            : { matchId: match.matchId, walkover },
        ),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const text = typeof payload?.error === 'string' ? payload.error : 'Не удалось завершить матч';
        throw new Error(text);
      }
      const nextSnapshot = payload as GoJudgeSnapshot;
      setSnapshot(nextSnapshot);
      setWalkover('none');

      const refreshedCourt =
        nextSnapshot.courts.find((item) => item.courtNo === currentCourt) ?? nextSnapshot.courts[0] ?? null;
      if (refreshedCourt) {
        const nextMatch = nextMatchOnCourt(refreshedCourt.matches, match.matchId);
        if (nextMatch) {
          setCurrentMatchId(nextMatch.matchId);
          setPauseHint('Пауза между матчами: проверьте готовность команд и подтвердите старт следующей игры.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось завершить матч');
    } finally {
      setSaving(false);
    }
  }

  const activeSetIndex = match?.judgeState.activeSetIndex ?? 0;
  const sideSwapped = match?.judgeState.manualSideSwap || false;
  const leftSide: TeamSide = sideSwapped ? 'B' : 'A';
  const rightSide: TeamSide = sideSwapped ? 'A' : 'B';
  const leftTeam = leftSide === 'A' ? match?.teamA : match?.teamB;
  const rightTeam = rightSide === 'A' ? match?.teamA : match?.teamB;
  const leftPoints = leftSide === 'A' ? match?.scoreA[activeSetIndex] ?? 0 : match?.scoreB[activeSetIndex] ?? 0;
  const rightPoints = rightSide === 'A' ? match?.scoreA[activeSetIndex] ?? 0 : match?.scoreB[activeSetIndex] ?? 0;
  const blocked = Boolean(match?.judgeState.sideSwap.pending || match?.judgeState.tto.pending);
  const isLive = match?.status === 'live';
  const currentServer = match ? currentServerName(match) : 'не выбран';
  const setSummary = `Сет ${activeSetIndex + 1} • ${leftPoints}:${rightPoints}`;
  const matchSummary = match ? `${match.setsA}:${match.setsB}` : '0:0';
  const nextMatch = match && court ? nextMatchOnCourt(court.matches, match.matchId) : null;

  return (
    <div className="min-h-screen bg-[#070b18] text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 pb-6 pt-3">
        <header className="rounded-2xl border border-white/15 bg-slate-900/80 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-white/90">Судья • Корт {court?.label ?? currentCourt}</div>
            <div className="font-mono text-xs text-white/75">{String(pin || '').toUpperCase()}</div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80"
            >
              Назад
            </button>
            <a
              href={snapshot?.tournamentId ? `/go/${encodeURIComponent(snapshot.tournamentId)}/live` : '/go'}
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white/85"
            >
              Вернуться в расписание
            </a>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <GoCourtTabs
              courts={(snapshot?.courts ?? []).map((item) => ({ courtNo: item.courtNo, label: item.label }))}
              currentCourt={currentCourt}
              onChange={setCurrentCourt}
            />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {(court?.matches ?? []).map((item) => {
              const selected = item.matchId === currentMatchId;
              const live = item.status === 'live';
              const finished = item.status === 'finished';
              const ready = canScoreMatch(item);
              return (
                <button
                  key={item.matchId}
                  type="button"
                  onClick={() => {
                    setCurrentMatchId(item.matchId);
                    setPauseHint('');
                  }}
                  className={`min-w-[270px] rounded-xl border px-3 py-2 text-left ${
                    selected
                      ? 'border-cyan-300/70 bg-cyan-400/15'
                      : live
                        ? 'border-orange-300/60 bg-orange-500/15'
                        : 'border-white/15 bg-white/5'
                  }`}
                >
                  <div className="line-clamp-2 text-xs font-semibold text-white">{matchCardTitle(item)}</div>
                  <div className="mt-1 text-[11px] text-white/70">
                    {live ? 'LIVE' : finished ? 'Завершён' : ready ? 'Готов к старту' : 'Ожидает состав'}
                  </div>
                </button>
              );
            })}
          </div>
        </header>

        {pauseHint ? (
          <section className="rounded-xl border border-amber-300/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {pauseHint}
          </section>
        ) : null}

        {match ? (
          <>
            <section className="rounded-2xl border border-orange-300/45 bg-orange-500/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 rounded-lg border border-orange-300/60 bg-orange-500/20 px-3 py-1 text-sm font-black tracking-wide text-orange-100">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full bg-orange-300 ${isLive ? 'animate-pulse' : ''}`} />
                  {isLive ? 'LIVE' : 'ГОТОВНОСТЬ'}
                </div>
                <div className="text-sm font-semibold text-white/90">{setSummary}</div>
                <div className="text-sm text-white/80">Счёт по сетам: {matchSummary}</div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/15 bg-slate-900/80 p-3">
              <div className="text-center text-lg font-bold text-white">{shortTeamLabel(match.teamA.label)}</div>
              <div className="text-center text-sm text-white/60">vs</div>
              <div className="text-center text-lg font-bold text-white">{shortTeamLabel(match.teamB.label)}</div>
              <div className="mt-2 text-center text-xs text-white/70">{match.context}</div>
            </section>

            <section className="grid gap-3 lg:grid-cols-[1fr_320px_1fr]">
              <article className="rounded-2xl border border-amber-300/40 bg-amber-500/10 p-3">
                <div className="text-center text-lg font-black text-amber-100">{leftTeam?.label ?? 'TBD'}</div>
                <div className="mt-2 text-center text-7xl font-black text-amber-100">{leftPoints}</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={blocked || !match.judgeState.currentServer}
                    onClick={() => void applyAction('point_won', { winner: leftSide })}
                    className="min-h-16 rounded-xl border border-amber-300/60 bg-amber-400/20 px-3 py-3 text-xl font-black text-amber-100 disabled:opacity-50"
                  >
                    {isWinningPointLabel(match, leftSide) ? 'Победное очко' : '+1'}
                  </button>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => void applyAction('adjust_point', { team: leftSide, delta: -1 })}
                    className="min-h-16 rounded-xl border border-amber-300/35 bg-slate-950/60 px-3 py-3 text-xl font-black text-amber-100 disabled:opacity-50"
                  >
                    -1
                  </button>
                </div>
              </article>

              <article className="rounded-2xl border border-cyan-300/35 bg-slate-900/80 p-3">
                <div className="text-center text-lg font-black text-cyan-100">{setSummary}</div>
                <div className="mt-2 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-center">
                  <div className="text-sm text-white/70">Подача: {currentServer}</div>
                  {match.judgeState.currentServer ? (
                    <button
                      type="button"
                      onClick={() => void quickSwitchServe()}
                      className="mt-2 min-h-14 w-full rounded-lg border border-white/20 bg-white/5 px-2 py-2 text-sm font-semibold text-white/90"
                    >
                      Смена подачи
                    </button>
                  ) : null}
                </div>
                {!match.judgeState.currentServer ? (
                  <div className="mt-2 rounded-xl border border-amber-300/55 bg-amber-500/15 p-2">
                    <div className="text-sm font-semibold text-amber-100">Подача не выбрана</div>
                    <div className="mt-1 text-xs text-amber-100/85">Выберите подающего перед стартом розыгрыша.</div>
                  </div>
                ) : null}
              </article>

              <article className="rounded-2xl border border-cyan-300/45 bg-cyan-500/10 p-3">
                <div className="text-center text-lg font-black text-cyan-100">{rightTeam?.label ?? 'TBD'}</div>
                <div className="mt-2 text-center text-7xl font-black text-cyan-100">{rightPoints}</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={blocked || !match.judgeState.currentServer}
                    onClick={() => void applyAction('point_won', { winner: rightSide })}
                    className="min-h-16 rounded-xl border border-cyan-300/60 bg-cyan-400/20 px-3 py-3 text-xl font-black text-cyan-100 disabled:opacity-50"
                  >
                    {isWinningPointLabel(match, rightSide) ? 'Победное очко' : '+1'}
                  </button>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => void applyAction('adjust_point', { team: rightSide, delta: -1 })}
                    className="min-h-16 rounded-xl border border-cyan-300/35 bg-slate-950/60 px-3 py-3 text-xl font-black text-cyan-100 disabled:opacity-50"
                  >
                    -1
                  </button>
                </div>
              </article>
            </section>

            <section className="rounded-xl border border-white/15 bg-slate-900/70 p-3">
              <div className="text-xs font-semibold uppercase text-white/70">Выбрать подающего</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                  <div className="mb-2 text-xs text-white/70">{match.teamA.label}</div>
                  <div className="grid grid-cols-1 gap-2">
                    {match.teamA.players.map((player) => (
                      <button
                        key={`a-${player.slot}`}
                        type="button"
                        onClick={() => void applyAction('set_start_server', { team: 'A', playerSlot: player.slot })}
                        className="min-h-14 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-sm font-semibold text-white/90"
                      >
                        {player.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                  <div className="mb-2 text-xs text-white/70">{match.teamB.label}</div>
                  <div className="grid grid-cols-1 gap-2">
                    {match.teamB.players.map((player) => (
                      <button
                        key={`b-${player.slot}`}
                        type="button"
                        onClick={() => void applyAction('set_start_server', { team: 'B', playerSlot: player.slot })}
                        className="min-h-14 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-sm font-semibold text-white/90"
                      >
                        {player.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {match.judgeState.sideSwap.pending ? (
              <section className="rounded-xl border border-amber-400/45 bg-amber-500/10 p-3">
                <div className="text-sm text-amber-100">Нужна смена сторон. Ввод очков временно заблокирован.</div>
                <button
                  type="button"
                  onClick={() => void applyAction('confirm_side_swap')}
                  className="mt-2 min-h-14 rounded-lg border border-amber-300/60 bg-amber-400/20 px-3 py-2 text-sm font-semibold text-amber-100"
                >
                  Подтвердить смену сторон
                </button>
              </section>
            ) : null}
            {match.judgeState.tto.pending ? (
              <section className="rounded-xl border border-cyan-400/45 bg-cyan-500/10 p-3">
                <div className="text-sm text-cyan-100">Технический тайм-аут (TTO). Подтвердите продолжение.</div>
                <button
                  type="button"
                  onClick={() => void applyAction('confirm_tto')}
                  className="mt-2 min-h-14 rounded-lg border border-cyan-300/60 bg-cyan-400/20 px-3 py-2 text-sm font-semibold text-cyan-100"
                >
                  Подтвердить TTO
                </button>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <button
                type="button"
                onClick={() => void startMatch(match)}
                disabled={!canScoreMatch(match) || match.status === 'finished'}
                className="min-h-14 rounded-xl border border-emerald-300/60 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-50"
              >
                Начать матч
              </button>
              <button
                type="button"
                onClick={() => void applyAction('set_timeout', { team: leftSide })}
                className="min-h-14 rounded-xl border border-white/20 bg-slate-900/70 px-3 py-2 text-sm font-semibold text-white/90"
              >
                Тайм-аут (Л): {match.judgeState.timeouts.teamA}
              </button>
              <button
                type="button"
                onClick={() => void applyAction('set_timeout', { team: rightSide })}
                className="min-h-14 rounded-xl border border-white/20 bg-slate-900/70 px-3 py-2 text-sm font-semibold text-white/90"
              >
                Тайм-аут (П): {match.judgeState.timeouts.teamB}
              </button>
              <button
                type="button"
                onClick={() => void applyAction('undo')}
                className="min-h-14 rounded-xl border border-white/20 bg-slate-900/70 px-3 py-2 text-sm font-semibold text-white/90"
              >
                Отмена последнего
              </button>
              <button
                type="button"
                onClick={() => void applyAction('replay_rally')}
                className="min-h-14 rounded-xl border border-white/20 bg-slate-900/70 px-3 py-2 text-sm font-semibold text-white/90"
              >
                Спорный мяч
              </button>
            </section>

            {nextMatch ? (
              <section className="rounded-xl border border-cyan-300/40 bg-cyan-500/10 p-3">
                <div className="text-xs uppercase tracking-wide text-cyan-100/85">Далее на этом корте</div>
                <div className="mt-1 text-sm font-semibold text-cyan-100">{matchCardTitle(nextMatch)}</div>
                <button
                  type="button"
                  onClick={() => void startMatch(nextMatch)}
                  className="mt-2 min-h-14 rounded-lg border border-cyan-300/60 bg-cyan-400/20 px-4 py-2 text-sm font-semibold text-cyan-100"
                >
                  Начать следующий матч
                </button>
              </section>
            ) : null}

            <button
              type="button"
              onClick={() => void submitScore()}
              disabled={saving || !canScoreMatch(match)}
              className="min-h-16 rounded-2xl border border-red-300/70 bg-red-500/20 px-4 py-3 text-lg font-black text-red-100 disabled:opacity-50"
            >
              {saving ? 'Завершаем матч…' : 'Завершить матч'}
            </button>
          </>
        ) : null}

        {error ? <p className="rounded-lg border border-red-400/45 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
        {!match ? <p className="rounded-lg border border-white/15 bg-white/5 p-3 text-sm text-white/75">Игра на корте пока недоступна.</p> : null}
        {match && !canScoreMatch(match) ? (
          <p className="rounded-lg border border-amber-400/45 bg-amber-500/10 p-3 text-sm text-amber-200">
            Матч ещё не сформирован: пары TBD. Выберите матч с готовыми участниками.
          </p>
        ) : null}
      </div>
    </div>
  );
}
