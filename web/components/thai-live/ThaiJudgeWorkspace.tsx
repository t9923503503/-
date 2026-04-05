'use client';

import Link from 'next/link';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  buildThaiJudgeDraftKey,
  parseThaiJudgeDraft,
  resolveThaiJudgeDraftState,
  serializeThaiJudgeDraft,
} from '@/lib/thai-live/draft';
import { clampThaiJudgeScore } from '@/lib/thai-ui-helpers';
import type {
  ThaiJudgeCourtNavItem,
  ThaiJudgeMatchView,
  ThaiJudgeSnapshot,
  ThaiJudgeTeamView,
  ThaiJudgeTourView,
} from '@/lib/thai-live/types';

type ToastTone = 'info' | 'success' | 'error';

interface ToastState {
  tone: ToastTone;
  message: string;
}

interface ScoreEditorState {
  matchId: string;
  side: 'team1' | 'team2';
  value: string;
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

function formatTeamNames(team: ThaiJudgeTeamView): string {
  return team.players.map((player) => player.name).join(' / ');
}

function formatTeamRoles(team: ThaiJudgeTeamView): string {
  return team.players.map((player) => (player.role === 'primary' ? 'primary' : 'secondary')).join(' / ');
}

function resolveCourtChipLabel(snapshot: ThaiJudgeSnapshot, court: ThaiJudgeCourtNavItem): string {
  if (snapshot.roundType === 'r2') return court.label.toUpperCase();
  return `К${court.courtNo}`;
}

function resolveJudgeHeadline(snapshot: ThaiJudgeSnapshot): string {
  if (snapshot.roundType === 'r2') return snapshot.courtLabel.toUpperCase();
  return `КОРТ ${snapshot.courtLabel}`;
}

function resolveJudgeSlotPair(snapshot: ThaiJudgeSnapshot): string {
  const r1Round = snapshot.roundNav.find((round) => round.roundType === 'r1');
  const r2Round = snapshot.roundNav.find((round) => round.roundType === 'r2');
  const left = r1Round?.courtLabel ? `R1 ${r1Round.courtLabel.toUpperCase()}` : 'R1';
  const right = r2Round?.courtLabel ? `R2 ${r2Round.courtLabel.toUpperCase()}` : 'R2';
  return `${left} -> ${right}`;
}

function formatStandingDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function courtStatusLabel(status: ThaiJudgeCourtNavItem['currentTourStatus']): string {
  if (status === 'finished') return 'OK';
  return 'LIVE';
}

function courtStatusDotClass(status: ThaiJudgeCourtNavItem['currentTourStatus']): string {
  if (status === 'finished') return 'bg-emerald-300';
  return 'bg-amber-300';
}

function tourTabTone(tour: ThaiJudgeTourView, active: boolean): string {
  if (active) return 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]';
  if (tour.isEditable) return 'border-[#5b4713] bg-[#18140d] text-[#ffd24a]';
  if (tour.status === 'confirmed') return 'border-white/10 bg-white/5 text-white/80';
  return 'border-white/10 bg-white/5 text-[#838aa0]';
}

function roundTabTone(round: ThaiJudgeSnapshot['roundNav'][number], active: boolean): string {
  if (active) return 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]';
  if (!round.isAvailable) return 'border-white/10 bg-white/5 text-[#6f7588]';
  if (round.status === 'finished') return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100';
  if (round.status === 'live') return 'border-[#5b4713] bg-[#18140d] text-[#ffd24a]';
  return 'border-white/10 bg-white/5 text-[#838aa0]';
}

function roundStatusLabel(round: ThaiJudgeSnapshot['roundNav'][number]): string {
  if (!round.isAvailable) return 'скоро';
  if (round.status === 'finished') return 'OK';
  if (round.status === 'live') return 'LIVE';
  return 'Ждите';
}

function resolveRoundTabLabel(round: ThaiJudgeSnapshot['roundNav'][number]): string {
  const roundKey = round.roundType.toUpperCase();
  const courtKey = round.courtLabel ? round.courtLabel.toUpperCase() : null;
  return courtKey ? `${roundKey} ${courtKey}` : roundKey;
}

