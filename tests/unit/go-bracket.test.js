import { describe, expect, it } from 'vitest';
import {
  assignByes,
  calcBracketSize,
  generateBracketSlots,
  getNextSlotPosition,
} from '../../web/lib/go-next/bracket-generator.ts';

describe('go-next bracket generator', () => {
  it('calculates the next power-of-two bracket size', () => {
    expect(calcBracketSize(4)).toBe(4);
    expect(calcBracketSize(5)).toBe(8);
    expect(calcBracketSize(7)).toBe(8);
    expect(calcBracketSize(9)).toBe(16);
  });

  it('assigns byes to top seeds in oversized brackets', () => {
    const byesForFive = assignByes(
      [
        { teamId: 's1', seedQuality: 100 },
        { teamId: 's2', seedQuality: 90 },
        { teamId: 's3', seedQuality: 80 },
        { teamId: 's4', seedQuality: 70 },
        { teamId: 's5', seedQuality: 60 },
      ],
      8,
    );
    expect(byesForFive.filter((slot) => slot.isBye)).toHaveLength(3);
    expect(byesForFive.filter((slot) => slot.teamId)).toHaveLength(5);
    expect(byesForFive.find((slot) => slot.position === 1)?.teamId).toBe('s1');
  });

  it('builds seeded league brackets with explicit sizes and auto-BYE slots', () => {
    const brackets = generateBracketSlots(
      {
        hard: [
          { teamId: '1A', seedQuality: 100 },
          { teamId: '1B', seedQuality: 95 },
          { teamId: '1C', seedQuality: 90 },
          { teamId: '1D', seedQuality: 85 },
          { teamId: '2A', seedQuality: 80 },
        ],
        medium: [
          { teamId: '2B', seedQuality: 70 },
          { teamId: '2C', seedQuality: 65 },
        ],
      },
      { hard: 8, medium: 2 },
    );

    expect(brackets).toHaveLength(2);
    expect(brackets.find((item) => item.level === 'hard')?.size).toBe(8);
    expect(brackets.find((item) => item.level === 'hard')?.slots.filter((slot) => slot.isBye)).toHaveLength(3);
    expect(brackets.find((item) => item.level === 'medium')?.firstRoundMatches).toEqual([
      { teamAId: '2B', teamBId: '2C', bracketRound: 1, position: 1 },
    ]);
  });

  it('maps first-round slots into the next bracket round', () => {
    expect(getNextSlotPosition(1, 1)).toEqual({ round: 2, position: 1 });
    expect(getNextSlotPosition(1, 2)).toEqual({ round: 2, position: 1 });
    expect(getNextSlotPosition(2, 1)).toEqual({ round: 3, position: 1 });
  });
});
