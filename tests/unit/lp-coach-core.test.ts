import { describe, expect, it } from 'vitest';
import { confidenceLabel, deriveScoreTrend, latestEvaluationsBySkill } from '../../web/lib/coach/core';
import type { CoachSkillEvaluation } from '../../web/lib/coach/types';

const evaluation = (skillId: string, score: number, evaluatedAt: string): CoachSkillEvaluation => ({
  id: `${skillId}-${evaluatedAt}`,
  skillId,
  skillName: `Навык ${skillId}`,
  parentName: 'Приём',
  score,
  confidence: 0.8,
  source: 'coach',
  coachComment: '',
  evaluatedAt,
  evaluatedByActor: 'coach-1',
});

describe('LP Coach foundation core', () => {
  it('derives progress from the two latest skill scores', () => {
    expect(deriveScoreTrend([4, 3])).toBe('up');
    expect(deriveScoreTrend([2, 3])).toBe('down');
    expect(deriveScoreTrend([3, 3])).toBe('flat');
    expect(deriveScoreTrend([3])).toBe('new');
  });

  it('keeps the latest evaluation for every skill and preserves history for trend', () => {
    const latest = latestEvaluationsBySkill([
      evaluation('receive', 4, '2026-08-11T10:00:00Z'),
      evaluation('attack', 2, '2026-08-11T09:00:00Z'),
      evaluation('receive', 3, '2026-08-01T10:00:00Z'),
      evaluation('attack', 3, '2026-08-01T09:00:00Z'),
    ]);
    expect(latest).toHaveLength(2);
    expect(latest.find((item) => item.skillId === 'receive')).toMatchObject({ score: 4, trend: 'up' });
    expect(latest.find((item) => item.skillId === 'attack')).toMatchObject({ score: 2, trend: 'down' });
  });

  it('labels confidence without inventing an assessment', () => {
    expect(confidenceLabel(0.4)).toBe('Низкая');
    expect(confidenceLabel(0.65)).toBe('Средняя');
    expect(confidenceLabel(0.8)).toBe('Высокая');
  });
});
