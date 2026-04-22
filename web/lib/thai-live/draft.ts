import type {
  ThaiJudgeMatchView,
  ThaiJudgePointHistoryEvent,
  ThaiJudgeScoreLine,
  ThaiJudgeServeState,
  ThaiJudgeSnapshot,
} from './types';

export interface ThaiJudgeDraftPayloadV1 {
  version: 1;
  savedAt: string;
  scores: Record<string, ThaiJudgeScoreLine>;
}

export interface ThaiJudgeDraftPayload {
  version: 2;
  savedAt: string;
  scores: Record<string, ThaiJudgeScoreLine>;
  serveStateByMatch: Record<string, ThaiJudgeServeState>;
  pointHistoryByMatch: Record<string, ThaiJudgePointHistoryEvent[]>;
}

function isFiniteScore(value: unknown): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
}

function isScoreLine(value: unknown): value is ThaiJudgeScoreLine {
  return Boolean(value) && isFiniteScore((value as ThaiJudgeScoreLine).team1) && isFiniteScore((value as ThaiJudgeScoreLine).team2);
}

function isServeState(value: unknown): value is ThaiJudgeServeState {
  if (!value || typeof value !== 'object') return false;
  const serveState = value as ThaiJudgeServeState;
  return (
    (serveState.servingSide === 1 || serveState.servingSide === 2) &&
    Array.isArray(serveState.team1Order) &&
    Array.isArray(serveState.team2Order) &&
    Number.isFinite(Number(serveState.team1CurrentIndex)) &&
    Number.isFinite(Number(serveState.team2CurrentIndex))
  );
}

function isPointHistoryEvent(value: unknown): value is ThaiJudgePointHistoryEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as ThaiJudgePointHistoryEvent;
  const validKind = event.kind === 'rally' || event.kind === 'correction';
  const validScoreBefore = isScoreLine(event.scoreBefore);
  const validScoreAfter = isScoreLine(event.scoreAfter);
  const validRecordedAt =
    event.recordedAt == null ||
    (typeof event.recordedAt === 'string' && Number.isFinite(Date.parse(event.recordedAt)));
  return validKind && validScoreBefore && validScoreAfter && Number.isFinite(Number(event.seqNo)) && validRecordedAt;
}

function clampDraftScore(value: unknown, pointLimit: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(pointLimit, parsed));
}

function scoreLinesEqual(left: ThaiJudgeScoreLine, right: ThaiJudgeScoreLine): boolean {
  return left.team1 === right.team1 && left.team2 === right.team2;
}

function isZeroScore(score: ThaiJudgeScoreLine): boolean {
  return score.team1 === 0 && score.team2 === 0;
}

function buildSynthesizedCorrectionEvent(
  score: ThaiJudgeScoreLine,
  recordedAt: string | null,
): ThaiJudgePointHistoryEvent[] {
  if (isZeroScore(score)) return [];
  return [
    {
      seqNo: 1,
      kind: 'correction',
      recordedAt,
      scoringSide: null,
      scoreBefore: { team1: 0, team2: 0 },
      scoreAfter: score,
      servingSideBefore: null,
      serverPlayerBefore: null,
      servingSideAfter: null,
      serverPlayerAfter: null,
      isSideOut: false,
    },
  ];
}

function isUsableDraftHistory(
  history: ThaiJudgePointHistoryEvent[],
  finalScore: ThaiJudgeScoreLine,
  pointLimit: number,
): boolean {
  if (!history.length) return isZeroScore(finalScore);

  let runningScore: ThaiJudgeScoreLine = { team1: 0, team2: 0 };
  for (let index = 0; index < history.length; index += 1) {
    const event = history[index]!;
    if (event.seqNo !== index + 1) return false;
    if (!scoreLinesEqual(event.scoreBefore, runningScore)) return false;
    if (
      event.scoreBefore.team1 > pointLimit ||
      event.scoreBefore.team2 > pointLimit ||
      event.scoreAfter.team1 > pointLimit ||
      event.scoreAfter.team2 > pointLimit
    ) {
      return false;
    }
    runningScore = event.scoreAfter;
  }

  return scoreLinesEqual(runningScore, finalScore);
}

export function buildThaiJudgeDraftKey(input: {
  courtId: string;
  roundId: string;
  tourNumber: number;
}): string {
  return `thai_judge_draft:${String(input.courtId)}:${String(input.roundId)}:${Number(input.tourNumber)}`;
}

export function parseThaiJudgeDraft(raw: string | null | undefined): ThaiJudgeDraftPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ThaiJudgeDraftPayload | ThaiJudgeDraftPayloadV1;
    if (!parsed || typeof parsed !== 'object' || parsed == null || typeof parsed.scores !== 'object' || parsed.scores == null) {
      return null;
    }

    const scores = Object.fromEntries(
      Object.entries(parsed.scores).filter(([, score]) => isScoreLine(score)),
    ) as Record<string, ThaiJudgeScoreLine>;

    if (parsed.version === 1) {
      return {
        version: 2,
        savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date(0).toISOString(),
        scores,
        serveStateByMatch: {},
        pointHistoryByMatch: {},
      };
    }

    if (parsed.version !== 2) return null;

    const serveStateByMatch = Object.fromEntries(
      Object.entries(parsed.serveStateByMatch ?? {}).filter(([, serveState]) => isServeState(serveState)),
    ) as Record<string, ThaiJudgeServeState>;

    const pointHistoryByMatch = Object.fromEntries(
      Object.entries(parsed.pointHistoryByMatch ?? {}).map(([matchId, history]) => [
        matchId,
        Array.isArray(history) ? history.filter((event) => isPointHistoryEvent(event)) : [],
      ]),
    ) as Record<string, ThaiJudgePointHistoryEvent[]>;

    return {
      version: 2,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date(0).toISOString(),
      scores,
      serveStateByMatch,
      pointHistoryByMatch,
    };
  } catch {
    return null;
  }
}

