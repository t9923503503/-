import { describe, expect, it } from 'vitest';
import {
  assignByes,
  buildBracketSeedOrder,
  calcBracketSize,
  generateBracketSlots,
  getNextSlotPosition,
  planStructuralByeUpdates,
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
    expect(byesForFive.find((slot) => slot.position === 2)?.teamId).toBeNull();
    expect(byesForFive.find((slot) => slot.position === 5)?.teamId).toBe('s2');
    expect(byesForFive.find((slot) => slot.position === 6)?.teamId).toBeNull();
  });

  it.each([
    [4, [1, 4, 2, 3]],
    [8, [1, 8, 4, 5, 2, 7, 3, 6]],
    [16, [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]],
    [32, [1, 32, 16, 17, 8, 25, 9, 24, 4, 29, 13, 20, 5, 28, 12, 21, 2, 31, 15, 18, 7, 26, 10, 23, 3, 30, 14, 19, 6, 27, 11, 22]],
    [64, [1, 64, 32, 33, 16, 49, 17, 48, 8, 57, 25, 40, 9, 56, 24, 41, 4, 61, 29, 36, 13, 52, 20, 45, 5, 60, 28, 37, 12, 53, 21, 44, 2, 63, 31, 34, 15, 50, 18, 47, 7, 58, 26, 39, 10, 55, 23, 42, 3, 62, 30, 35, 14, 51, 19, 46, 6, 59, 27, 38, 11, 54, 22, 43]],
  ])('uses the canonical P=%i seed-to-slot topology', (size, expected) => {
    expect(buildBracketSeedOrder(size)).toEqual(expected);
    const slots = assignByes(
      Array.from({ length: size }, (_, index) => ({ teamId: `s${index + 1}`, seedQuality: size - index })),
      size,
    );
    expect(slots.map((slot) => Number(slot.teamId?.slice(1)))).toEqual(expected);
  });

  it('keeps every N=3..48 deterministic and gives structural BYEs to the top seeds', () => {
    for (let teamCount = 3; teamCount <= 48; teamCount += 1) {
      const size = calcBracketSize(teamCount);
      const slots = assignByes(
        Array.from({ length: teamCount }, (_, index) => ({ teamId: `s${index + 1}`, seedQuality: teamCount - index })),
        size,
      );
      const byeCount = size - teamCount;
      expect(slots).toHaveLength(size);
      expect(slots.filter((slot) => slot.teamId)).toHaveLength(teamCount);
      expect(slots.filter((slot) => slot.isBye)).toHaveLength(byeCount);

      const slotByTeam = new Map(slots.filter((slot) => slot.teamId).map((slot) => [slot.teamId, slot.position]));
      for (let seed = 1; seed <= byeCount; seed += 1) {
        const position = slotByTeam.get(`s${seed}`);
        expect(position).toBeTypeOf('number');
        const opponentPosition = Number(position) % 2 === 0 ? Number(position) - 1 : Number(position) + 1;
        expect(slots[opponentPosition - 1]?.teamId).toBeNull();
      }
    }
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

  it('propagates multi-round structural BYEs but stops before a real opponent', () => {
    const [bracket] = generateBracketSlots(
      { hard: [{ teamId: 's1', seedQuality: 2 }, { teamId: 's2', seedQuality: 1 }] },
      { hard: 8 },
    );
    const slots = bracket.slots.map((slot) => ({
      slotId: `hard:${slot.bracketRound}:${slot.position}`,
      bracketLevel: 'hard',
      bracketRound: slot.bracketRound,
      position: slot.position,
      teamId: slot.teamId,
      nextSlotId: slot.nextSlotPosition
        ? `hard:${slot.nextSlotPosition.round}:${slot.nextSlotPosition.position}`
        : null,
      isBye: slot.isBye,
    }));
    const updates = planStructuralByeUpdates(slots);
    const resolved = new Map(slots.map((slot) => [slot.slotId, { ...slot }]));
    for (const update of updates) Object.assign(resolved.get(update.slotId), update);

    expect(resolved.get('hard:3:1')?.teamId).toBe('s1');
    expect(resolved.get('hard:3:2')?.teamId).toBe('s2');
    expect(resolved.get('hard:4:1')?.teamId).toBeNull();
    expect(resolved.get('hard:4:1')?.isBye).toBe(false);
  });

  it('maps first-round slots into the next bracket round', () => {
    expect(getNextSlotPosition(1, 1)).toEqual({ round: 2, position: 1 });
    expect(getNextSlotPosition(1, 2)).toEqual({ round: 2, position: 1 });
    expect(getNextSlotPosition(2, 1)).toEqual({ round: 3, position: 1 });
  });
});
