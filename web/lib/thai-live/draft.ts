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
  return validKind && validScoreBefore && validScoreAfter && Number.isFinite(Number(event.seqNo));
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

  return {
    initialScores: input.draft.scores,
    initialServeStateByMatch: input.draft.serveStateByMatch,
    initialPointHistoryByMatch: input.draft.pointHistoryByMatch,
    restoredFromDraft:
      Object.keys(input.draft.scores).length > 0 ||
      Object.keys(input.draft.serveStateByMatch).length > 0 ||
      Object.keys(input.draft.pointHistoryByMatch).length > 0,
    shouldClearDraft: false,
  };
}
