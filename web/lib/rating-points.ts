/**
 * Таблица очков за место (как в SPA `assets/js/state/app-state.js` и `web/lib/queries.ts`).
 * Профи: полные очки. Новички (Thai M/N и т.п.): round(очки / 2).
 */
export const RATING_POINTS_TABLE = [
  100, 90, 82, 76, 70, 65, 60, 56, 52, 48, // 1-10  HARD
  44, 42, 40, 38, 36, 34, 32, 30, 28, 26, // 11-20 MEDIUM
  24, 22, 20, 18, 16, 14, 12, 10, 8, 7, // 21-30
  6, 5, 4, 3, 2, 2, 1, 1, 1, 1, // 31-40 LITE
] as const;

export type RatingPool = 'pro' | 'novice';

export function pointsForPlace(place: number): number {
  const p = Math.floor(Number(place));
  if (p < 1 || p > RATING_POINTS_TABLE.length) return 1;
  return RATING_POINTS_TABLE[p - 1];
}

/** Рейтинговые очки с учётом пула: новички — половина от таблицы мест, с округлением. */
export function ratingPointsForPlace(place: number, pool: RatingPool = 'pro'): number {
  const base = pointsForPlace(place);
  if (pool === 'novice') {
    return Math.round(base / 2);
  }
  return base;
}

/**
 * Для UI и архива: если в БД уже записаны рейтинговые очки (>0) — показываем их;
 * иначе считаем по месту и пулу (старые строки без backfill).
 */
export function effectiveRatingPtsFromStored(
  place: number,
  pool: RatingPool,
  storedRatingPts: number | null | undefined,
): number {
  const computed = ratingPointsForPlace(place, pool);
  const s = storedRatingPts == null ? Number.NaN : Number(storedRatingPts);
  return Number.isFinite(s) && s > 0 ? s : computed;
}

/** SQL-фрагмент: эффективные очки из места и rating_pool (pro по умолчанию). */
export function sqlEffectiveRatingPointsExpr(trAlias = 'tr'): string {
  return `CASE
    WHEN COALESCE(${trAlias}.rating_pts, 0) > 0
    THEN ${trAlias}.rating_pts
    WHEN COALESCE(${trAlias}.rating_pool, 'pro') = 'novice'
    THEN ROUND(COALESCE(lk.pts, 1)::numeric / 2)::int
    ELSE COALESCE(lk.pts, 1)
  END`;
}
