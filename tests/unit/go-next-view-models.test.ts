import { describe, expect, it } from 'vitest';
import type { GoBracketSlotView, GoGroupView, GoMatchView, GoTeamView } from '../../web/lib/go-next/types';
import { buildGoBracketViewModel } from '../../web/components/go-next/view-model-bracket';
import { buildGoScheduleViewModel, groupBadgeClass } from '../../web/components/go-next/schedule/view-model';
import { buildRosterLevelSummary, byeInfo, nextPowerOf2 } from '../../web/components/go-next/setup/view-model';

function createTeam(overrides: Partial<GoTeamView>): GoTeamView {
  return {
    teamId: 'team',
    teamIdx: 1,
    seed: null,
    initialBucket: 'hard',
    isBye: false,
    player1: { id: 'p1', name: 'Player 1' },
    player2: { id: 'p2', name: 'Player 2' },
    ratingSnapshot: 1000,
    label: 'Team',
    ...overrides,
  };
}

function createGroup(teams: GoTeamView[]): GoGroupView {
  return {
    groupId: 'g1',
    groupNo: 1,
    label: 'A',
    status: 'pending',
    effectiveTeamCount: teams.filter((t) => !t.isBye).length,
    hasBye: teams.some((t) => t.isBye),
    teams,
    standings: [],
  };
}

describe('go-next view models', () => {
  it('builds bracket layout from brackets even without matches', () => {
    const teamA = createTeam({ teamId: 'a', label: 'A' });
    const teamB = createTeam({ teamId: 'b', label: 'B' });
    const slots: GoBracketSlotView[] = [
      { slotId: 's1', bracketLevel: 'hard', bracketRound: 1, position: 1, team: teamA, isBye: false, nextSlotId: 's5', matchId: 'm1' },
      { slotId: 's2', bracketLevel: 'hard', bracketRound: 1, position: 2, team: teamB, isBye: false, nextSlotId: 's5', matchId: null },
      { slotId: 's5', bracketLevel: 'hard', bracketRound: 2, position: 1, team: null, isBye: false, nextSlotId: null, matchId: 'm2' },
      { slotId: 's6', bracketLevel: 'hard', bracketRound: 2, position: 2, team: null, isBye: false, nextSlotId: null, matchId: null },
    ];
    const model = buildGoBracketViewModel({ brackets: { hard: slots }, level: 'hard' });
    expect(model.rounds).toHaveLength(2);
    expect(model.teamCount).toBe(2);
    expect(model.gridSize).toBe(2);
    expect(model.rounds[0].slots[0].overlay).toBeUndefined();
  });

  it('applies match overlay score to both slots in a pair', () => {
    const teamA = createTeam({ teamId: 'a', label: 'A' });
    const teamB = createTeam({ teamId: 'b', label: 'B' });
    const slots: GoBracketSlotView[] = [
      { slotId: 's1', bracketLevel: 'hard', bracketRound: 1, position: 1, team: teamA, isBye: false, nextSlotId: 's5', matchId: 'm1' },
      { slotId: 's2', bracketLevel: 'hard', bracketRound: 1, position: 2, team: teamB, isBye: false, nextSlotId: 's5', matchId: null },
    ];
    const match: GoMatchView = {
      matchId: 'm1',
      matchNo: 1,
      courtNo: 1,
      teamA,
      teamB,
      scoreA: [],
      scoreB: [],
      setsA: 2,
      setsB: 1,
      winnerId: 'a',
      walkover: 'none',
      status: 'finished',
      scheduledAt: null,
      slotIndex: 1,
      groupLabel: null,
      bracketLevel: 'hard',
      bracketRound: 1,
    };
    const model = buildGoBracketViewModel({ brackets: { hard: slots }, level: 'hard', matches: [match] });
    expect(model.rounds[0].slots[0].overlay?.setsA).toBe(2);
    expect(model.rounds[0].slots[1].overlay?.setsA).toBe(2);
    expect(model.rounds[0].slots[0].isWinner).toBe(true);
    expect(model.rounds[0].slots[1].isWinner).toBe(false);
  });

  it('builds schedule filter/time model with stable fallbacks', () => {
    const teamA = createTeam({ teamId: 'a', label: 'Alpha' });
    const teamB = createTeam({ teamId: 'b', label: 'Beta' });
    const teamC = createTeam({ teamId: 'c', label: 'Gamma' });
    const teamD = createTeam({ teamId: 'd', label: 'Delta' });
    const matches: GoMatchView[] = [
      {
        matchId: 'm1',
        matchNo: 2,
        courtNo: 1,
        teamA,
        teamB,
        scoreA: [],
        scoreB: [],
        setsA: 0,
        setsB: 0,
        winnerId: null,
        walkover: 'none',
        status: 'pending',
        scheduledAt: '2026-04-14T08:30:00.000Z',
        slotIndex: 1,
        groupLabel: 'A',
        bracketLevel: null,
        bracketRound: null,
      },
      {
        matchId: 'm2',
        matchNo: 1,
        courtNo: 2,
        teamA: teamC,
        teamB: teamD,
        scoreA: [],
        scoreB: [],
        setsA: 1,
        setsB: 2,
        winnerId: 'd',
        walkover: 'none',
        status: 'finished',
        scheduledAt: '2026-04-14T08:00:00.000Z',
        slotIndex: 1,
        groupLabel: null,
        bracketLevel: 'hard',
        bracketRound: 1,
      },
    ];

    const model = buildGoScheduleViewModel({
      matches,
      courts: [{ courtNo: 1, label: 'Court 1' }, { courtNo: 2, label: 'Court 2' }],
      activeFilter: 'g:A',
    });

    expect(model.groupLabels).toEqual(['A']);
    expect(model.bracketLevels).toEqual(['HARD']);
    expect(model.filteredMatches).toHaveLength(1);
    expect(model.slotTimeMap.has(1)).toBe(true);
  });

  it('uses deterministic fallback color for unknown groups', () => {
    expect(groupBadgeClass('Z')).toContain('bg-white/10');
  });

  it('builds roster summary with medium disabled in levelCount=2', () => {
    const teams = [
      createTeam({ teamId: 'h1', label: 'H1', initialBucket: 'hard' }),
      createTeam({ teamId: 'h2', label: 'H2', initialBucket: 'hard' }),
      createTeam({ teamId: 'm1', label: 'M1', initialBucket: 'medium' }),
      createTeam({ teamId: 'bye', label: 'BYE', initialBucket: 'lite', isBye: true }),
      createTeam({ teamId: 'tbd', label: 'TBD', initialBucket: 'lite' }),
    ];
    const summary = buildRosterLevelSummary([createGroup(teams)], 2);
    expect(summary.hard.teamCount).toBe(2);
    expect(summary.medium.isUsed).toBe(false);
    expect(summary.medium.teamCount).toBe(1);
  });

  it('keeps bye helpers deterministic', () => {
    expect(nextPowerOf2(5)).toBe(8);
    expect(byeInfo(5)).toEqual({ gridSize: 8, byeCount: 3, ok: true });
    expect(byeInfo(1)).toEqual({ gridSize: 2, byeCount: 1, ok: false });
  });
});
