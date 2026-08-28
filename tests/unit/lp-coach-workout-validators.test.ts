import { describe, expect, it } from 'vitest';
import { parseWorkoutExecutionCommand, parseWorkoutItemInput, parseWorkoutPlanCommand } from '../../web/lib/coach/workout-validators';

const exerciseId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const participantId = '33333333-3333-4333-8333-333333333333';
const executionId = '44444444-4444-4444-8444-444444444444';

describe('LP Coach workout validators', () => {
  it('normalizes an item and removes duplicate participants', () => {
    expect(parseWorkoutItemInput({
      exerciseId,
      durationMinutes: 20.2,
      courtLabel: '  Корт 1  ',
      coachNote: '  Приём после движения  ',
      participantIds: [participantId, participantId, 'bad'],
    })).toEqual({
      exerciseId,
      durationMinutes: 20,
      courtLabel: 'Корт 1',
      coachNote: 'Приём после движения',
      participantIds: [participantId],
    });
  });

  it('rejects invalid duration', () => {
    expect(() => parseWorkoutItemInput({ exerciseId, durationMinutes: 0 })).toThrow('длительность');
    expect(() => parseWorkoutItemInput({ exerciseId, durationMinutes: 361 })).toThrow('длительность');
  });

  it('parses plan commands', () => {
    expect(parseWorkoutPlanCommand({ action: 'move_item', itemId, direction: 'down' })).toEqual({ action: 'move_item', itemId, direction: 'down' });
    expect(parseWorkoutPlanCommand({ action: 'complete_session' })).toEqual({ action: 'complete_session' });
  });

  it('requires revision for live timer commands', () => {
    expect(parseWorkoutExecutionCommand({ action: 'pause', executionId, revision: 3 })).toEqual({ action: 'pause', executionId, revision: 3 });
    expect(() => parseWorkoutExecutionCommand({ action: 'pause', executionId, revision: 0 })).toThrow('устаревшая');
  });

  it('allows only two-minute timer adjustments', () => {
    expect(parseWorkoutExecutionCommand({ action: 'adjust', executionId, revision: 2, deltaSeconds: 120 })).toEqual({ action: 'adjust', executionId, revision: 2, deltaSeconds: 120 });
    expect(() => parseWorkoutExecutionCommand({ action: 'adjust', executionId, revision: 2, deltaSeconds: 60 })).toThrow('2 минуты');
  });
});