export function serializeThaiJudgeDraft(
  input: {
    scores: Record<string, ThaiJudgeScoreLine>;
    serveStateByMatch?: Record<string, ThaiJudgeServeState>;
    pointHistoryByMatch?: Record<string, ThaiJudgePointHistoryEvent[]>;
  },
): ThaiJudgeDraftPayload {
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    scores: input.scores,
    serveStateByMatch: input.serveStateByMatch ?? {},
    pointHistoryByMatch: input.pointHistoryByMatch ?? {},
  };
}

export function getThaiJudgeServerScores(matches: ThaiJudgeMatchView[]): Record<string, ThaiJudgeScoreLine> {
  return Object.fromEntries(
    matches
      .filter((match) => match.team1Score != null || match.team2Score != null)
      .map((match) => [
        match.matchId,
        {
          team1: Number(match.team1Score ?? 0),
          team2: Number(match.team2Score ?? 0),
        },
      ]),
  );
}

export function resolveThaiJudgeDraftState(input: {
  snapshot: ThaiJudgeSnapshot;
  draft: ThaiJudgeDraftPayload | null;
}): {
  initialScores: Record<string, ThaiJudgeScoreLine>;
  initialServeStateByMatch: Record<string, ThaiJudgeServeState>;
  initialPointHistoryByMatch: Record<string, ThaiJudgePointHistoryEvent[]>;
  restoredFromDraft: boolean;
  shouldClearDraft: boolean;
} {
  const serverScores = getThaiJudgeServerScores(input.snapshot.matches);
  if (input.snapshot.kind !== 'active' || input.snapshot.tourStatus !== 'pending') {
    return {
      initialScores: serverScores,
      initialServeStateByMatch: {},
      initialPointHistoryByMatch: {},
      restoredFromDraft: false,
      shouldClearDraft: Boolean(input.draft),
    };
  }

  if (Object.keys(serverScores).length > 0) {
    return {
      initialScores: serverScores,
      initialServeStateByMatch: {},
      initialPointHistoryByMatch: {},
      restoredFromDraft: false,
      shouldClearDraft: Boolean(input.draft),
    };
  }

  if (!input.draft) {
    return {
      initialScores: {},
      initialServeStateByMatch: {},
      initialPointHistoryByMatch: {},
      restoredFromDraft: false,
      shouldClearDraft: false,
    };
  }

  const pointLimit = Math.max(0, Math.trunc(Number(input.snapshot.pointLimit) || 0));
  const matchIds = new Set(input.snapshot.matches.map((match) => match.matchId));
  const sanitizedScores: Record<string, ThaiJudgeScoreLine> = {};
  const sanitizedServeStateByMatch: Record<string, ThaiJudgeServeState> = {};
  const sanitizedPointHistoryByMatch: Record<string, ThaiJudgePointHistoryEvent[]> = {};

  for (const matchId of Object.keys(input.draft.scores)) {
    if (!matchIds.has(matchId)) continue;
    const rawScore = input.draft.scores[matchId];
    if (!rawScore) continue;

    const sanitizedScore: ThaiJudgeScoreLine = {
      team1: clampDraftScore(rawScore.team1, pointLimit),
      team2: clampDraftScore(rawScore.team2, pointLimit),
    };

    if (sanitizedScore.team1 === sanitizedScore.team2 && !isZeroScore(sanitizedScore)) {
      continue;
    }

    const draftHistory = input.draft.pointHistoryByMatch[matchId] ?? [];
    const sanitizedHistory = isUsableDraftHistory(draftHistory, sanitizedScore, pointLimit)
      ? draftHistory
      : buildSynthesizedCorrectionEvent(sanitizedScore, null);

    if (!isZeroScore(sanitizedScore)) {
      sanitizedScores[matchId] = sanitizedScore;
    }
    if (sanitizedHistory.length) {
      sanitizedPointHistoryByMatch[matchId] = sanitizedHistory;
    }
    if (input.draft.serveStateByMatch[matchId] && isUsableDraftHistory(draftHistory, sanitizedScore, pointLimit)) {
      sanitizedServeStateByMatch[matchId] = input.draft.serveStateByMatch[matchId]!;
    }
  }

  return {
    initialScores: sanitizedScores,
    initialServeStateByMatch: sanitizedServeStateByMatch,
    initialPointHistoryByMatch: sanitizedPointHistoryByMatch,
    restoredFromDraft:
      Object.keys(sanitizedScores).length > 0 ||
      Object.keys(sanitizedServeStateByMatch).length > 0 ||
      Object.keys(sanitizedPointHistoryByMatch).length > 0,
    shouldClearDraft: false,
  };
}
