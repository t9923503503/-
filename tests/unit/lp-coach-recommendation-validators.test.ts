import { describe, expect, it } from 'vitest';
import { parseCoachRecommendationInput } from '../../web/lib/coach/recommendation-validators';

const participantId = '11111111-1111-4111-8111-111111111111';
const focusSkillId = '22222222-2222-4222-8222-222222222222';

describe('LP Coach recommendation validators', () => {
  it('normalizes a complete deterministic request', () => {
    expect(parseCoachRecommendationInput({
      durationMinutes: 89.6,
      courtCount: 2,
      participantIds: [participantId, participantId, 'bad'],
      focusSkillId,
      levelCode: 'medium',
      intensity: 'high',
      replaceExisting: true,
    })).toEqual({
      durationMinutes: 90,
      courtCount: 2,
      participantIds: [participantId],
      focusSkillId,
      levelCode: 'medium',
      intensity: 'high',
      replaceExisting: true,
    });
  });

  it('requires a real participant selection', () => {
    expect(() => parseCoachRecommendationInput({ durationMinutes: 90, courtCount: 1, participantIds: [] })).toThrow('хотя бы одного участника');
  });

  it('rejects out-of-range resources and unknown modes', () => {
    expect(() => parseCoachRecommendationInput({ durationMinutes: 14, courtCount: 1, participantIds: [participantId] })).toThrow('15 до 360');
    expect(() => parseCoachRecommendationInput({ durationMinutes: 90, courtCount: 21, participantIds: [participantId] })).toThrow('от 1 до 20');
    expect(() => parseCoachRecommendationInput({ durationMinutes: 90, courtCount: 1, participantIds: [participantId], levelCode: 'elite' })).toThrow('уровень');
  });
});
