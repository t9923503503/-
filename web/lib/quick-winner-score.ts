export type QuickWinnerSide = 'A' | 'B';

export interface QuickWinnerScore {
  winner: QuickWinnerSide;
  loserPoints: number;
  scoreA: number;
  scoreB: number;
}

function positiveInteger(value: number): number {
  const normalized = Math.trunc(Number(value));
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new RangeError('Target score must be a positive integer.');
  }
  return normalized;
}

/**
 * Builds the standard two-tap result: choose the winner, then the losing score.
 * The losing score is normalized to the valid 0..target-1 range for touch input.
 */
export function buildQuickWinnerScore(
  target: number,
  winner: QuickWinnerSide,
  loserPoints: number,
): QuickWinnerScore {
  const normalizedTarget = positiveInteger(target);
  const numericLoserPoints = Number(loserPoints);
  const normalizedLoserPoints = Math.max(
    0,
    Math.min(
      normalizedTarget - 1,
      Number.isFinite(numericLoserPoints) ? Math.trunc(numericLoserPoints) : 0,
    ),
  );

  return {
    winner,
    loserPoints: normalizedLoserPoints,
    scoreA: winner === 'A' ? normalizedTarget : normalizedLoserPoints,
    scoreB: winner === 'B' ? normalizedTarget : normalizedLoserPoints,
  };
}

/**
 * Recognizes a strict quick result. Extended/deuce scores intentionally return null
 * and stay in the full-score workflow.
 */
export function parseQuickWinnerScore(
  target: number,
  scoreA: number,
  scoreB: number,
): QuickWinnerScore | null {
  const normalizedTarget = Math.trunc(Number(target));
  const left = Number(scoreA);
  const right = Number(scoreB);
  if (
    !Number.isInteger(normalizedTarget) || normalizedTarget < 1 ||
    !Number.isInteger(left) || !Number.isInteger(right) ||
    left < 0 || right < 0 || left === right
  ) return null;

  if (left === normalizedTarget && right < normalizedTarget) {
    return { winner: 'A', loserPoints: right, scoreA: left, scoreB: right };
  }
  if (right === normalizedTarget && left < normalizedTarget) {
    return { winner: 'B', loserPoints: left, scoreA: left, scoreB: right };
  }
  return null;
}