/**
 * Thai judge раньше регистрировал отдельный SW (`thai-judge-sw.js`), который
 * перехватывал `/_next/static/*`. На Safari/iPad WebKit это давало «страницу без стилей»
 * из‑за кэша SW. Регистрацию убрали; при заходе снимаем оставшиеся court-scoped SW
 * и один раз перезагружаем страницу, чтобы браузер заново взял CSS с сети.
 */
function validateMatchScore(
  match: ThaiJudgeMatchView,
  score: { team1: number; team2: number },
  pointLimit: number,
): string | null {
  if (score.team1 < 0 || score.team2 < 0) return `Матч ${match.matchNo}: счёт не может быть отрицательным`;
  if (score.team1 === score.team2) return `Матч ${match.matchNo}: ничья недопустима`;
  if (Math.max(score.team1, score.team2) !== pointLimit) {
    return `Матч ${match.matchNo}: победитель должен набрать ровно ${pointLimit}`;
  }
  return null;
}

let globalAudioCtx: AudioContext | null = null;
function playBeep() {
  try {
    if (!globalAudioCtx) {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      globalAudioCtx = new AudioContextCtor();
    }
    if (globalAudioCtx.state === 'suspended') {
      void globalAudioCtx.resume();
    }
    const osc = globalAudioCtx.createOscillator();
    const gain = globalAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(globalAudioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, globalAudioCtx.currentTime);
    gain.gain.setValueAtTime(0.05, globalAudioCtx.currentTime);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, globalAudioCtx.currentTime + 0.1);
    osc.stop(globalAudioCtx.currentTime + 0.1);
  } catch (e) {}
}

