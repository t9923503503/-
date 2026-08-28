import { describe, expect, it } from 'vitest';
import {
  normalizeAthleteIssueInput,
  normalizeCoachAthleteInput,
  normalizeSkillEvaluationInput,
  validateAthleteIssueInput,
  validateCoachAthleteInput,
  validateSkillEvaluationInput,
} from '../../web/lib/coach/validators';

const PLAYER_ID = '4a5ae8de-c98b-4f55-b683-2dfdf9b1ff51';

describe('LP Coach input validation', () => {
  it('accepts an existing player identifier and normalized coach profile', () => {
    const input = normalizeCoachAthleteInput({ playerId: PLAYER_ID, levelCode: 'hard', goals: 'Подача' });
    expect(input).toMatchObject({ playerId: PLAYER_ID, levelCode: 'hard', status: 'active', goals: 'Подача' });
    expect(validateCoachAthleteInput(input)).toBeNull();
  });

  it('rejects invalid score and confidence', () => {
    const input = normalizeSkillEvaluationInput({ skillId: PLAYER_ID, score: 7, confidence: 2 });
    expect(validateSkillEvaluationInput(input)).toBe('Оценка должна быть от 1 до 5');
  });

  it('requires a meaningful issue title and bounded priority', () => {
    const short = normalizeAthleteIssueInput({ title: 'x', priority: 3, confidence: 0.8 });
    expect(validateAthleteIssueInput(short)).toContain('минимум 3');
    const priority = normalizeAthleteIssueInput({ title: 'Проблема', priority: 9, confidence: 0.8 });
    expect(validateAthleteIssueInput(priority)).toContain('от 1 до 5');
  });
});
