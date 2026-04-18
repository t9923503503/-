export type ThaiGenderFilter = 'all' | 'M' | 'W';

export function getThaiErrorText(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

export function resolveAbsoluteJudgeUrl(
  judgeUrl: string,
  origin?: string | null,
): string {
  const normalizedUrl = String(judgeUrl || '').trim();
  if (!normalizedUrl) return '';
  if (/^https?:\/\//i.test(normalizedUrl)) return normalizedUrl;
  const normalizedOrigin = String(origin || '').trim();
  if (!normalizedOrigin) return normalizedUrl;
  try {
    return new URL(normalizedUrl, normalizedOrigin).toString();
  } catch {
    return normalizedUrl;
  }
}

export function clampThaiJudgeScore(value: unknown, pointLimit: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(pointLimit, parsed));
}

export function filterPlayersByGenderSelection<T extends { gender: 'M' | 'W' }>(
  players: T[],
  genderFilter: ThaiGenderFilter,
): T[] {
  if (genderFilter === 'all') return players;
  return players.filter((player) => player.gender === genderFilter);
}