export function ThaiJudgeWorkspace({
  initialSnapshot,
  navigationMode = 'standalone',
  onSnapshotChange,
}: {
  initialSnapshot: ThaiJudgeSnapshot;
  navigationMode?: 'standalone' | 'embedded';
  onSnapshotChange?: (snapshot: ThaiJudgeSnapshot) => void;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [scores, setScores] = useState<Record<string, { team1: number; team2: number }>>({});
  const [touchedMatches, setTouchedMatches] = useState<Record<string, true>>({});
  const [submitting, setSubmitting] = useState(false);
  const [online, setOnline] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [selectedTourNo, setSelectedTourNo] = useState(initialSnapshot.currentTourNo);
  const [scoreEditor, setScoreEditor] = useState<ScoreEditorState | null>(null);
  const [standingsOpen, setStandingsOpen] = useState(false);
  const scoreTapRef = useRef<Record<string, number>>({});
  const scoreEditorInputRef = useRef<HTMLInputElement | null>(null);
  const cancelScoreEditorRef = useRef(false);

  const activeSnapshot = snapshot.kind === 'active' ? snapshot : null;
  const currentTourView =
    snapshot.tours.find((tour) => tour.tourNo === snapshot.currentTourNo) ?? snapshot.tours[0] ?? null;
  const selectedTour = snapshot.tours.find((tour) => tour.tourNo === selectedTourNo) ?? currentTourView;
  const selectedMatches = selectedTour?.matches ?? [];
  const isViewingEditableTour = Boolean(
    selectedTour &&
      activeSnapshot &&
      selectedTour.tourNo === activeSnapshot.currentTourNo &&
      selectedTour.isEditable,
  );
  const draftKey =
    activeSnapshot && activeSnapshot.tourNo != null
      ? buildThaiJudgeDraftKey({
          courtId: activeSnapshot.courtId,
          roundId: activeSnapshot.roundId,
          tourNumber: activeSnapshot.tourNo,
        })
      : null;

  useEffect(() => {
    setSnapshot(initialSnapshot);
    setSelectedTourNo(initialSnapshot.currentTourNo);
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
    let cancelled = false;
    (async () => {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        const courtRegs = regs.filter((r) => {
          try {
            return r.scope.includes('/court/');
          } catch {
            return false;
          }
        });
        if (!courtRegs.length) return;
        await Promise.all(courtRegs.map((r) => r.unregister()));
        if (!cancelled) window.location.reload();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!draftKey || snapshot.kind !== 'active') {
      setScores({});
      setTouchedMatches({});
      return;
    }

    const draft = parseThaiJudgeDraft(window.localStorage.getItem(draftKey));
    const resolved = resolveThaiJudgeDraftState({ snapshot, draft });
    if (resolved.shouldClearDraft) {
      window.localStorage.removeItem(draftKey);
    }
    setScores(resolved.initialScores);
    setTouchedMatches(
      Object.fromEntries(Object.keys(resolved.initialScores).map((matchId) => [matchId, true])) as Record<string, true>,
    );
    if (resolved.restoredFromDraft) {
      setToast({ tone: 'info', message: 'Черновик восстановлен.' });
    }
  }, [draftKey, snapshot]);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!scoreEditor) return;
    scoreEditorInputRef.current?.focus();
    scoreEditorInputRef.current?.select();
  }, [scoreEditor]);

  const scoreErrors = useMemo(() => {
    if (!isViewingEditableTour) return [];
    return selectedMatches
      .map((match) => {
        const score = scores[match.matchId] ?? {
          team1: Number(match.team1Score ?? 0),
          team2: Number(match.team2Score ?? 0),
        };
        return validateMatchScore(match, score, snapshot.pointLimit);
      })
      .filter((value): value is string => Boolean(value));
  }, [isViewingEditableTour, scores, selectedMatches, snapshot.pointLimit]);

  const touchedCount = useMemo(() => Object.keys(touchedMatches).length, [touchedMatches]);
  const canConfirm = Boolean(
    isViewingEditableTour &&
      selectedMatches.length === 2 &&
      touchedCount === 2 &&
      scoreErrors.length === 0 &&
      !submitting,
  );

  function writeDraft(nextScores: Record<string, { team1: number; team2: number }>) {
    if (!draftKey || typeof window === 'undefined') return;
    window.localStorage.setItem(draftKey, JSON.stringify(serializeThaiJudgeDraft(nextScores)));
  }

  function bumpScore(matchId: string, side: 'team1' | 'team2', delta: number) {
    if (!isViewingEditableTour) return;
    playBeep();
    setScores((previous) => {
      const current = previous[matchId] ?? { team1: 0, team2: 0 };
      const next = {
        ...current,
        [side]: clampThaiJudgeScore(current[side] + delta, snapshot.pointLimit),
      };
      const nextScores = { ...previous, [matchId]: next };
      writeDraft(nextScores);
      return nextScores;
    });
    setTouchedMatches((previous) => ({ ...previous, [matchId]: true }));
  }

  function openScoreEditor(matchId: string, side: 'team1' | 'team2', value: number) {
    if (!isViewingEditableTour) return;
    cancelScoreEditorRef.current = false;
    setScoreEditor({ matchId, side, value: String(value) });
  }

  function handleScoreTap(matchId: string, side: 'team1' | 'team2', value: number) {
    if (!isViewingEditableTour) return;
    const tapKey = `${matchId}:${side}`;
    const now = Date.now();
    const previousTap = scoreTapRef.current[tapKey] ?? 0;
    scoreTapRef.current[tapKey] = now;
    if (now - previousTap <= 350) {
      scoreTapRef.current[tapKey] = 0;
      openScoreEditor(matchId, side, value);
    }
  }

  function applyManualScore(matchId: string, side: 'team1' | 'team2', rawValue: string) {
    if (!isViewingEditableTour) return;
    const normalizedValue = clampThaiJudgeScore(rawValue, snapshot.pointLimit);
    setScores((previous) => {
      const current = previous[matchId] ?? { team1: 0, team2: 0 };
      const next = {
        ...current,
        [side]: normalizedValue,
      };
      const nextScores = { ...previous, [matchId]: next };
      writeDraft(nextScores);
      return nextScores;
    });
    setTouchedMatches((previous) => ({ ...previous, [matchId]: true }));
    setScoreEditor(null);
  }

  async function handleConfirm() {
    if (!activeSnapshot || activeSnapshot.tourNo == null || !canConfirm) return;
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      setOnline(false);
      setToast({ tone: 'error', message: 'Нет сети. Ждите...' });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/thai/judge/${encodeURIComponent(activeSnapshot.pin)}/tour/${activeSnapshot.tourNo}/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            matches: activeSnapshot.matches.map((match) => ({
              matchId: match.matchId,
              team1Score: scores[match.matchId]?.team1 ?? 0,
              team2Score: scores[match.matchId]?.team2 ?? 0,
            })),
          }),
        },
      );

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        snapshot?: ThaiJudgeSnapshot;
      };
      if (!response.ok || !payload.snapshot) {
        setToast({ tone: 'error', message: payload.error || 'Не удалось подтвердить тур.' });
        return;
      }

      if (draftKey && typeof window !== 'undefined') {
        window.localStorage.removeItem(draftKey);
      }
      setSnapshot(payload.snapshot);
      setSelectedTourNo(payload.snapshot.currentTourNo);
      onSnapshotChange?.(payload.snapshot);
      setToast({ tone: 'success', message: payload.message || 'Тур подтверждён.' });
      if (payload.snapshot.kind === 'finished') {
        startTransition(() => router.refresh());
      }
    } catch {
      setToast({ tone: 'error', message: 'Нет сети. Ждите...' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={
        navigationMode === 'embedded'
          ? 'text-white'
          : 'min-h-screen min-h-[100dvh] bg-[radial-gradient(circle_at_top,rgba(255,210,74,0.08),transparent_14%),linear-gradient(180deg,#080813,#0d0d18_28%,#090913)] px-3 pb-8 pt-4 text-white'
      }
    >
      <div className={`mx-auto flex w-full max-w-[760px] flex-col ${navigationMode === 'embedded' ? 'gap-3' : 'gap-4'}`}>
        {navigationMode === 'standalone' && snapshot.courtNav.length > 1 ? (
          <nav className="overflow-x-auto">
            <div className="flex min-w-max items-center gap-1 rounded-[16px] border border-[#1f2033] bg-[#0d0d18]/92 p-1 shadow-[0_14px_40px_rgba(0,0,0,0.26)]">
              {snapshot.courtNav.map((court) => (
                <Link
                  key={court.courtId}
                  href={court.judgeUrl}
                  aria-current={court.isActive ? 'page' : undefined}
                  className={`relative flex min-w-[66px] shrink-0 flex-col items-center justify-center rounded-[10px] border px-3 py-2 font-heading uppercase transition ${
                    court.isActive
                      ? 'border-[#ffd24a] bg-white/6 shadow-[0_0_10px_rgba(255,210,74,0.18)]'
                      : 'border-[#2a2a44] bg-[#141422] text-[#8f96aa] hover:border-[#5a5a8e]'
                  }`}
                >
                  <span className={`absolute right-2 top-2 h-1.5 w-1.5 rounded-full ${courtStatusDotClass(court.currentTourStatus)}`} />
                  <span className={`text-[13px] font-black leading-none tracking-[0.03em] ${court.isActive ? 'text-white' : 'text-[#c6cad6]'}`}>
                    {resolveCourtChipLabel(snapshot, court)}
                  </span>
                  <span className={`mt-0.5 text-[8px] font-bold leading-none tracking-[0.24em] ${court.isActive ? 'text-[#ffd24a]' : 'text-[#7d8498]'}`}>
                    {courtStatusLabel(court.currentTourStatus)}
                  </span>
                </Link>
              ))}
            </div>
          </nav>
        ) : null}

        {navigationMode === 'standalone' ? (
          <header className="rounded-[24px] border border-[#33280f] bg-[linear-gradient(180deg,rgba(21,18,32,0.98),rgba(12,12,24,0.98))] px-4 py-4 shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.34em] text-[#8e7b48]">Thai Judge</div>
                <h1 className="mt-2 truncate text-3xl font-heading uppercase tracking-[0.08em] text-[#ffd24a] sm:text-4xl">
                  {resolveJudgeHeadline(snapshot)}
                </h1>
                <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8e7b48]">
                  {resolveJudgeSlotPair(snapshot)}
                </div>
                <p className="mt-2 text-sm text-[#c1c7d6]/82">
                  {snapshot.tournamentName} • до {snapshot.pointLimit}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.24em] ${connectionClasses(online)}`}>
                  {online ? 'ONLINE' : 'OFF'}
                </span>
                <span className="rounded-full border border-[#4b3c15] bg-[#1b160d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ffd24a]">
                  {snapshot.variant}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#aeb6c8]">
                  PIN {snapshot.pin}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-[#8a91a5]">
              <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1">R{snapshot.roundNo}</span>
              <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1">
                T{snapshot.currentTourNo}/{snapshot.tourCount}
              </span>
              {snapshot.tournamentDate ? (
                <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1">{snapshot.tournamentDate}</span>
              ) : null}
            </div>
          </header>
        ) : null}

        {toast ? <div className={`rounded-[18px] border px-4 py-3 text-sm font-medium shadow-[0_12px_40px_rgba(0,0,0,0.22)] ${toneClasses(toast.tone)}`}>{toast.message}</div> : null}

        <section className="rounded-[18px] border border-[#2a2a3f] bg-[linear-gradient(180deg,rgba(18,17,29,0.98),rgba(12,12,24,0.98))] px-3 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
          {navigationMode === 'standalone' ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                {snapshot.roundNav.map((round) => {
                  const isActive = round.isActive;
                  const disabled = !round.isAvailable || !round.judgeUrl;
                  const className = `rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] transition ${roundTabTone(round, isActive)} ${disabled ? 'cursor-not-allowed opacity-55' : ''}`;
                  if (disabled) return <span key={round.roundType} aria-disabled="true" className={className}>{resolveRoundTabLabel(round)}</span>;
                  return <Link key={round.roundType} href={round.judgeUrl ?? '/'} aria-current={isActive ? 'page' : undefined} className={className}>{resolveRoundTabLabel(round)}</Link>;
                })}
              </div>
              <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-[#7d8498]">{snapshot.roundNav.map((round) => `${round.label}: ${roundStatusLabel(round)}`).join(' • ')}</div>
            </>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {snapshot.tours.map((tour) => {
              const isActive = selectedTour?.tourNo === tour.tourNo;
              const disabled = tour.tourNo > snapshot.currentTourNo;
              return <button key={tour.tourId} type="button" disabled={disabled} onClick={() => setSelectedTourNo(tour.tourNo)} className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition ${tourTabTone(tour, isActive)} ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}>T{tour.tourNo}</button>;
            })}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-[#7d8498]">{selectedTour?.isEditable ? 'LIVE' : selectedTour?.status === 'confirmed' ? 'RO' : 'Ждите'}</div>
        </section>

        {(snapshot.kind !== 'active' || !selectedTour?.isEditable) && snapshot.message ? (
          <section className={`rounded-[24px] border px-5 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.4)] ${snapshot.kind === 'finished' ? 'border-[#ffd24a]/50 bg-[#ffd24a]/10 text-[#ffd24a] animate-pulse' : 'border-[#2a2a3f] bg-[linear-gradient(180deg,rgba(18,17,29,0.98),rgba(12,12,24,0.98))] text-[#c1c7d6]/86'}`}>
            <div className={`text-[12px] font-bold uppercase tracking-[0.24em] ${snapshot.kind === 'finished' ? 'text-[#ffd24a]' : 'text-[#8f7c4a]'}`}>
              {snapshot.kind === 'finished' ? 'ВНИМАНИЕ — КОРТ ЗАВЕРШЁН' : 'INFO'}
            </div>
            <div className={`mt-2 ${snapshot.kind === 'finished' ? 'text-lg font-bold' : 'text-sm'}`}>
              {snapshot.message}
              {snapshot.kind === 'finished' ? (
                <div className="mt-4 text-[13px] leading-relaxed text-white/90 font-medium">
                  Ожидайте, пока Главный Администратор запустит следующий этап (Раунд 2) из Панели управления турниром. 
                  <br/><br/>
                  <span className="text-[#ffd24a]/80 font-bold">Вы можете устно сообщить администратору, что ваш корт отыграл все игры!</span>
                  
                  <div className="mt-5 pt-4 border-t border-[#ffd24a]/20">
                    <p className="text-[11px] uppercase tracking-wider text-[#ffd24a]/80 mb-2">Как только админ запустит R2:</p>
                    <button 
                      type="button" 
                      onClick={() => window.location.reload()} 
                      className="w-full rounded-[14px] bg-[#ffd24a]/20 border border-[#ffd24a]/40 py-3 text-sm font-bold text-[#ffd24a] transition hover:bg-[#ffd24a]/30"
                    >
                      🔄 ПРОВЕРИТЬ ДОСТУП К R2 (Обновить)
                    </button>
                    <p className="mt-2 text-[11px] text-white/60 text-center leading-tight">Обновите страницу. После обновления сверху загорится вкладка "ROUND 2" — просто нажмите на неё, новые ссылки скидывать не нужно!</p>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="space-y-2.5">
          {selectedMatches.map((match) => {
            const liveScore = scores[match.matchId] ?? { team1: Number(match.team1Score ?? 0), team2: Number(match.team2Score ?? 0) };
            return (
              <article key={match.matchId} className={`border border-[#33280f] bg-[linear-gradient(180deg,rgba(18,17,29,0.98),rgba(12,12,24,0.98))] shadow-[0_20px_60px_rgba(0,0,0,0.3)] ${navigationMode === 'embedded' ? 'rounded-[16px] px-3 py-3' : 'rounded-[22px] px-4 py-4'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-[#8f7c4a]">M{match.matchNo}</div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-[#b8bfd0]">{selectedTour?.status === 'confirmed' ? 'OK' : selectedTour?.isEditable ? 'LIVE' : 'RO'}</div>
                </div>

                <div className="mt-2 space-y-2">
                  {[match.team1, match.team2].map((team, index) => {
                    const sideKey = index === 0 ? 'team1' : 'team2';
                    return (
                      <section key={`${match.matchId}-${team.side}`} className={`flex flex-col gap-2 rounded-[16px] border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${index === 0 ? 'border-emerald-500/35 bg-[linear-gradient(180deg,rgba(15,56,45,0.42),rgba(11,19,26,0.92))]' : 'border-[#31405e] bg-[linear-gradient(180deg,rgba(19,24,42,0.92),rgba(11,15,28,0.94))]'}`}>
                        <div className="min-w-0 w-full sm:flex-1 sm:pr-2">
                          <div className={`${navigationMode === 'embedded' ? 'text-sm' : 'text-sm sm:text-base'} break-words font-semibold leading-snug text-white`}>{formatTeamNames(team)}</div>
                          {navigationMode === 'standalone' ? <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[#7d8498]">{formatTeamRoles(team)}</div> : null}
                        </div>
                        <div className="flex shrink-0 items-center justify-end gap-2 sm:justify-start sm:gap-2.5">
                          <button type="button" disabled={!isViewingEditableTour} onClick={() => bumpScore(match.matchId, sideKey, -1)} className={`flex shrink-0 items-center justify-center rounded-[10px] border border-white/12 bg-white/8 font-black leading-none text-white transition hover:border-white/25 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-40 ${navigationMode === 'embedded' ? 'h-10 w-14 text-2xl' : 'h-11 w-16 text-3xl sm:h-12 sm:w-[4.5rem] sm:text-4xl'}`}>-</button>
                          {scoreEditor?.matchId === match.matchId && scoreEditor.side === sideKey ? (
                            <input
                              ref={scoreEditorInputRef}
                              type="number"
                              min={0}
                              max={snapshot.pointLimit}
                              inputMode="numeric"
                              value={scoreEditor.value}
                              onChange={(event) => setScoreEditor((current) => current && current.matchId === match.matchId && current.side === sideKey ? { ...current, value: event.target.value.replace(/[^\d]/g, '') } : current)}
                              onBlur={() => {
                                if (cancelScoreEditorRef.current) {
                                  cancelScoreEditorRef.current = false;
                                  return;
                                }
                                applyManualScore(match.matchId, sideKey, scoreEditor.value);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  applyManualScore(match.matchId, sideKey, scoreEditor.value);
                                } else if (event.key === 'Escape') {
                                  event.preventDefault();
                                  cancelScoreEditorRef.current = true;
                                  setScoreEditor(null);
                                }
                              }}
                              className={`rounded-[10px] border border-[#5b4713] bg-[#18140d] px-1 py-0 text-center font-black tabular-nums text-[#ffd24a] outline-none ${navigationMode === 'embedded' ? 'h-10 w-12 text-lg' : 'h-11 w-12 text-xl sm:h-12 sm:w-14 sm:text-2xl'}`}
                            />
                          ) : (
                            <button type="button" disabled={!isViewingEditableTour} onClick={() => handleScoreTap(match.matchId, sideKey, liveScore[sideKey])} className={`${navigationMode === 'embedded' ? 'h-10 w-9 text-2xl' : 'h-11 w-10 text-2xl sm:h-12 sm:w-11 sm:text-3xl'} text-center font-black tabular-nums text-[#ffd24a] disabled:cursor-default`} title="Двойной тап для ручного ввода">{liveScore[sideKey]}</button>
                          )}
                          <button type="button" disabled={!isViewingEditableTour} onClick={() => bumpScore(match.matchId, sideKey, 1)} className={`flex shrink-0 items-center justify-center border-2 border-[#5b4713] bg-[#ffd24a] font-black leading-none tracking-tight text-[#17130b] shadow-[0_3px_0_#3d2f0c] transition hover:bg-[#ffe07f] active:translate-y-px active:shadow-[0_1px_0_#3d2f0c] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:translate-y-0 ${navigationMode === 'embedded' ? 'h-14 w-24 rounded-xl text-4xl' : 'h-14 w-24 rounded-2xl text-4xl sm:h-16 sm:w-28 sm:rounded-2xl sm:text-5xl'}`}>+</button>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>

        {snapshot.standingsGroups.length ? (
          <section className="rounded-[18px] border border-[#2a2a3f] bg-[linear-gradient(180deg,rgba(18,17,29,0.98),rgba(12,12,24,0.98))] shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
            <button type="button" onClick={() => setStandingsOpen((value) => !value)} className="flex w-full items-center justify-between px-3 py-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#8f7c4a]">Табл.</span>
              <span className="text-[10px] uppercase tracking-[0.16em] text-[#aeb6c8]">{standingsOpen ? 'Скрыть' : 'Показать'}</span>
            </button>
            {standingsOpen ? (
              <div className="space-y-3 border-t border-white/8 p-2.5">
                {snapshot.standingsGroups.map((group) => (
                  <div key={group.pool} className="overflow-hidden rounded-[16px] border border-white/8 bg-[#11111d]">
                    <div className="border-b border-white/8 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#c7cada]">{group.label}</div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-xs text-white/88">
                        <thead className="bg-white/5 text-[10px] uppercase tracking-[0.18em] text-[#7d8498]">
                          <tr>
                            <th className="px-3 py-2">#</th>
                            <th className="px-3 py-2">Игрок</th>
                            {Array.from({ length: snapshot.tourCount }, (_, index) => <th key={index} className="px-2 py-2 text-center">T{index + 1}</th>)}
                            <th className="px-3 py-2 text-center">P</th>
                            <th className="px-3 py-2 text-center">М</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row) => (
                            <tr key={row.playerId} className="border-t border-white/6">
                              <td className="px-3 py-2 font-semibold text-[#ffd24a]">{row.place}</td>
                              <td className="px-3 py-2 font-semibold">{row.playerName}</td>
                              {row.tourDiffs.map((delta, index) => <td key={`${row.playerId}-${index}`} className={`px-2 py-2 text-center font-semibold ${delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-red-300' : 'text-white/50'}`}>{formatStandingDelta(delta)}</td>)}
                              <td className="px-3 py-2 text-center font-bold text-[#ffd24a]">{row.pointsP}</td>
                              <td className="px-3 py-2 text-center font-semibold">{row.place}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {scoreErrors.length ? <div className="rounded-[18px] border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{scoreErrors[0]}</div> : null}

        {isViewingEditableTour ? (
          <button type="button" onClick={handleConfirm} disabled={!canConfirm} className={`sticky bottom-4 w-full rounded-[18px] border border-[#5b4713] bg-[#ffd24a] text-center font-black uppercase tracking-[0.08em] text-[#17130b] shadow-[0_16px_48px_rgba(245,158,11,0.2)] transition hover:bg-[#ffe07f] disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none ${navigationMode === 'embedded' ? 'px-4 py-3.5 text-base' : 'px-5 py-4 text-lg sm:px-6 sm:py-5 sm:text-xl'}`}>
            {submitting ? 'Фиксация...' : 'Подтвердить тур'}
          </button>
        ) : (
          <button type="button" onClick={() => startTransition(() => router.refresh())} className="w-full rounded-[18px] border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold uppercase tracking-[0.22em] text-white/80 transition hover:border-white/20 hover:bg-white/10">
            Обновить
          </button>
        )}
      </div>
    </div>
  );
}
