import { buildPlayResultStandings, getCompetitiveMatches, normalizeStructuredPlayResult } from '@/lib/play-result-core';

export interface PlayGameReport {
  matchCount: number;
  closestMatch: { id: string; score: string; margin: number } | null;
  leaderIds: number[];
  bestPair: number[] | null;
  totalPoints: number;
  headline: string;
}

export function buildPlayGameReport(payload: unknown): PlayGameReport | null {
  const result = normalizeStructuredPlayResult(payload);
  if (!result) return null;
  const matches = getCompetitiveMatches(result);
  const closest = matches.length
    ? [...matches].sort((a, b) => Math.abs(a.scoreA - a.scoreB) - Math.abs(b.scoreA - b.scoreB))[0]
    : null;
  const standings = buildPlayResultStandings(result);
  const leader = standings[0];
  const leaderIds = leader
    ? standings.filter((row) => row.wins === leader.wins && row.diff === leader.diff && row.pointsFor === leader.pointsFor).map((row) => row.userId)
    : [];
  const pairStats = new Map<string, { ids: number[]; wins: number; diff: number }>();
  for (const match of matches) {
    for (const [team, won, diff] of [
      [match.teamA, match.scoreA > match.scoreB, match.scoreA - match.scoreB],
      [match.teamB, match.scoreB > match.scoreA, match.scoreB - match.scoreA],
    ] as Array<[number[], boolean, number]>) {
      const ids = [...team].sort((a, b) => a - b);
      const key = ids.join(':');
      const current = pairStats.get(key) ?? { ids, wins: 0, diff: 0 };
      current.wins += won ? 1 : 0;
      current.diff += diff;
      pairStats.set(key, current);
    }
  }
  const bestPair = [...pairStats.values()].sort((a, b) => b.wins - a.wins || b.diff - a.diff)[0]?.ids ?? null;
  const totalPoints = matches.reduce((sum, match) => sum + match.scoreA + match.scoreB, 0);
  return {
    matchCount: matches.length,
    closestMatch: closest ? { id: closest.id, score: `${closest.scoreA}:${closest.scoreB}`, margin: Math.abs(closest.scoreA - closest.scoreB) } : null,
    leaderIds,
    bestPair,
    totalPoints,
    headline: result.format === 'thai_8'
      ? `Сыграно ${matches.length} матчей в четырёх турах`
      : result.format === 'king_sideout'
        ? `Завершено ${result.rounds?.length ?? 0} раундов KING`
        : `Сыграно ${matches.length} ${matches.length === 1 ? 'сет' : 'сета'}`,
  };
}

