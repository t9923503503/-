import { describe, expect, it } from 'vitest';
import { buildDeterministicRecommendation, coachRepetitionPenalty } from '../../web/lib/coach/recommendation-engine';
import type { CoachRecommendationCandidate, CoachRecommendationInput } from '../../web/lib/coach/recommendation-types';

const participants = Array.from({ length: 8 }, (_, index) => `${index + 1}1111111-1111-4111-8111-111111111111`);

function candidate(overrides: Partial<CoachRecommendationCandidate> = {}): CoachRecommendationCandidate {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    title: 'Приём после движения',
    category: 'reception',
    levelCode: 'all',
    intensity: 'medium',
    playerMin: 2,
    playerMax: 8,
    courtCount: 1,
    durationMinutes: 20,
    favorite: false,
    recommended: false,
    coachRating: null,
    skillIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
    primarySkillId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    primarySkillName: 'Приём',
    matchedParticipantIds: [],
    matchedHighPriorityCount: 0,
    matchedPriorityWeight: 0,
    lastUsedAt: null,
    usedInLastSession: false,
    usedInLast3: 0,
    usedInLast5: 0,
    recentCategorySeconds: 0,
    ...overrides,
  };
}

function input(overrides: Partial<CoachRecommendationInput> = {}): CoachRecommendationInput {
  return {
    durationMinutes: 90,
    courtCount: 2,
    participantIds: participants,
    focusSkillId: null,
    levelCode: 'auto',
    intensity: 'auto',
    replaceExisting: false,
    ...overrides,
  };
}

describe('LP Coach deterministic recommendation engine', () => {
  it('applies the strongest configured repetition penalty', () => {
    expect(coachRepetitionPenalty({ usedInLastSession: true, usedInLast3: 2, usedInLast5: 3 })).toBe(35);
    expect(coachRepetitionPenalty({ usedInLastSession: false, usedInLast3: 2, usedInLast5: 2 })).toBe(24);
    expect(coachRepetitionPenalty({ usedInLastSession: false, usedInLast3: 1, usedInLast5: 3 })).toBe(18);
  });

  it('prefers a focus exercise tied to high-priority group problems', () => {
    const focusSkillId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const focused = candidate({
      matchedParticipantIds: participants.slice(0, 3),
      matchedHighPriorityCount: 3,
      matchedPriorityWeight: 14,
    });
    const repeated = candidate({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      title: 'Любимое игровое упражнение',
      category: 'game',
      favorite: true,
      recommended: true,
      coachRating: 5,
      primarySkillId: null,
      skillIds: [],
      usedInLastSession: true,
      usedInLast3: 2,
      usedInLast5: 3,
      lastUsedAt: '2026-08-10T10:00:00.000Z',
    });
    const result = buildDeterministicRecommendation({ input: input({ durationMinutes: 20, focusSkillId }), candidates: [repeated, focused], inferredLevel: 'medium', now: new Date('2026-08-11T10:00:00.000Z') });
    expect(result.items[0].exerciseId).toBe(focused.id);
    expect(result.items[0].reasons.join(' ')).toContain('высокого приоритета');
    expect(result.items[0].reasons.join(' ')).toContain('выбранным фокусом');
  });

  it('assigns an exercise to the affected subgroup when the whole group is too large', () => {
    const subgroup = candidate({ playerMin: 2, playerMax: 4, matchedParticipantIds: participants.slice(0, 3) });
    const result = buildDeterministicRecommendation({ input: input({ durationMinutes: 20 }), candidates: [subgroup], inferredLevel: 'medium' });
    expect(result.items[0].participantIds).toEqual([...participants.slice(0, 3)].sort());
    expect(result.items[0].reasons[0]).toContain('3 из 8');
  });

  it('filters incompatible courts, explicit level and intensity without inventing a plan', () => {
    const result = buildDeterministicRecommendation({
      input: input({ courtCount: 1, levelCode: 'light', intensity: 'low' }),
      candidates: [candidate({ courtCount: 2, levelCode: 'hard', intensity: 'high' })],
      inferredLevel: 'light',
    });
    expect(result.items).toEqual([]);
    expect(result.plannedDurationMinutes).toBe(0);
  });
});

