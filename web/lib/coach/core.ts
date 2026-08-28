import type { CoachSkillEvaluation, CoachTrend } from './types';

export function deriveScoreTrend(scoresNewestFirst: number[]): CoachTrend {
  if (scoresNewestFirst.length < 2) return 'new';
  if (scoresNewestFirst[0] > scoresNewestFirst[1]) return 'up';
  if (scoresNewestFirst[0] < scoresNewestFirst[1]) return 'down';
  return 'flat';
}

export function latestEvaluationsBySkill(
  evaluations: CoachSkillEvaluation[],
): Array<CoachSkillEvaluation & { trend: CoachTrend }> {
  const grouped = new Map<string, CoachSkillEvaluation[]>();
  for (const evaluation of evaluations) {
    const values = grouped.get(evaluation.skillId) ?? [];
    values.push(evaluation);
    grouped.set(evaluation.skillId, values);
  }
  return Array.from(grouped.values()).map((values) => ({
    ...values[0],
    trend: deriveScoreTrend(values.map((item) => item.score)),
  }));
}

export function confidenceLabel(value: number): 'Низкая' | 'Средняя' | 'Высокая' {
  if (value >= 0.8) return 'Высокая';
  if (value >= 0.5) return 'Средняя';
  return 'Низкая';
}
