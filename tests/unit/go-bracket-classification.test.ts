import { describe, expect, it } from 'vitest';
import { classifySingleElimination } from '../../web/lib/go-next/bracket-classification';

describe('GO single-elimination final classification', () => {
  it('classifies every entrant with standard tied places', () => {
    const rows = classifySingleElimination(
      ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'],
      [
        { bracketRound: 1, teamAId: 's1', teamBId: 's8', winnerId: 's1', status: 'finished' },
        { bracketRound: 1, teamAId: 's4', teamBId: 's5', winnerId: 's4', status: 'finished' },
        { bracketRound: 1, teamAId: 's2', teamBId: 's7', winnerId: 's2', status: 'finished' },
        { bracketRound: 1, teamAId: 's3', teamBId: 's6', winnerId: 's3', status: 'finished' },
        { bracketRound: 2, teamAId: 's1', teamBId: 's4', winnerId: 's1', status: 'finished' },
        { bracketRound: 2, teamAId: 's2', teamBId: 's3', winnerId: 's2', status: 'finished' },
        { bracketRound: 3, teamAId: 's1', teamBId: 's2', winnerId: 's1', status: 'finished' },
      ],
    );

    expect(Object.fromEntries(rows.map((row) => [row.teamId, row.place]))).toEqual({
      s1: 1,
      s2: 2,
      s3: 3,
      s4: 3,
      s5: 5,
      s6: 5,
      s7: 5,
      s8: 5,
    });
  });

  it('classifies a five-team bracket without inventing BYE results', () => {
    const rows = classifySingleElimination(
      ['s1', 's2', 's3', 's4', 's5'],
      [
        { bracketRound: 1, teamAId: 's4', teamBId: 's5', winnerId: 's4', status: 'finished' },
        { bracketRound: 2, teamAId: 's1', teamBId: 's4', winnerId: 's1', status: 'finished' },
        { bracketRound: 2, teamAId: 's2', teamBId: 's3', winnerId: 's2', status: 'finished' },
        { bracketRound: 3, teamAId: 's1', teamBId: 's2', winnerId: 's1', status: 'finished' },
      ],
    );
    expect(rows).toHaveLength(5);
    expect(rows.find((row) => row.teamId === 's5')?.place).toBe(5);
  });

  it('reads legacy one-sided BYE rows without treating them as sporting results', () => {
    const rows = classifySingleElimination(
      ['s1', 's2', 's3', 's4', 's5'],
      [
        { bracketRound: 1, teamAId: 's1', teamBId: null, winnerId: 's1', status: 'finished' },
        { bracketRound: 1, teamAId: 's4', teamBId: 's5', winnerId: 's4', status: 'finished' },
        { bracketRound: 1, teamAId: 's2', teamBId: null, winnerId: 's2', status: 'finished' },
        { bracketRound: 1, teamAId: 's3', teamBId: null, winnerId: 's3', status: 'finished' },
        { bracketRound: 2, teamAId: 's1', teamBId: 's4', winnerId: 's1', status: 'finished' },
        { bracketRound: 2, teamAId: 's2', teamBId: 's3', winnerId: 's2', status: 'finished' },
        { bracketRound: 3, teamAId: 's1', teamBId: 's2', winnerId: 's1', status: 'finished' },
      ],
    );

    expect(rows).toHaveLength(5);
    expect(rows.find((row) => row.teamId === 's1')?.place).toBe(1);
    expect(rows.find((row) => row.teamId === 's5')?.place).toBe(5);
  });

  it('fails closed when a final table would omit an entrant', () => {
    expect(() => classifySingleElimination(
      ['s1', 's2', 's3'],
      [{ bracketRound: 2, teamAId: 's1', teamBId: 's2', winnerId: 's1', status: 'finished' }],
    )).toThrow('incomplete');
  });
});
