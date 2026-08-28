import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../../web/lib/db', () => ({
  getPool: () => ({ query }),
}));

import { fetchHeadToHeadCandidates, fetchHeadToHeadDetails } from '../../web/lib/player-head-to-head';

const PRIMARY_ID = '11111111-1111-4111-8111-111111111111';
const SELECTED_ID = '22222222-2222-4222-8222-222222222222';
const THIRD_ID = '33333333-3333-4333-8333-333333333333';
const FOURTH_ID = '44444444-4444-4444-8444-444444444444';

type MatchFixture = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  date: string;
  score: [number, number];
  selectedSide: 1 | 2;
  tour: number;
};

function rowsForMatch(fixture: MatchFixture) {
  const others = [
    { id: SELECTED_ID, name: 'Соперник', side: fixture.selectedSide },
    { id: THIRD_ID, name: 'Партнёр три', side: fixture.selectedSide === 1 ? 2 : 1 },
    { id: FOURTH_ID, name: 'Партнёр четыре', side: fixture.selectedSide === 1 ? 2 : 2 },
  ];
  return others.map((other) => ({
    match_id: fixture.id,
    tournament_id: fixture.tournamentId,
    tournament_name: fixture.tournamentName,
    tournament_date: fixture.date,
    round_type: fixture.tour > 2 ? 'r2' : 'r1',
    court_no: 1,
    court_label: 'Корт 1',
    tour_no: fixture.tour,
    match_no: 1,
    team1_score: fixture.score[0],
    team2_score: fixture.score[1],
    primary_id: PRIMARY_ID,
    primary_name: 'Основной игрок',
    primary_photo_url: '/primary.jpg',
    primary_side: 1,
    other_id: other.id,
    other_name: other.name,
    other_photo_url: null,
    other_side: other.side,
  }));
}

const rows = [
  ...rowsForMatch({
    id: 'match-1',
    tournamentId: 'tournament-a',
    tournamentName: 'Турнир A',
    date: '2026-07-04',
    score: [15, 13],
    selectedSide: 2,
    tour: 4,
  }),
  ...rowsForMatch({
    id: 'match-2',
    tournamentId: 'tournament-a',
    tournamentName: 'Турнир A',
    date: '2026-07-03',
    score: [21, 8],
    selectedSide: 1,
    tour: 3,
  }),
  ...rowsForMatch({
    id: 'match-3',
    tournamentId: 'tournament-b',
    tournamentName: 'Турнир B',
    date: '2026-07-02',
    score: [9, 15],
    selectedSide: 2,
    tour: 2,
  }),
  ...rowsForMatch({
    id: 'match-4',
    tournamentId: 'tournament-b',
    tournamentName: 'Турнир B',
    date: '2026-07-01',
    score: [10, 10],
    selectedSide: 1,
    tour: 1,
  }),
];

describe('player head-to-head insights', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows });
  });

  it('counts unique matches once in the overview and exposes recent form', async () => {
    const result = await fetchHeadToHeadCandidates({ playerId: PRIMARY_ID, limit: 50 });

    expect(result.summary).toMatchObject({
      uniqueMatches: 4,
      tournaments: 2,
      wins: 2,
      losses: 1,
      draws: 1,
      winRate: 50,
      recentForm: ['win', 'win', 'loss', 'draw'],
      currentStreak: { outcome: 'win', count: 2 },
    });

    const selected = result.players.find((player) => player.id === SELECTED_ID);
    expect(selected).toMatchObject({
      totalMeetings: 4,
      totalWins: 2,
      totalDraws: 1,
      lastMeetingDate: '2026-07-04',
      recentForm: ['win', 'win', 'loss', 'draw'],
    });
  });

  it('keeps both roles separate and returns full match rosters', async () => {
    const result = await fetchHeadToHeadDetails(PRIMARY_ID, SELECTED_ID);

    expect(result.together).toMatchObject({ meetings: 2, wins: 1, losses: 0, draws: 1, winRate: 50 });
    expect(result.against).toMatchObject({ meetings: 2, wins: 1, losses: 1, draws: 0, winRate: 50 });
    expect(result.total).toMatchObject({ meetings: 4, wins: 2, losses: 1, draws: 1, winRate: 50 });
    expect(result.currentStreak).toEqual({ outcome: 'win', count: 2 });
    expect(result.longestWinStreak).toBe(2);
    expect(result.closeMatches).toBe(2);
    expect(result.standout.biggestWin?.scoreLabel).toBe('21:8');
    expect(result.tournaments).toHaveLength(2);

    const first = result.meetings[0];
    expect(first.team1).toHaveLength(2);
    expect(first.team2).toHaveLength(2);
    expect([...first.team1, ...first.team2].map((player) => player.id)).toEqual(
      expect.arrayContaining([PRIMARY_ID, SELECTED_ID, THIRD_ID, FOURTH_ID]),
    );
    expect([...first.team1, ...first.team2].find((player) => player.id === PRIMARY_ID)?.isPrimary).toBe(true);
    expect([...first.team1, ...first.team2].find((player) => player.id === SELECTED_ID)?.isSelected).toBe(true);
  });

  it('keeps the score aligned with the displayed teams when the primary player is on team two', async () => {
    query.mockResolvedValue({
      rows: rowsForMatch({
        id: 'match-team-two',
        tournamentId: 'tournament-c',
        tournamentName: 'Турнир C',
        date: '2026-07-05',
        score: [15, 13],
        selectedSide: 1,
        tour: 1,
      }).map((row) => ({ ...row, primary_side: 2 })),
    });

    const result = await fetchHeadToHeadDetails(PRIMARY_ID, SELECTED_ID);

    expect(result.meetings[0]).toMatchObject({
      outcome: 'loss',
      scoreLabel: '15:13',
    });
    expect(result.meetings[0].team2.some((player) => player.id === PRIMARY_ID)).toBe(true);
  });
});
