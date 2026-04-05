import { describe, expect, it } from 'vitest';
import { buildPrintToursForCourt, buildRosterLines } from '../../web/lib/thai-live/print-schedule';
import type { ThaiBootstrapCourtPlayer } from '../../web/lib/thai-live/types';

describe('thai print schedule', () => {
  it('MN: symbolic pairs use П/Н slots on court', () => {
    const players: ThaiBootstrapCourtPlayer[] = [
      { playerId: 'a', playerName: 'Alpha', gender: 'M' },
      { playerId: 'b', playerName: 'Beta', gender: 'M' },
      { playerId: 'c', playerName: 'Gamma', gender: 'M' },
      { playerId: 'd', playerName: 'Delta', gender: 'M' },
      { playerId: 'w', playerName: 'West', gender: 'M' },
      { playerId: 'x', playerName: 'Xray', gender: 'M' },
      { playerId: 'y', playerName: 'York', gender: 'M' },
      { playerId: 'z', playerName: 'Zed', gender: 'M' },
    ];
    const tours = buildPrintToursForCourt(players, 'MN', 4, 42);
    expect(tours.length).toBe(4);
    const first = tours[0].matches[0];
    expect(first.team1Symbolic).toMatch(/П\d+\+Н\d+/);
    expect(first.team2Symbolic).toMatch(/П\d+\+Н\d+/);
    expect(first.team1Names).toContain('Alpha');
  });

  it('buildRosterLines labels MN pools', () => {
    const players: ThaiBootstrapCourtPlayer[] = Array.from({ length: 8 }, (_, i) => ({
      playerId: `p${i}`,
      playerName: `Name${i}`,
      gender: 'M' as const,
    }));
    const lines = buildRosterLines(players, 'MN');
    expect(lines[0]).toContain('П1');
    expect(lines[4]).toContain('Н1');
  });
});
