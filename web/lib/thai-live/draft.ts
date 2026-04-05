import type { ThaiJudgeMatchView, ThaiJudgeSnapshot } from './types';

export interface ThaiJudgeDraftPayload {
  version: 1;
  savedAt: string;
  scores: Record<string, { team1: number; team2: number }>;
}

function isFiniteScore(value: unknown): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
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
    const parsed = JSON.parse(raw) as ThaiJudgeDraftPayload;
    if (!parsed || parsed.version !== 1 || typeof parsed.scores !== 'object' || parsed.scores == null) {
      return null;
    }

    const scores = Object.fromEntries(
      Object.entries(parsed.scores).filter(([, score]) => {
        return isFiniteScore(score?.team1) && isFiniteScore(score?.team2);
      }),
    ) as Record<string, { team1: number; team2: number }>;

    return {
      version: 1,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date(0).toISOString(),
      scores,
    };
  } catch {
    return null;
  }
}

export function serializeThaiJudgeDraft(
  scores: Record<string, { team1: number; team2: number }>,
): ThaiJudgeDraftPayload {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    scores,
  };
}

export function getThaiJudgeServerScores(matches: ThaiJudgeMatchView[]): Record<string, { team1: number; team2: number }> {
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
  initialScores: Record<string, { team1: number; team2: number }>;
  restoredFromDraft: boolean;
  shouldClearDraft: boolean;
} {
  const serverScores = getThaiJudgeServerScores(input.snapshot.matches);
  if (input.snapshot.kind !== 'active' || input.snapshot.tourStatus !== 'pending') {
    return {
      initialScores: serverScores,
      restoredFromDraft: false,
      shouldClearDraft: Boolean(input.draft),
    };
  }

  if (Object.keys(serverScores).length > 0) {
    return {
      initialScores: serverScores,
      restoredFromDraft: false,
      shouldClearDraft: Boolean(input.draft),
    };
  }

  if (!input.draft) {
    return {
      initialScores: {},
      restoredFromDraft: false,
      shouldClearDraft: false,
    };
  }

  return {
    initialScores: input.draft.scores,
    restoredFromDraft: Object.keys(input.draft.scores).length > 0,
    shouldClearDraft: false,
  };
}
