import { describe, expect, it } from 'vitest';
import { normalizeCoachChallengeAttemptInput, normalizeCoachChallengeInput, validateCoachChallengeAttemptInput, validateCoachChallengeInput } from '../../web/lib/coach/challenge-validators';

const skillId = '11111111-1111-4111-8111-111111111111';
const athleteId = '22222222-2222-4222-8222-222222222222';

describe('LP Coach challenge validators', () => {
  it('normalizes a flexible control challenge', () => {
    const input = normalizeCoachChallengeInput({
      title: '  Приём 10 подач  ', type: 'control', scoringType: 'score', attemptCount: '10', maxScore: '30',
      primarySkillId: skillId, metrics: 'Идеальных\nХороших\nОшибок', rules: ['Оценка 0–3'], repeatIntervalDays: '21', higherIsBetter: true,
      additionalSkillIds: [skillId, '33333333-3333-4333-8333-333333333333', 'bad'],
    });
    expect(input.title).toBe('Приём 10 подач');
    expect(input.metrics).toEqual(['Идеальных', 'Хороших', 'Ошибок']);
    expect(input.additionalSkillIds).toEqual(['33333333-3333-4333-8333-333333333333']);
    expect(validateCoachChallengeInput(input)).toBeNull();
  });

  it('supports time where a lower result is better', () => {
    const input = normalizeCoachChallengeInput({ title: 'Спринт к сетке', scoringType: 'time', primarySkillId: skillId });
    expect(input.higherIsBetter).toBe(false);
    expect(input.unitLabel).toBe('сек');
  });

  it('requires a canonical primary skill and positive max', () => {
    expect(validateCoachChallengeInput(normalizeCoachChallengeInput({ title: 'Тест', primarySkillId: 'bad' }))).toContain('основной навык');
    expect(validateCoachChallengeInput(normalizeCoachChallengeInput({ title: 'Тест', primarySkillId: skillId, maxScore: -1 }))).toContain('Максимум');
  });

  it('normalizes a quick attempt without optional fields', () => {
    const input = normalizeCoachChallengeAttemptInput({ playerId: athleteId, score: '18.5', coachComment: '  лучше платформа  ' });
    expect(input.playerId).toBe(athleteId);
    expect(input.score).toBe(18.5);
    expect(input.coachComment).toBe('лучше платформа');
    expect(validateCoachChallengeAttemptInput(input)).toBeNull();
  });

  it('rejects an attempt without athlete or result', () => {
    expect(validateCoachChallengeAttemptInput(normalizeCoachChallengeAttemptInput({ score: 12 }))).toContain('ученика');
    expect(validateCoachChallengeAttemptInput(normalizeCoachChallengeAttemptInput({ playerId: athleteId }))).toContain('результат');
  });
});
