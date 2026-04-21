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
import {
  applyThaiJudgeRally,
  buildThaiJudgeCorrectionEvent,
  buildThaiJudgeServeStateFromSetup,
  getThaiJudgeTeamServer,
} from '@/lib/thai-live/serve';
import { clampThaiJudgeScore } from '@/lib/thai-ui-helpers';
import type {
  ThaiJudgeCourtNavItem,
  ThaiJudgeMatchView,
  ThaiJudgePointHistoryEvent,
  ThaiJudgeScoreLine,
  ThaiJudgeServeState,
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

type HistoryFilter = 'all' | 'team1' | 'team2';

interface LastEditState {
  matchId: string;
  previousScore: ThaiJudgeScoreLine;
  previousPointHistory: ThaiJudgePointHistoryEvent[];
  previousServeState: ThaiJudgeServeState | null;
  wasTouched: boolean;
}

interface ServeSetupState {
  matchId: string;
  team1FirstServerId: string;
  team2FirstServerId: string;
  servingSide: 1 | 2;
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

function renderTeamNames(team: ThaiJudgeTeamView, align: 'left' | 'right' = 'left') {
  return (
    <div className={`flex flex-col gap-1 ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
      {team.players.map((player) => (
        <span key={player.id} className="block max-w-full break-words">
          {player.name}
        </span>
      ))}
    </div>
  );
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
  if (tour.isEditable) return 'border-[#ff4d43] bg-[#221010] text-[#ff938b]';
  if (tour.status === 'confirmed') return 'border-white/10 bg-white/5 text-white/80';
  return 'border-white/10 bg-white/5 text-[#838aa0]';
}

function roundTabTone(round: ThaiJudgeSnapshot['roundNav'][number], active: boolean): string {
  if (active) return 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]';
  if (!round.isAvailable) return 'border-white/10 bg-white/5 text-[#6f7588]';
  if (round.status === 'finished') return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100';
  if (round.status === 'live') return 'border-[#ff4d43]/45 bg-[#221010] text-[#ff938b]';
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

function formatSnapshotFreshness(lastUpdatedAt: string, nowMs: number): string {
  const parsed = Date.parse(lastUpdatedAt);
  if (!Number.isFinite(parsed)) return 'только что';
  const diffMs = Math.max(0, nowMs - parsed);
  const diffSec = Math.max(0, Math.round(diffMs / 1000));
  if (diffSec < 5) return 'только что';
  if (diffSec < 60) return `${diffSec} сек назад`;
  const diffMin = Math.max(1, Math.round(diffSec / 60));
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffHours = Math.max(1, Math.round(diffMin / 60));
  return `${diffHours} ч назад`;
}

function formatHistoryScore(score: ThaiJudgeScoreLine): string {
  return `${score.team1}:${score.team2}`;
}

function getVisiblePointHistory(
  history: ThaiJudgePointHistoryEvent[],
  filter: HistoryFilter,
): ThaiJudgePointHistoryEvent[] {
  if (filter === 'all') return history;
  const scoringSide = filter === 'team2' ? 2 : 1;
  return history.filter((event) => event.kind === 'correction' || event.scoringSide === scoringSide);
}

function getHistoryStreak(history: ThaiJudgePointHistoryEvent[], eventIndex: number): number {
  const current = history[eventIndex];
  if (!current || current.kind !== 'rally' || (current.scoringSide !== 1 && current.scoringSide !== 2)) return 0;
  let streak = 1;
  for (let index = eventIndex - 1; index >= 0; index -= 1) {
    const previous = history[index];
    if (!previous || previous.kind !== 'rally' || previous.scoringSide !== current.scoringSide) break;
    streak += 1;
  }
  return streak;
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
  const [pointHistoryByMatch, setPointHistoryByMatch] = useState<Record<string, ThaiJudgePointHistoryEvent[]>>({});
  const [serveStateByMatch, setServeStateByMatch] = useState<Record<string, ThaiJudgeServeState>>({});
  const [historyFilterByMatch, setHistoryFilterByMatch] = useState<Record<string, HistoryFilter>>({});
  const [swappedMatchSides, setSwappedMatchSides] = useState<Record<string, true>>({});
  const [serveSetupState, setServeSetupState] = useState<ServeSetupState | null>(null);
  const [lastEdit, setLastEdit] = useState<LastEditState | null>(null);
  const [confirmCooldownUntil, setConfirmCooldownUntil] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const scoreTapRef = useRef<Record<string, number>>({});
  const pointHistoryFeedRefs = useRef<Record<string, HTMLDivElement | null>>({});
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
    setLastEdit(null);
    setSwappedMatchSides({});
    setServeSetupState(null);
    setConfirmCooldownUntil(0);
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
      setPointHistoryByMatch({});
      setServeStateByMatch({});
      return;
    }

    const draft = parseThaiJudgeDraft(window.localStorage.getItem(draftKey));
    const resolved = resolveThaiJudgeDraftState({ snapshot, draft });
    if (resolved.shouldClearDraft) {
      window.localStorage.removeItem(draftKey);
    }
    setScores(resolved.initialScores);
    setServeStateByMatch(resolved.initialServeStateByMatch);
    setPointHistoryByMatch(resolved.initialPointHistoryByMatch);
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

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!isViewingEditableTour) return;
    for (const match of selectedMatches) {
      const node = pointHistoryFeedRefs.current[match.matchId];
      if (node) node.scrollTop = node.scrollHeight;
    }
  }, [isViewingEditableTour, pointHistoryByMatch, selectedMatches]);

  const scoreErrorsByMatch = useMemo(() => {
    if (!isViewingEditableTour) return new Map<string, string>();
    return new Map(
      selectedMatches
        .map((match) => {
          const score = scores[match.matchId] ?? {
            team1: Number(match.team1Score ?? 0),
            team2: Number(match.team2Score ?? 0),
          };
          return [match.matchId, validateMatchScore(match, score, snapshot.pointLimit)] as const;
        })
        .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
    );
  }, [isViewingEditableTour, scores, selectedMatches, snapshot.pointLimit]);

  const scoreErrors = useMemo(() => [...scoreErrorsByMatch.values()], [scoreErrorsByMatch]);
  const missingMatches = useMemo(
    () => selectedMatches.filter((match) => !touchedMatches[match.matchId]),
    [selectedMatches, touchedMatches],
  );
  const touchedCount = useMemo(() => Object.keys(touchedMatches).length, [touchedMatches]);
  const confirmBlockedReason = useMemo(() => {
    if (submitting) return 'Фиксируем тур...';
    if (confirmCooldownUntil > nowMs) return 'Тур уже отправлен. Дождитесь обновления экрана.';
    if (!online) return 'Нет сети. Черновик сохранён на этом телефоне.';
    if (!selectedTour) return 'Тур не найден.';
    if (!activeSnapshot) return 'Корт ждёт следующий этап.';
    if (!isViewingEditableTour) {
      if (selectedTour.status === 'confirmed') return `Тур T${selectedTour.tourNo} уже подтверждён.`;
      return 'Сейчас доступен другой тур.';
    }
    if (selectedMatches.length !== 2) return 'В туре должны быть доступны два матча.';
    if (missingMatches.length) {
      return `Введите счёт для ${missingMatches.map((match) => `матча ${match.matchNo}`).join(' и ')}.`;
    }
    if (scoreErrors.length) return scoreErrors[0];
    return null;
  }, [
    activeSnapshot,
    confirmCooldownUntil,
    isViewingEditableTour,
    missingMatches,
    nowMs,
    online,
    scoreErrors,
    selectedMatches.length,
    selectedTour,
    submitting,
  ]);
  const canConfirm = Boolean(
    isViewingEditableTour &&
      selectedMatches.length === 2 &&
      touchedCount === 2 &&
      scoreErrors.length === 0 &&
      !submitting &&
      online &&
      confirmCooldownUntil <= nowMs,
  );
  const hasDraftScores =
    touchedCount > 0 ||
    Object.keys(serveStateByMatch).length > 0 ||
    Object.keys(pointHistoryByMatch).length > 0;

  function writeDraft(
    nextScores: Record<string, ThaiJudgeScoreLine>,
    nextServeStateByMatch: Record<string, ThaiJudgeServeState>,
    nextPointHistoryByMatch: Record<string, ThaiJudgePointHistoryEvent[]>,
  ) {
    if (!draftKey || typeof window === 'undefined') return;
    window.localStorage.setItem(
      draftKey,
      JSON.stringify(
        serializeThaiJudgeDraft({
          scores: nextScores,
          serveStateByMatch: nextServeStateByMatch,
          pointHistoryByMatch: nextPointHistoryByMatch,
        }),
      ),
    );
  }

  function buildNextServeStateMap(matchId: string, nextServeState: ThaiJudgeServeState | null) {
    const next = { ...serveStateByMatch };
    if (nextServeState) next[matchId] = nextServeState;
    else delete next[matchId];
    return next;
  }

  function rememberLastEdit(matchId: string) {
    setLastEdit({
      matchId,
      previousScore: scores[matchId] ?? { team1: 0, team2: 0 },
      previousPointHistory: pointHistoryByMatch[matchId] ?? [],
      previousServeState: serveStateByMatch[matchId] ?? null,
      wasTouched: Boolean(touchedMatches[matchId]),
    });
  }

  function commitMatchState(
    matchId: string,
    nextScore: ThaiJudgeScoreLine,
    nextHistory: ThaiJudgePointHistoryEvent[],
    nextServeState: ThaiJudgeServeState | null,
  ) {
    const nextScores = { ...scores, [matchId]: nextScore };
    const nextPointHistory = { ...pointHistoryByMatch, [matchId]: nextHistory };
    const nextServeStates = buildNextServeStateMap(matchId, nextServeState);
    const nextTouched = { ...touchedMatches, [matchId]: true as const };
    setScores(nextScores);
    setPointHistoryByMatch(nextPointHistory);
    setServeStateByMatch(nextServeStates);
    setTouchedMatches(nextTouched);
    writeDraft(nextScores, nextServeStates, nextPointHistory);
  }

  function openServeSetup(match: ThaiJudgeMatchView) {
    const currentServeState = serveStateByMatch[match.matchId];
    setServeSetupState({
      matchId: match.matchId,
      team1FirstServerId: currentServeState?.team1Order[0] ?? match.team1.players[0]?.id ?? '',
      team2FirstServerId: currentServeState?.team2Order[0] ?? match.team2.players[0]?.id ?? '',
      servingSide: currentServeState?.servingSide ?? 1,
    });
  }

  function saveServeSetup() {
    if (!serveSetupState) return;
    const match = selectedMatches.find((entry) => entry.matchId === serveSetupState.matchId);
    if (!match) {
      setServeSetupState(null);
      return;
    }
    const nextServeState = buildThaiJudgeServeStateFromSetup(match, {
      servingSide: serveSetupState.servingSide,
      team1FirstServerId: serveSetupState.team1FirstServerId,
      team2FirstServerId: serveSetupState.team2FirstServerId,
    });
    if (!nextServeState) {
      setToast({ tone: 'error', message: 'Выберите подающего для обеих команд.' });
      return;
    }
    const nextServeStates = { ...serveStateByMatch, [match.matchId]: nextServeState };
    setServeStateByMatch(nextServeStates);
    writeDraft(scores, nextServeStates, pointHistoryByMatch);
    setServeSetupState(null);
    setToast({ tone: 'info', message: `Подача для матча ${match.matchNo} настроена.` });
  }

  function ensureServeSetup(match: ThaiJudgeMatchView): ThaiJudgeServeState | null {
    const serveState = serveStateByMatch[match.matchId] ?? null;
    if (serveState) return serveState;
    openServeSetup(match);
    return null;
  }

  function bumpScore(match: ThaiJudgeMatchView, side: 'team1' | 'team2', delta: number) {
    if (!isViewingEditableTour) return;
    const scoringSide = side === 'team2' ? 2 : 1;
    const currentScore = scores[match.matchId] ?? { team1: 0, team2: 0 };
    const currentHistory = pointHistoryByMatch[match.matchId] ?? [];
    const currentServeState = serveStateByMatch[match.matchId] ?? null;

    if (delta > 0) {
      const liveServeState = ensureServeSetup(match);
      if (!liveServeState) return;
      playBeep();
      setScoreEditor(null);
      rememberLastEdit(match.matchId);
      const { nextScore, nextServeState, event } = applyThaiJudgeRally({
        match,
        currentScore,
        serveState: liveServeState,
        scoringSide,
        history: currentHistory,
      });
      commitMatchState(match.matchId, nextScore, [...currentHistory, event], nextServeState);
      return;
    }

    if (currentScore[side] <= 0) return;
    playBeep();
    setScoreEditor(null);
    rememberLastEdit(match.matchId);
    const nextScore = {
      ...currentScore,
      [side]: clampThaiJudgeScore(currentScore[side] + delta, snapshot.pointLimit),
    };
    const nextHistory = [
      ...currentHistory,
      buildThaiJudgeCorrectionEvent({
        match,
        currentScore,
        nextScore,
        serveState: currentServeState,
        history: currentHistory,
      }),
    ];
    commitMatchState(match.matchId, nextScore, nextHistory, null);
    setToast({ tone: 'info', message: 'После коррекции настройте подачу заново перед следующим розыгрышем.' });
  }

  function openScoreEditor(match: ThaiJudgeMatchView, side: 'team1' | 'team2', value: number) {
    if (!isViewingEditableTour) return;
    if (!ensureServeSetup(match)) return;
    cancelScoreEditorRef.current = false;
    setScoreEditor({ matchId: match.matchId, side, value: String(value) });
  }

  function handleScoreTap(match: ThaiJudgeMatchView, side: 'team1' | 'team2', value: number) {
    if (!isViewingEditableTour) return;
    const tapKey = `${match.matchId}:${side}`;
    const now = Date.now();
    const previousTap = scoreTapRef.current[tapKey] ?? 0;
    scoreTapRef.current[tapKey] = now;
    if (now - previousTap <= 350) {
      scoreTapRef.current[tapKey] = 0;
      openScoreEditor(match, side, value);
    }
  }

  function toggleMatchSides(matchId: string) {
    setSwappedMatchSides((current) => {
      const next = { ...current };
      if (next[matchId]) delete next[matchId];
      else next[matchId] = true;
      return next;
    });
  }

  function applyManualScore(match: ThaiJudgeMatchView, side: 'team1' | 'team2', rawValue: string) {
    if (!isViewingEditableTour) return;
    const normalizedValue = clampThaiJudgeScore(rawValue, snapshot.pointLimit);
    const currentScore = scores[match.matchId] ?? { team1: 0, team2: 0 };
    const nextScore = {
      ...currentScore,
      [side]: normalizedValue,
    };
    if (nextScore.team1 === currentScore.team1 && nextScore.team2 === currentScore.team2) {
      setScoreEditor(null);
      return;
    }
    rememberLastEdit(match.matchId);
    const currentHistory = pointHistoryByMatch[match.matchId] ?? [];
    const currentServeState = serveStateByMatch[match.matchId] ?? null;
    const nextHistory = [
      ...currentHistory,
      buildThaiJudgeCorrectionEvent({
        match,
        currentScore,
        nextScore,
        serveState: currentServeState,
        history: currentHistory,
      }),
    ];
    commitMatchState(match.matchId, nextScore, nextHistory, null);
    setScoreEditor(null);
    if (currentServeState) {
      setToast({ tone: 'info', message: 'После ручной коррекции настройте подачу заново перед следующим розыгрышем.' });
    }
  }

  function undoLastScoreAction() {
    if (!isViewingEditableTour || !lastEdit) return;
    const nextScores = { ...scores, [lastEdit.matchId]: lastEdit.previousScore };
    const nextPointHistory = { ...pointHistoryByMatch, [lastEdit.matchId]: lastEdit.previousPointHistory };
    const nextServeStates = buildNextServeStateMap(lastEdit.matchId, lastEdit.previousServeState);
    const nextTouched = { ...touchedMatches };
    if (lastEdit.wasTouched) nextTouched[lastEdit.matchId] = true;
    else delete nextTouched[lastEdit.matchId];
    setScores(nextScores);
    setPointHistoryByMatch(nextPointHistory);
    setServeStateByMatch(nextServeStates);
    setTouchedMatches(nextTouched);
    writeDraft(nextScores, nextServeStates, nextPointHistory);
    setToast({ tone: 'info', message: 'Последнее изменение отменено.' });
    setLastEdit(null);
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
              pointHistory: pointHistoryByMatch[match.matchId] ?? [],
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
      setConfirmCooldownUntil(Date.now() + 1800);
      setLastEdit(null);
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

  const freshnessLabel = formatSnapshotFreshness(snapshot.lastUpdatedAt, nowMs);
  const isCompactMode = navigationMode === 'embedded';
  const serveSetupMatch = serveSetupState
    ? selectedMatches.find((match) => match.matchId === serveSetupState.matchId) ?? null
    : null;

  return (
    <div
      className={
        isCompactMode
          ? 'overflow-x-hidden text-white'
          : 'min-h-screen min-h-[100dvh] overflow-x-hidden bg-[radial-gradient(circle_at_top,rgba(255,210,74,0.08),transparent_14%),linear-gradient(180deg,#080813,#0d0d18_28%,#090913)] px-3 pb-8 pt-4 text-white'
      }
    >
      <div className={`mx-auto flex w-full max-w-[720px] flex-col ${isCompactMode ? 'gap-3' : 'gap-4'}`}>
        {navigationMode === 'standalone' && snapshot.courtNav.length > 1 ? (
          <nav className="overflow-x-auto pb-1">
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
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-[0.34em] text-[#8e7b48]">Судейский экран</div>
                <h1 className="mt-2 text-[28px] font-heading uppercase leading-[0.96] tracking-[0.08em] text-[#ffd24a] sm:text-[34px]">
                  {resolveJudgeHeadline(snapshot)}
                </h1>
                <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8e7b48]">
                  {resolveJudgeSlotPair(snapshot)}
                </div>
                <p className="mt-2 text-sm text-[#c1c7d6]/82">
                  {snapshot.tournamentName} • до {snapshot.pointLimit}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-wrap justify-end gap-2">
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
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#aeb6c8]">
                  Обновлено {freshnessLabel}
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

        {toast ? (
          <div className={`rounded-[18px] border px-4 py-3 text-sm font-medium shadow-[0_12px_40px_rgba(0,0,0,0.22)] ${toneClasses(toast.tone)}`}>
            {toast.message}
          </div>
        ) : null}

        <section className="rounded-[18px] border border-[#2a2a3f] bg-[linear-gradient(180deg,rgba(18,17,29,0.98),rgba(12,12,24,0.98))] px-3 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
          {navigationMode === 'standalone' ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                {snapshot.roundNav.map((round) => {
                  const isActive = round.isActive;
                  const disabled = !round.isAvailable || !round.judgeUrl;
                  const className = `rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] transition ${roundTabTone(round, isActive)} ${disabled ? 'cursor-not-allowed opacity-55' : ''}`;
                  if (disabled) {
                    return (
                      <span key={round.roundType} aria-disabled="true" className={className}>
                        {resolveRoundTabLabel(round)}
                      </span>
                    );
                  }
                  return (
                    <Link key={round.roundType} href={round.judgeUrl ?? '/'} aria-current={isActive ? 'page' : undefined} className={className}>
                      {resolveRoundTabLabel(round)}
                    </Link>
                  );
                })}
              </div>
              <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-[#7d8498]">
                {snapshot.roundNav.map((round) => `${round.label}: ${roundStatusLabel(round)}`).join(' • ')}
              </div>
              {snapshot.roundNav.find((round) => !round.isAvailable && round.unavailableReason) ? (
                <div className="mb-3 rounded-[14px] border border-white/8 bg-white/5 px-3 py-2 text-[12px] text-[#c6cad6]">
                  {snapshot.roundNav.find((round) => !round.isAvailable && round.unavailableReason)?.unavailableReason}
                </div>
              ) : null}
            </>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {snapshot.tours.map((tour) => {
              const isActive = selectedTour?.tourNo === tour.tourNo;
              const disabled = tour.tourNo > snapshot.currentTourNo;
              return (
                <button
                  key={tour.tourId}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedTourNo(tour.tourNo)}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition ${tourTabTone(tour, isActive)} ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                >
                  T{tour.tourNo}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[#7d8498]">
            <span>{selectedTour?.isEditable ? 'LIVE' : selectedTour?.status === 'confirmed' ? 'RO' : 'Ждите'}</span>
            <span className="rounded-full border border-[#5b4713] bg-[#1b160d] px-2 py-1 text-[9px] tracking-[0.14em] text-[#ffd24a]">
              До {snapshot.pointLimit}
            </span>
            <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1 text-[9px] tracking-[0.14em] text-[#aeb6c8]">
              Обновлено {freshnessLabel}
            </span>
            {hasDraftScores && isViewingEditableTour ? (
              <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-1 text-[9px] tracking-[0.14em] text-amber-100">
                Черновик сохранён
              </span>
            ) : null}
            {lastEdit && isViewingEditableTour ? (
              <button
                type="button"
                onClick={undoLastScoreAction}
                className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/85 transition hover:border-white/20 hover:bg-white/10"
              >
                Отменить последнее
              </button>
            ) : null}
          </div>
        </section>

        {(snapshot.kind !== 'active' || !selectedTour?.isEditable) && snapshot.message ? (
          <section
            className={`rounded-[24px] border px-4 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.4)] ${
              snapshot.kind === 'finished'
                ? 'border-[#ffd24a]/40 bg-[#ffd24a]/10 text-[#f8d768]'
                : 'border-[#2a2a3f] bg-[linear-gradient(180deg,rgba(18,17,29,0.98),rgba(12,12,24,0.98))] text-[#c1c7d6]/86'
            }`}
          >
            <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${snapshot.kind === 'finished' ? 'text-[#ffd24a]' : 'text-[#8f7c4a]'}`}>
              {snapshot.kind === 'finished' ? 'Корт завершил туры' : 'Статус корта'}
            </div>
            <div className={`mt-2 ${snapshot.kind === 'finished' ? 'text-base font-semibold' : 'text-sm'}`}>
              {snapshot.message}
            </div>
            {snapshot.kind === 'finished' ? (
              <div className="mt-3 space-y-3">
                <p className="text-[13px] leading-relaxed text-white/85">
                  {snapshot.canAutoRefreshToNextStage
                    ? 'Оставьте экран открытым. Следующий этап проверяется автоматически.'
                    : 'Судейский ввод для этого корта больше не требуется.'}
                </p>
                <button
                  type="button"
                  onClick={() => startTransition(() => router.refresh())}
                  className="w-full rounded-[14px] border border-[#ffd24a]/35 bg-[#ffd24a]/12 py-3 text-sm font-bold text-[#ffd24a] transition hover:bg-[#ffd24a]/18"
                >
                  Проверить сейчас
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="space-y-3">
          {selectedMatches.map((match, matchIndex) => {
            const liveScore = scores[match.matchId] ?? {
              team1: Number(match.team1Score ?? 0),
              team2: Number(match.team2Score ?? 0),
            };
            const pointHistory =
              isViewingEditableTour
                ? pointHistoryByMatch[match.matchId] ?? match.pointHistory
                : match.pointHistory;
            const serveState = isViewingEditableTour ? serveStateByMatch[match.matchId] ?? null : null;
            const team1CurrentServer = getThaiJudgeTeamServer(match, serveState, 1, 'current');
            const team1NextServer = getThaiJudgeTeamServer(match, serveState, 1, 'next');
            const team2CurrentServer = getThaiJudgeTeamServer(match, serveState, 2, 'current');
            const team2NextServer = getThaiJudgeTeamServer(match, serveState, 2, 'next');
            const isSwapped = Boolean(swappedMatchSides[match.matchId]);
            const leftSideKey: 'team1' | 'team2' = isSwapped ? 'team2' : 'team1';
            const rightSideKey: 'team1' | 'team2' = isSwapped ? 'team1' : 'team2';
            const leftTeam = isSwapped ? match.team2 : match.team1;
            const rightTeam = isSwapped ? match.team1 : match.team2;
            const leftCurrentServer = isSwapped ? team2CurrentServer : team1CurrentServer;
            const leftNextServer = isSwapped ? team2NextServer : team1NextServer;
            const rightCurrentServer = isSwapped ? team1CurrentServer : team2CurrentServer;
            const rightNextServer = isSwapped ? team1NextServer : team2NextServer;
            const leftServingSide = isSwapped ? 2 : 1;
            const rightServingSide = isSwapped ? 1 : 2;
            const historyFilter = historyFilterByMatch[match.matchId] ?? 'all';
            const visiblePointHistory = pointHistory.reduce<Array<{ event: ThaiJudgePointHistoryEvent; index: number }>>(
              (acc, event, index) => {
                if (historyFilter === 'all' || event.kind === 'correction') {
                  acc.push({ event, index });
                } else if (historyFilter === 'team1' && event.scoringSide === 1) {
                  acc.push({ event, index });
                } else if (historyFilter === 'team2' && event.scoringSide === 2) {
                  acc.push({ event, index });
                }
                return acc;
              },
              [],
            );
            const matchError = scoreErrorsByMatch.get(match.matchId) ?? null;
            const isMissing = !touchedMatches[match.matchId];
            const needsAttention = Boolean(matchError || isMissing);
            const attentionText = matchError ?? (isMissing ? `Введите счёт для матча ${match.matchNo}.` : null);
            const accent =
              matchIndex === 0
                ? {
                    frame: 'border-[#37d45d] bg-[linear-gradient(180deg,rgba(7,25,11,0.96),rgba(9,20,14,0.96))]',
                    title: 'text-[#37d45d]',
                    plus: 'border-[#37d45d] bg-[#37d45d] text-[#ffd400]',
                    minus: 'border-white/12 bg-white/6 text-white',
                  }
                : {
                    frame: 'border-[#ff9f0a] bg-[linear-gradient(180deg,rgba(32,19,2,0.96),rgba(15,12,8,0.96))]',
                    title: 'text-[#ffb100]',
                    plus: 'border-[#ff9f0a] bg-[#37d45d] text-[#ffb100]',
                    minus: 'border-white/12 bg-white/6 text-white',
                  };

            const renderScore = (sideKey: 'team1' | 'team2') => {
              if (scoreEditor?.matchId === match.matchId && scoreEditor.side === sideKey) {
                return (
                  <input
                    ref={scoreEditorInputRef}
                    type="number"
                    min={0}
                    max={snapshot.pointLimit}
                    inputMode="numeric"
                    value={scoreEditor.value}
                    onChange={(event) =>
                      setScoreEditor((current) =>
                        current && current.matchId === match.matchId && current.side === sideKey
                          ? { ...current, value: event.target.value.replace(/[^\d]/g, '') }
                          : current,
                      )
                    }
                    onBlur={() => {
                      if (cancelScoreEditorRef.current) {
                        cancelScoreEditorRef.current = false;
                        return;
                      }
                      applyManualScore(match, sideKey, scoreEditor.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        applyManualScore(match, sideKey, scoreEditor.value);
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelScoreEditorRef.current = true;
                        setScoreEditor(null);
                      }
                    }}
                    className={`${isCompactMode ? 'h-12 w-12 text-2xl' : 'h-16 w-16 text-3xl'} rounded-2xl border border-[#5b4713] bg-[#18140d] px-1 text-center font-black text-[#ffd24a] outline-none`}
                  />
                );
              }

              return (
                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    disabled={!isViewingEditableTour}
                    onClick={() => handleScoreTap(match, sideKey, liveScore[sideKey])}
                    className={`${isCompactMode ? 'h-12 w-12 text-4xl' : 'h-16 w-16 text-6xl'} text-center font-heading leading-none text-[#ffd400] disabled:cursor-default`}
                    title="Двойной тап или кнопка ниже для ручного ввода"
                  >
                    {liveScore[sideKey]}
                  </button>
                  <button
                    type="button"
                    disabled={!isViewingEditableTour}
                    onClick={() => openScoreEditor(match, sideKey, liveScore[sideKey])}
                    className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/80 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Ввести
                  </button>
                </div>
              );
            };

            return (
              <article key={match.matchId}>
                <div className="mb-2 flex items-center gap-3 px-1">
                  <div className="h-px flex-1 bg-white/14" />
                  <div className={`text-[14px] font-black uppercase tracking-[0.18em] ${accent.title}`}>
                    Пара {match.matchNo}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleMatchSides(match.matchId)}
                    className="rounded-full border border-white/12 bg-white/6 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/85 transition hover:border-white/22 hover:bg-white/10"
                    title="Поменять стороны местами"
                    aria-label="Поменять стороны местами"
                  >
                    ⇄ swap
                  </button>
                  <div className="h-px flex-1 bg-white/14" />
                </div>

                {attentionText ? (
                  <div className="mb-2 rounded-[14px] border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[12px] font-medium text-amber-100">
                    {attentionText}
                  </div>
                ) : null}

                <div
                  className={`rounded-[26px] border ${isCompactMode ? 'p-3' : 'p-4'} shadow-[0_20px_60px_rgba(0,0,0,0.32)] ${accent.frame} ${
                    needsAttention ? 'ring-1 ring-amber-300/35' : ''
                  }`}
                >
                  <div className={`grid items-center ${isCompactMode ? 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2' : 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3'}`}>
                    <div className="min-w-0">
                      <div className={`${isCompactMode ? 'text-[clamp(15px,4.4vw,19px)]' : 'text-[clamp(16px,2.8vw,22px)]'} font-black leading-[1.02] text-white`}>
                        {renderTeamNames(leftTeam)}
                      </div>
                      {navigationMode === 'standalone' ? (
                        <div className="mt-2 text-sm uppercase tracking-[0.16em] text-[#7d8498]">
                          {formatTeamRoles(leftTeam)}
                        </div>
                      ) : null}
                      <div className="mt-3 rounded-[16px] border border-white/10 bg-black/20 px-3 py-2 text-left">
                        <div className={`flex items-center gap-2 text-sm font-semibold ${serveState?.servingSide === leftServingSide ? 'text-[#ffd24a]' : 'text-white/88'}`}>
                          <span className={`h-2.5 w-2.5 rounded-full ${serveState?.servingSide === leftServingSide ? 'bg-[#ffd24a]' : 'bg-white/20'}`} />
                          <span>Подача: {leftCurrentServer?.playerName ?? 'не настроена'}</span>
                        </div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#9aa1b3]">
                          след: {leftNextServer?.playerName ?? '—'}
                        </div>
                      </div>
                    </div>

                    <div className={`flex items-start justify-center ${isCompactMode ? 'min-w-[108px] gap-2' : 'min-w-[150px] gap-3'}`}>
                      {renderScore(leftSideKey)}
                      <div className={`${isCompactMode ? 'pt-1 text-3xl' : 'text-5xl'} font-black text-white/35`}>-</div>
                      {renderScore(rightSideKey)}
                    </div>

                    <div className="min-w-0 text-right">
                      <div className={`${isCompactMode ? 'text-[clamp(15px,4.4vw,19px)]' : 'text-[clamp(16px,2.8vw,22px)]'} font-black leading-[1.02] text-white`}>
                        {renderTeamNames(rightTeam, 'right')}
                      </div>
                      {navigationMode === 'standalone' ? (
                        <div className="mt-2 text-sm uppercase tracking-[0.16em] text-[#7d8498]">
                          {formatTeamRoles(rightTeam)}
                        </div>
                      ) : null}
                      <div className="mt-3 rounded-[16px] border border-white/10 bg-black/20 px-3 py-2 text-right">
                        <div className={`flex items-center justify-end gap-2 text-sm font-semibold ${serveState?.servingSide === rightServingSide ? 'text-[#ffd24a]' : 'text-white/88'}`}>
                          <span>Подача: {rightCurrentServer?.playerName ?? 'не настроена'}</span>
                          <span className={`h-2.5 w-2.5 rounded-full ${serveState?.servingSide === rightServingSide ? 'bg-[#ffd24a]' : 'bg-white/20'}`} />
                        </div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#9aa1b3]">
                          след: {rightNextServer?.playerName ?? '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={`mt-4 grid ${isCompactMode ? 'grid-cols-4 gap-2' : 'grid-cols-4 gap-3'}`}>
                    <button
                      type="button"
                      disabled={!isViewingEditableTour}
                      onClick={() => bumpScore(match, leftSideKey, -1)}
                      className={`${isCompactMode ? 'h-14 text-3xl' : 'h-20 text-4xl'} rounded-[18px] border font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${accent.minus}`}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      disabled={!isViewingEditableTour}
                      onClick={() => bumpScore(match, leftSideKey, 1)}
                      className={`${isCompactMode ? 'h-14 text-4xl' : 'h-20 text-5xl'} rounded-[18px] border-2 font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${accent.plus}`}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      disabled={!isViewingEditableTour}
                      onClick={() => bumpScore(match, rightSideKey, -1)}
                      className={`${isCompactMode ? 'h-14 text-3xl' : 'h-20 text-4xl'} rounded-[18px] border font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${accent.minus}`}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      disabled={!isViewingEditableTour}
                      onClick={() => bumpScore(match, rightSideKey, 1)}
                      className={`${isCompactMode ? 'h-14 text-4xl' : 'h-20 text-5xl'} rounded-[18px] border-2 font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${accent.plus}`}
                    >
                      +
                    </button>
                  </div>

                  <div className="mt-4 rounded-[20px] border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">История очков</div>
                        <div className="mt-1 text-xs text-white/72">
                          {pointHistory.length ? `${pointHistory.length} событий` : 'История появится после первого розыгрыша.'}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
                          {([
                            ['all', 'Все'],
                            [leftSideKey, 'Лево'],
                            [rightSideKey, 'Право'],
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() =>
                                setHistoryFilterByMatch((current) => ({
                                  ...current,
                                  [match.matchId]: value,
                                }))
                              }
                              className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] transition ${
                                historyFilter === value ? 'bg-[#ffd24a] text-[#17130b]' : 'text-white/70'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {isViewingEditableTour ? (
                          <button
                            type="button"
                            onClick={() => openServeSetup(match)}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/85 transition hover:border-white/20 hover:bg-white/10"
                          >
                            Настроить подачу
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {!serveState && isViewingEditableTour ? (
                      <div className="mt-3 rounded-[14px] border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100">
                        Перед первым розыгрышем задайте очередь подачи для матча.
                      </div>
                    ) : null}

                    {visiblePointHistory.length ? (
                      <div
                        ref={(node) => {
                          pointHistoryFeedRefs.current[match.matchId] = node;
                        }}
                        className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1"
                      >
                        {visiblePointHistory.map(({ event, index }) => {
                          const streak = getHistoryStreak(pointHistory, index);
                          const teamLabel =
                            event.scoringSide === 1
                              ? match.team1.label
                              : event.scoringSide === 2
                                ? match.team2.label
                                : 'Коррекция';
                          const serverLabel = event.serverPlayerBefore?.playerName ?? 'не задана';
                          return (
                            <div
                              key={`${match.matchId}-history-${event.seqNo}`}
                              className={`rounded-[16px] border px-3 py-2 text-sm ${
                                event.kind === 'correction'
                                  ? 'border-white/10 bg-white/5 text-white/78'
                                  : event.scoringSide === 1
                                    ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
                                    : 'border-orange-400/25 bg-orange-500/10 text-orange-100'
                              }`}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] text-white/45">{formatHistoryScore(event.scoreBefore)}</span>
                                <span className="text-base font-black">→</span>
                                <span className="font-semibold">{teamLabel}</span>
                                {event.kind === 'rally' ? (
                                  <span className="text-[12px] italic text-white/70">(подача: {serverLabel})</span>
                                ) : null}
                                <span className="ml-auto text-base font-black text-[#ffd24a]">
                                  {formatHistoryScore(event.scoreAfter)}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/55">
                                {event.kind === 'correction' ? <span>Коррекция счёта</span> : null}
                                {event.isSideOut ? <span className="rounded-full border border-white/10 px-2 py-0.5">side-out</span> : null}
                                {streak >= 2 ? (
                                  <span className="rounded-full border border-white/10 px-2 py-0.5">{streak} подряд</span>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-[14px] border border-white/8 bg-white/5 px-3 py-3 text-sm text-white/62">
                        {historyFilter === 'all'
                          ? 'История очков пока пустая.'
                          : 'По текущему фильтру событий пока нет.'}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {snapshot.standingsGroups.length ? (
          <section className="rounded-[18px] border border-[#2a2a3f] bg-[linear-gradient(180deg,rgba(18,17,29,0.98),rgba(12,12,24,0.98))] shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
            <button type="button" onClick={() => setStandingsOpen((value) => !value)} className="flex w-full items-center justify-between px-3 py-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#8f7c4a]">Таблица</span>
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
                            {Array.from({ length: snapshot.tourCount }, (_, index) => (
                              <th key={index} className="px-2 py-2 text-center">
                                T{index + 1}
                              </th>
                            ))}
                            <th className="px-3 py-2 text-center">P</th>
                            <th className="px-3 py-2 text-center">М</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row) => (
                            <tr key={row.playerId} className="border-t border-white/6">
                              <td className="px-3 py-2 font-semibold text-[#ffd24a]">{row.place}</td>
                              <td className="px-3 py-2 font-semibold">{row.playerName}</td>
                              {row.tourDiffs.map((delta, index) => (
                                <td
                                  key={`${row.playerId}-${index}`}
                                  className={`px-2 py-2 text-center font-semibold ${
                                    delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-red-300' : 'text-white/50'
                                  }`}
                                >
                                  {formatStandingDelta(delta)}
                                </td>
                              ))}
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

        {isViewingEditableTour ? (
          <div className="sticky bottom-4 space-y-2">
            {confirmBlockedReason ? (
              <div className="rounded-[16px] border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {confirmBlockedReason}
              </div>
            ) : (
              <div className="rounded-[16px] border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                Всё готово. Проверьте итоговый счёт и подтвердите тур.
              </div>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={`w-full rounded-[18px] border border-[#5b4713] bg-[#ffd24a] text-center font-black uppercase tracking-[0.08em] text-[#17130b] shadow-[0_16px_48px_rgba(245,158,11,0.2)] transition hover:bg-[#ffe07f] disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none ${isCompactMode ? 'px-4 py-3.5 text-base' : 'px-5 py-4 text-lg sm:px-6 sm:py-5 sm:text-xl'}`}
            >
              {submitting ? 'Фиксация...' : confirmCooldownUntil > nowMs ? 'Тур отправлен' : 'Подтвердить тур'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => startTransition(() => router.refresh())}
            className="w-full rounded-[18px] border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold uppercase tracking-[0.22em] text-white/80 transition hover:border-white/20 hover:bg-white/10"
          >
            Обновить
          </button>
        )}

        {serveSetupState && serveSetupMatch ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-3 sm:items-center">
            <div className="w-full max-w-xl rounded-[26px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.99),rgba(12,12,24,0.99))] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-[#8f7c4a]">Настройка подачи</div>
                  <h3 className="mt-2 text-xl font-black uppercase tracking-[0.08em] text-[#ffd24a]">
                    Матч {serveSetupMatch.matchNo}
                  </h3>
                  <p className="mt-2 text-sm text-white/72">
                    Выберите стартового подающего у каждой команды и укажите, кто начинает розыгрыш.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setServeSetupState(null)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75"
                >
                  Закрыть
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {([
                  [1, serveSetupMatch.team1, serveSetupState.team1FirstServerId],
                  [2, serveSetupMatch.team2, serveSetupState.team2FirstServerId],
                ] as const).map(([teamSide, team, selectedPlayerId]) => (
                  <div key={team.side} className="rounded-[18px] border border-white/10 bg-black/20 p-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-[#8f7c4a]">
                      Команда {teamSide === 1 ? '1' : '2'}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-white">{team.label}</div>
                    <div className="mt-3 space-y-2">
                      {team.players.map((player) => (
                        <label
                          key={player.id}
                          className={`flex cursor-pointer items-center justify-between rounded-[14px] border px-3 py-2 text-sm transition ${
                            selectedPlayerId === player.id
                              ? 'border-[#ffd24a]/45 bg-[#ffd24a]/12 text-[#ffd24a]'
                              : 'border-white/10 bg-white/5 text-white/80'
                          }`}
                        >
                          <span>{player.name}</span>
                          <input
                            type="radio"
                            name={`serve-${serveSetupMatch.matchId}-${team.side}`}
                            checked={selectedPlayerId === player.id}
                            onChange={() =>
                              setServeSetupState((current) =>
                                current == null
                                  ? current
                                  : teamSide === 1
                                    ? { ...current, team1FirstServerId: player.id }
                                    : { ...current, team2FirstServerId: player.id },
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-[18px] border border-white/10 bg-black/20 p-3">
                <div className="text-[10px] uppercase tracking-[0.22em] text-[#8f7c4a]">Кто подаёт первым</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {[serveSetupMatch.team1, serveSetupMatch.team2].map((team) => (
                    <button
                      key={team.side}
                      type="button"
                      onClick={() =>
                        setServeSetupState((current) =>
                          current == null ? current : { ...current, servingSide: team.side },
                        )
                      }
                      className={`rounded-[14px] border px-3 py-3 text-left text-sm font-semibold transition ${
                        serveSetupState.servingSide === team.side
                          ? 'border-[#ffd24a]/45 bg-[#ffd24a]/12 text-[#ffd24a]'
                          : 'border-white/10 bg-white/5 text-white/78'
                      }`}
                    >
                      Команда {team.side} начинает подачу
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setServeSetupState((current) =>
                      current == null
                        ? current
                        : {
                            ...current,
                            servingSide: current.servingSide === 1 ? 2 : 1,
                          },
                    )
                  }
                  className="rounded-[14px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/82 transition hover:border-white/20 hover:bg-white/10"
                >
                  Подачу начинает другая команда
                </button>
                <button
                  type="button"
                  onClick={saveServeSetup}
                  className="rounded-[14px] border border-[#5b4713] bg-[#ffd24a] px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-[#17130b] transition hover:bg-[#ffe07f]"
                >
                  Сохранить и продолжить
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
