import { describe, expect, it } from 'vitest';

import {
  calculateTierQuotas,
  generateRoundRobinPairings,
  partitionGroups,
  seedGroupsSnake,
  type SeedEntry,
} from '../../web/lib/go-v2/core';
import { solveSchedule, validateSchedule, type ScheduleMatchInput } from '../../web/lib/go-v2/scheduler';

function entries(count: number): SeedEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    entryId: `fixture-team-${index + 1}`,
    rating: 10_000 - index,
    confirmedAt: new Date(Date.UTC(2026, 7, 1, 9, index)).toISOString(),
  }));
}

function materializeWorkbookFixture(teamCount: number) {
  const partition = partitionGroups(teamCount);
  const draw = seedGroupsSnake(entries(teamCount), partition);
  const pairings = draw.groups.flatMap((group) =>
    generateRoundRobinPairings(group.groupId, group.slots.map((slot) => slot.entry)),
  );
  return { partition, draw, pairings };
}

describe('NBVL Покачи workbook control fixtures', () => {
  it.each([
    { label: 'мужчины', teams: 22, groups: 6, threes: 2, fours: 4, matches: 30, tiers: { mode: 'two', hard: 12, medium: 0, light: 10 } },
    { label: 'женщины', teams: 23, groups: 6, threes: 1, fours: 5, matches: 33, tiers: { mode: 'two', hard: 12, medium: 0, light: 11 } },
    { label: 'микст (активные)', teams: 30, groups: 8, threes: 2, fours: 6, matches: 42, tiers: { mode: 'two', hard: 16, medium: 0, light: 14 } },
  ] as const)('$label: duplicate-free draw and expected match/tier totals', (fixture) => {
    const result = materializeWorkbookFixture(fixture.teams);

    expect(result.partition).toMatchObject({
      groupCount: fixture.groups,
      threes: fixture.threes,
      fours: fixture.fours,
    });
    expect(result.pairings).toHaveLength(fixture.matches);
    expect(calculateTierQuotas(fixture.teams, fixture.groups, { mode: 'auto' })).toEqual(fixture.tiers);

    const assignedEntries = result.draw.groups.flatMap((group) =>
      group.slots.map((slot) => slot.entry.entryId),
    );
    expect(assignedEntries).toHaveLength(fixture.teams);
    expect(new Set(assignedEntries).size).toBe(fixture.teams);

    const pairingIds = result.pairings.map((pairing) => pairing.matchId);
    expect(new Set(pairingIds).size).toBe(pairingIds.length);
    const unorderedPairs = result.pairings.map((pairing) => {
      const sourceId = (source: typeof pairing.sourceA) => {
        if (source.kind === 'ENTRY') return source.entryId;
        if (source.kind === 'MATCH_WINNER' || source.kind === 'MATCH_LOSER') return `${source.kind}:${source.matchId}`;
        return 'BYE';
      };
      const left = sourceId(pairing.sourceA);
      const right = sourceId(pairing.sourceB);
      return [pairing.poolId, ...[left, right].sort()].join(':');
    });
    expect(new Set(unorderedPairs).size).toBe(unorderedPairs.length);
  });

  it('schedules the 30-team/42-match control fixture without Excel duplicates or omissions', () => {
    const { pairings } = materializeWorkbookFixture(30);
    const matches: ScheduleMatchInput[] = pairings.map((pairing) => ({
      id: pairing.matchId,
      durationMinutes: 20,
      teamIds: [pairing.sourceA, pairing.sourceB].map((source) => {
        if (source.kind === 'ENTRY') return source.entryId;
        if (source.kind === 'MATCH_WINNER' || source.kind === 'MATCH_LOSER') return `${source.kind}:${source.matchId}`;
        return 'BYE';
      }),
      stageKind: 'pool',
    }));
    const input = {
      sessionId: 'nbvl-mix-30',
      timezone: 'Asia/Yekaterinburg',
      window: { start: '2026-08-16T04:00:00.000Z', end: '2026-08-16T12:00:00.000Z' },
      courts: Array.from({ length: 4 }, (_, index) => ({ id: `court-${index + 1}` })),
      matches,
      referee: { mode: 'none' as const },
    };

    const solved = solveSchedule(input);
    expect(solved.publishable).toBe(true);
    expect(solved.assignments).toHaveLength(42);
    expect(new Set(solved.assignments.map((assignment) => assignment.matchId)).size).toBe(42);
    expect(validateSchedule(input, solved.assignments)).toMatchObject({ valid: true, publishable: true });
  });
});
