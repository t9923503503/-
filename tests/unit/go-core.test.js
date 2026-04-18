import { describe, expect, it } from 'vitest';
import {
  buildBalancedGoGroups,
  buildCourtSchedule,
  calcMatchPoints,
  calculateStandings,
  generateGroupSchedule,
  generateRoundRobin,
  resolveGroupTiebreak,
} from '../../web/lib/go-next/core.ts';
import {
  buildGoCourtPin,
  buildGoStructuralSignature,
  validateGoSetup,
} from '../../web/lib/go-next-config.ts';
import { normalizeGoAdminSettings } from '../../web/lib/admin-legacy-sync.ts';

function makeTeam(teamId, rating, initialBucket) {
  return { teamId, rating, initialBucket };
}

describe('go-next core', () => {
  it('builds round-robin schedules for 3 and 4 team groups', () => {
    const rr3 = generateRoundRobin(3);
    expect(rr3).toHaveLength(3);
    expect(rr3.flat().filter(([left, right]) => left !== -1 && right !== -1)).toHaveLength(3);

    const rr4 = generateRoundRobin(4);
    expect(rr4).toHaveLength(3);
    expect(rr4.flat().filter(([left, right]) => left !== -1 && right !== -1)).toHaveLength(6);
  });

  it('balances GO groups by the 2-1-1 formula and injects a BYE when needed', () => {
    const groups = buildBalancedGoGroups(
      [
        makeTeam('h1', 99, 'hard'),
        makeTeam('h2', 98, 'hard'),
        makeTeam('h3', 97, 'hard'),
        makeTeam('m1', 80, 'medium'),
        makeTeam('m2', 79, 'medium'),
        makeTeam('l1', 60, 'lite'),
        makeTeam('l2', 59, 'lite'),
      ],
      {
        groupFormula: { hard: 2, medium: 1, lite: 1 },
        seedingMode: 'serpentine',
        seed: 7,
      },
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(4);
    expect(groups[1]).toHaveLength(4);
    expect(groups.flat().filter((team) => team.isBye)).toHaveLength(1);
  });

  it('generates bo3 4-team groups as 1v4, 2v3, then WW and LL', () => {
    expect(generateGroupSchedule(4, 'bo3')).toEqual([
      { teamAIndex: 0, teamBIndex: 3, phase: 1, source: 'fixed' },
      { teamAIndex: 1, teamBIndex: 2, phase: 1, source: 'fixed' },
      { teamAIndex: null, teamBIndex: null, phase: 2, source: 'winners' },
      { teamAIndex: null, teamBIndex: null, phase: 2, source: 'losers' },
    ]);
    expect(generateGroupSchedule(3, 'bo3').filter((match) => match.source === 'fixed')).toHaveLength(3);
    expect(generateGroupSchedule(4, 'single21').filter((match) => match.source === 'fixed')).toHaveLength(6);
  });

  it('schedules matches without same-slot conflicts and skips back-to-back when possible', () => {
    const schedule = buildCourtSchedule(
      [
        { matchKey: 'g1m1', phase: 1, groupKey: 'A', teamIds: ['a', 'd'] },
        { matchKey: 'g1m2', phase: 1, groupKey: 'A', teamIds: ['b', 'c'] },
        { matchKey: 'g2m1', phase: 1, groupKey: 'B', teamIds: ['e', 'h'] },
        { matchKey: 'g2m2', phase: 1, groupKey: 'B', teamIds: ['f', 'g'] },
        { matchKey: 'g1m3', phase: 2, groupKey: 'A', teamIds: ['a', 'b'] },
        { matchKey: 'g2m3', phase: 2, groupKey: 'B', teamIds: ['e', 'f'] },
      ],
      2,
      '2026-04-13T03:00:00.000Z',
      30,
    );

    const bySlot = schedule.reduce((acc, item) => {
      acc[item.slotIndex] = acc[item.slotIndex] ?? [];
      acc[item.slotIndex].push(item.matchKey);
      return acc;
    }, {});
    expect(Object.values(bySlot).every((matches) => matches.length <= 2)).toBe(true);
    expect(schedule.find((item) => item.matchKey === 'g1m3')?.slotIndex).toBeGreaterThanOrEqual(1);
  });

  it('calculates standings by wins, set ratio, point ratio, then H2H', () => {
    expect(calcMatchPoints(2, 0, 'fivb')).toBe(3);
    expect(calcMatchPoints(2, 1, 'fivb')).toBe(2);
    expect(calcMatchPoints(1, 2, 'fivb')).toBe(1);

    const rows = calculateStandings(
      [
        {
          matchId: 'm1',
          teamAId: 'a',
          teamBId: 'b',
          setsA: 2,
          setsB: 0,
          scoreA: [21, 21],
          scoreB: [16, 18],
          walkover: 'none',
        },
        {
          matchId: 'm2',
          teamAId: 'b',
          teamBId: 'c',
          setsA: 2,
          setsB: 1,
          scoreA: [21, 18, 15],
          scoreB: [17, 21, 12],
          walkover: 'none',
        },
        {
          matchId: 'm3',
          teamAId: 'c',
          teamBId: 'a',
          setsA: 1,
          setsB: 2,
          scoreA: [19, 21, 13],
          scoreB: [21, 18, 15],
          walkover: 'none',
        },
      ],
      ['a', 'b', 'c'],
      { matchPointSystem: 'fivb', tieBreakerLogic: 'fivb' },
    );

    expect(rows.map((row) => row.teamId)).toEqual(['a', 'b', 'c']);
    expect(rows[0].wins).toBe(2);
    expect(rows[0].pointDiff).toBeGreaterThan(rows[1].pointDiff);
  });

  it('uses subgroup mini-table/H2H for exact ties and preserves classic fallback', () => {
    const headToHeadRows = resolveGroupTiebreak(
      [
        {
          teamId: 'a',
          teamLabel: 'a',
          played: 2,
          wins: 1,
          losses: 1,
          matchPoints: 3,
          setsWon: 2,
          setsLost: 2,
          pointsFor: 40,
          pointsAgainst: 40,
          setQuotient: 1,
          pointQuotient: 1,
          pointDiff: 0,
          position: 0,
        },
        {
          teamId: 'b',
          teamLabel: 'b',
          played: 2,
          wins: 1,
          losses: 1,
          matchPoints: 3,
          setsWon: 2,
          setsLost: 2,
          pointsFor: 40,
          pointsAgainst: 40,
          setQuotient: 1,
          pointQuotient: 1,
          pointDiff: 0,
          position: 0,
        },
      ],
      [
        {
          matchId: 'h1',
          teamAId: 'a',
          teamBId: 'b',
          setsA: 2,
          setsB: 0,
          scoreA: [21, 21],
          scoreB: [18, 18],
          walkover: 'none',
        },
      ],
      'fivb',
    );
    expect(headToHeadRows.map((row) => row.teamId)).toEqual(['a', 'b']);

    const classicRows = resolveGroupTiebreak(headToHeadRows, [], 'classic');
    expect(classicRows.map((row) => row.teamId)).toEqual(['a', 'b']);
  });

  it('normalizes go admin settings and validates setup contracts', () => {
    const settings = normalizeGoAdminSettings({
      courts: 5,
      matchFormat: 'bo3',
      seedingMode: 'manual',
      goEnabledPlayoffLeagues: ['lyutye', 'hard', 'medium'],
      goBracketSizes: { lyutye: 4, hard: 8, medium: 4 },
      goGroupFormulaHard: 2,
      goGroupFormulaMedium: 1,
      goGroupFormulaLite: 1,
      goSlotMinutes: 25,
      goStartTime: '09:15',
      goBronzeMatchEnabled: false,
      matchPointSystem: 'simple',
      tieBreakerLogic: 'classic',
    });

    expect(settings.groupFormula).toEqual({ hard: 2, medium: 1, lite: 1 });
    expect(settings.enabledPlayoffLeagues).toEqual(['lyutye', 'hard', 'medium']);
    expect(settings.bracketSizes.hard).toBe(8);
    expect(settings.startTime).toBe('09:15');
    expect(validateGoSetup(settings, 17)).toBe('GO requires an even number of participants.');
    expect(validateGoSetup(settings, 24)).toBeNull();
    expect(buildGoCourtPin('tour', 3)).toHaveLength(8);
    expect(buildGoStructuralSignature(settings, 24)).toHaveLength(40);
  });
});
