export const RATING_POINTS_TABLE = [
  100, 90, 82, 76, 70, 65, 60, 56, 52, 48,
  44, 42, 40, 38, 36, 34, 32, 30, 28, 26,
  24, 22, 20, 18, 16, 14, 12, 10, 8, 7,
  6, 5, 4, 3, 2, 2, 1, 1, 1, 1,
] as const;

export type RatingPool = 'pro' | 'novice';
export type TournamentRatingLevel = 'hard' | 'advance' | 'medium' | 'lite';

export const RATING_LEVEL_TABLES: Record<TournamentRatingLevel, readonly number[]> = {
  hard: [100, 90, 82, 76],
  advance: [70, 65, 60, 56, 52],
  medium: [48, 44, 42, 40],
  lite: [38, 36, 34, 32],
} as const;

export function normalizeTournamentRatingLevel(level: string | null | undefined): TournamentRatingLevel {
  const normalized = String(level || '').trim().toLowerCase();
  if (normalized === 'advance' || normalized === 'advanced') return 'advance';
  if (normalized === 'medium' || normalized === 'mid') return 'medium';
  if (normalized === 'lite' || normalized === 'light' || normalized === 'easy' || normalized === 'novice') {
    return 'lite';
  }
  return 'hard';
}

export function pointsForPlace(place: number): number {
  const p = Math.floor(Number(place));
  if (p < 1 || p > RATING_POINTS_TABLE.length) return 1;
  return RATING_POINTS_TABLE[p - 1];
}

export function pointsForLevelPlace(place: number, level: TournamentRatingLevel = 'hard'): number {
  const normalizedLevel = normalizeTournamentRatingLevel(level);
  const table = RATING_LEVEL_TABLES[normalizedLevel];
  const p = Math.floor(Number(place));
  if (p < 1 || p > table.length) return 1;
  return table[p - 1];
}

export function ratingPointsForPlace(place: number, pool: RatingPool = 'pro'): number {
  const base = pointsForPlace(place);
  if (pool === 'novice') {
    return Math.round(base / 2);
  }
  return base;
}

export function ratingPointsForLevelPlace(
  place: number,
  level: TournamentRatingLevel = 'hard',
  pool: RatingPool = 'pro',
): number {
  const base = pointsForLevelPlace(place, level);
  if (pool === 'novice') {
    return Math.round(base / 2);
  }
  return base;
}

export function effectiveRatingPtsFromStored(
  place: number,
  pool: RatingPool,
  storedRatingPts: number | null | undefined,
  level?: TournamentRatingLevel | null,
): number {
  const computed = level ? ratingPointsForLevelPlace(place, level, pool) : ratingPointsForPlace(place, pool);
  const s = storedRatingPts == null ? Number.NaN : Number(storedRatingPts);
  return Number.isFinite(s) && s > 0 ? s : computed;
}

export function sqlEffectiveRatingPointsExpr(trAlias = 'tr'): string {
  return `CASE
    WHEN COALESCE(${trAlias}.rating_pts, 0) > 0
    THEN ${trAlias}.rating_pts
    WHEN COALESCE(${trAlias}.rating_pool, 'pro') = 'novice'
    THEN ROUND(COALESCE(lk.pts, 1)::numeric / 2)::int
    ELSE COALESCE(lk.pts, 1)
  END`;
}
