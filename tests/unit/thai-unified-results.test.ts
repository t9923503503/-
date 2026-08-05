import { describe, expect, it } from 'vitest';

import { buildThaiUnifiedResults } from '../../web/lib/thai-live/unified-results';
import type { TournamentResultRow } from '../../web/lib/queries';
import type { ThaiSpectatorBoardPayload } from '../../web/lib/thai-spectator';
import type {
  ThaiMatchStatus,
  ThaiOperatorStage,
  ThaiRoundStatus,
  ThaiRoundType,
  ThaiStandingsRow,
  ThaiStandingsTourMatchup,
  ThaiZoneKey,
} from '../../web/lib/thai-live/types';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';
const STORED_ONLY = '55555555-5555-4555-8555-555555555555';

type MatchupFixture = ThaiStandingsTourMatchup & {
  partnerId?: string;
  opponentIds?: string[];
};

function matchup(input: {
  id: string;
  tour: number;
  partnerName: string;
  partnerId?: string;
  opponentNames: string[];
  opponentIds?: string[];
  score: [number | null, number | null];
  status?: ThaiMatchStatus;
}): MatchupFixture {
  const status = input.status ?? 'confirmed';
  const delta =
    status === 'confirmed' && input.score[0] != null && input.score[1] != null
      ? input.score[0] - input.score[1]
      : null;
  return {
    tourNo: input.tour,
    matchId: input.id,
    partnerName: input.partnerName,
    partnerId: input.partnerId,
    opponentNames: input.opponentNames,
    opponentIds: input.opponentIds,
    teamScore: input.score[0],
    opponentScore: input.score[1],
    delta,
    status,
  };
}

function standingsRow(input: {
  matches: Array<MatchupFixture | null>;
  playerId?: string;
  playerName?: string;
  role?: 'primary' | 'secondary';
  poolLabel?: string;
  place?: number;
  pointsP: number;
  wins: number;
  diff: number;
  scored: number;
}): ThaiStandingsRow {
  return {
    playerId: input.playerId ?? A,
    playerName: input.playerName ?? 'Путилов',
    role: input.role ?? 'primary',
    pool: input.role ?? 'primary',
    poolLabel: input.poolLabel ?? 'Мужчины',
    place: input.place ?? 1,
    tourDiffs: input.matches.map((entry) => entry?.delta ?? 0),
    totalDiff: input.diff,
    pointsP: input.pointsP,
    kef: (60 + input.diff) / (60 - input.diff),
    totalScored: input.scored,
    wins: input.wins,
    tourMatchups: input.matches,
  };
}

function roundFixture(input: {
  type: ThaiRoundType;
  status: ThaiRoundStatus;
  row: ThaiStandingsRow;
  zone?: ThaiZoneKey;
  includeCourtTours?: boolean;
}): ThaiSpectatorBoardPayload['rounds'][number] {
  const roundNo = input.type === 'r1' ? 1 : 2;
  const courtId = `${input.type}-court`;
  const label = input.type === 'r2' ? (input.zone ?? 'hard').toUpperCase() : 'Корт 1';
  const matchups = (Array.isArray(input.row.tourMatchups) ? input.row.tourMatchups : []).filter(
    (entry): entry is ThaiStandingsTourMatchup => Boolean(entry),
  );
  const tourCount = Math.max(2, matchups.length);
  return {
    roundId: `${input.type}-round`,
    roundNo,
    roundType: input.type,
    roundStatus: input.status,
    currentTourNo: tourCount,
    tourCount,
    courts: [
      {
        courtId,
        courtNo: 1,
        label,
        currentTourNo: tourCount,
        currentTourStatus: input.status === 'finished' ? 'finished' : 'live',
        playerNames: ['Путилов', 'Партнёр', 'Соперник 1', 'Соперник 2'],
        tours:
          input.includeCourtTours === false
            ? []
            : matchups.map((entry, index) => ({
                tourId: `${input.type}-tour-${entry.tourNo}`,
                tourNo: entry.tourNo,
                status: entry.status,
                matches: [
                  {
                    matchId: entry.matchId,
                    matchNo: index + 1,
                    team1Label: `Путилов / ${entry.partnerName}`,
                    team2Label: entry.opponentNames.join(' / '),
                    team1Score: entry.teamScore,
                    team2Score: entry.opponentScore,
                    status: entry.status,
                    pointHistory: [],
                  },
                ],
              })),
        standingsGroups: [
          {
            pool: 'primary',
            label: 'Мужчины',
            rows: [input.row],
          },
        ],
      },
    ],
    zones:
      input.type === 'r2'
        ? [
            {
              zone: input.zone ?? 'hard',
              label,
              courtId,
              courtNo: 1,
              courtLabel: label,
              playerNames: ['Путилов', 'Партнёр', 'Соперник 1', 'Соперник 2'],
            },
          ]
        : [],
  };
}

function boardFixture(input: {
  stage: ThaiOperatorStage;
  rounds: ThaiSpectatorBoardPayload['rounds'];
  variant?: string;
}): ThaiSpectatorBoardPayload {
  return {
    tournamentId: 'tournament-1',
    tournamentName: 'Тайский микст',
    tournamentDate: '2026-06-27',
    tournamentTime: '10:00',
    tournamentLocation: 'Пляж',
    variant: input.variant ?? 'MF',
    pointLimit: 15,
    pointLimitR1: 15,
    pointLimitR2: 15,
    tourCount: 2,
    stage: input.stage,
    rosterTotal: 8,
    rosterPrimaryCount: 4,
    rosterSecondaryCount: 4,
    rounds: input.rounds,
    finalResults: [],
    progress: [],
    funStats: null,
    viewSource: 'live',
    snapshotCapturedAt: null,
  };
}

function storedResult(overrides: Partial<TournamentResultRow> = {}): TournamentResultRow {
  return {
    playerId: A,
    playerName: 'Путилов',
    playerPhotoUrl: '/images/users/putilov.jpg',
    place: 1,
    gamePts: 34,
    ratingPts: 100,
    wins: 3,
    diff: 5,
    balls: 57,
    ratingType: 'thai',
    gender: 'M',
    zoneLabel: 'HARD',
    ...overrides,
  };
}

function completedRounds(): ThaiSpectatorBoardPayload['rounds'] {
  const r1Matches = [
    matchup({
      id: 'r1-match-1',
      tour: 1,
      partnerName: 'Игрок B',
      partnerId: B,
      opponentNames: ['Игрок C', 'Игрок D'],
      opponentIds: [C, D],
      score: [15, 13],
    }),
    matchup({
      id: 'r1-match-2',
      tour: 2,
      partnerName: 'Игрок C',
      partnerId: C,
      opponentNames: ['Игрок B', 'Игрок D'],
      opponentIds: [B, D],
      score: [12, 15],
    }),
  ];
  const r2Matches = [
    matchup({
      id: 'r2-match-1',
      tour: 1,
      partnerName: 'Игрок B',
      partnerId: B,
      opponentNames: ['Игрок C', 'Игрок D'],
      opponentIds: [C, D],
      score: [15, 14],
    }),
    matchup({
      id: 'r2-match-2',
      tour: 2,
      partnerName: 'Игрок D',
      partnerId: D,
      opponentNames: ['Игрок B', 'Игрок C'],
      opponentIds: [B, C],
      score: [15, 10],
    }),
  ];
  return [
    roundFixture({
      type: 'r1',
      status: 'finished',
      row: standingsRow({ matches: r1Matches, pointsP: 11, wins: 1, diff: -1, scored: 27 }),
    }),
    roundFixture({
      type: 'r2',
      status: 'finished',
      zone: 'hard',
      row: standingsRow({ matches: r2Matches, pointsP: 23, wins: 2, diff: 6, scored: 30 }),
    }),
  ];
}

describe('buildThaiUnifiedResults', () => {
  it('combines confirmed R1 and R2 statistics and exposes official final metadata', () => {
    const model = buildThaiUnifiedResults(
      boardFixture({ stage: 'r2_finished', rounds: completedRounds() }),
      [storedResult()],
    );

    expect(model.isOfficial).toBe(true);
    expect(model.summary).toEqual({
      playerCount: 1,
      totalMatches: 4,
      confirmedMatches: 4,
      totalScore: 109,
    });

    const player = model.players[0];
    expect(player).toMatchObject({
      playerId: A,
      playerName: 'Путилов',
      playerPhotoUrl: '/images/users/putilov.jpg',
      gender: 'M',
      pool: 'primary',
      finalZone: 'hard',
      finalZoneLabel: 'HARD',
      finalLocalPlace: 1,
      finalGlobalPlace: 1,
      ratingPts: 100,
    });
    expect(player.overall).toMatchObject({
      matches: 4,
      wins: 3,
      losses: 1,
      winRate: 75,
      pointsP: 34,
      diff: 5,
      scored: 57,
      conceded: 52,
    });
    expect(player.overall.ratio).toBeCloseTo(57 / 52);
    expect(player.rounds.r1?.tourDiffs).toEqual([2, -3]);
    expect(player.rounds.r2?.tourDiffs).toEqual([1, 5]);
    expect(player.rounds.r1?.kef).toBeCloseTo(59 / 61);
    expect(player.rounds.r2?.kef).toBeCloseTo(66 / 54);
    expect(player).not.toHaveProperty('kef');
    expect(player.advanced).toMatchObject({
      closeWins: 2,
      longestWinStreak: 2,
      uniquePartners: 3,
    });
    expect(player.advanced.bestWin?.matchId).toBe('r2-match-2');
    expect(player.advanced.worstLoss?.matchId).toBe('r1-match-2');
    expect(player.matches[0].partner).toEqual({ playerId: B, playerName: 'Игрок B' });
    expect(player.matches[0].opponents).toEqual([
      { playerId: C, playerName: 'Игрок C' },
      { playerId: D, playerName: 'Игрок D' },
    ]);
  });

  it('keeps pending matches visible but excludes them from totals and hides rating before R2 finish', () => {
    const rounds = completedRounds();
    const r2Confirmed = matchup({
      id: 'r2-match-1',
      tour: 1,
      partnerName: 'Игрок B',
      partnerId: B,
      opponentNames: ['Игрок C', 'Игрок D'],
      opponentIds: [C, D],
      score: [15, 14],
    });
    const r2Pending = matchup({
      id: 'r2-match-2',
      tour: 2,
      partnerName: 'Игрок D',
      partnerId: D,
      opponentNames: ['Игрок B', 'Игрок C'],
      opponentIds: [B, C],
      score: [14, 10],
      status: 'pending',
    });
    rounds[1] = roundFixture({
      type: 'r2',
      status: 'live',
      zone: 'advance',
      row: standingsRow({
        matches: [r2Confirmed, r2Pending],
        place: 2,
        pointsP: 10,
        wins: 1,
        diff: 1,
        scored: 15,
      }),
    });

    const model = buildThaiUnifiedResults(
      boardFixture({ stage: 'r2_live', rounds }),
      [storedResult({ place: 6, zoneLabel: 'ADVANCE', ratingPts: 90 })],
    );
    const player = model.players[0];

    expect(model.isOfficial).toBe(false);
    expect(model.summary).toEqual({
      playerCount: 1,
      totalMatches: 4,
      confirmedMatches: 3,
      totalScore: 84,
    });
    expect(player.ratingPts).toBeNull();
    expect(player.finalZone).toBe('advance');
    expect(player.finalLocalPlace).toBe(2);
    expect(player.finalGlobalPlace).toBe(6);
    expect(player.overall).toMatchObject({ matches: 3, wins: 2, losses: 1, pointsP: 21, diff: 0, scored: 42 });
    expect(player.rounds.r2?.tourDiffs).toEqual([1, null]);
    expect(player.matches.at(-1)).toMatchObject({
      matchId: 'r2-match-2',
      status: 'pending',
      outcome: 'pending',
      diff: null,
      pointsP: null,
    });
    expect(player.advanced.bestWin?.diff).toBe(2);
  });

  it('supports legacy matchups without participant IDs and derives summary matches from standings', () => {
    const oldMatch = matchup({
      id: 'old-match',
      tour: 1,
      partnerName: 'Тёзка',
      opponentNames: ['Алексей', 'Алексей'],
      score: [15, 12],
    });
    delete oldMatch.partnerId;
    delete oldMatch.opponentIds;
    const round = roundFixture({
      type: 'r1',
      status: 'finished',
      includeCourtTours: false,
      row: standingsRow({ matches: [oldMatch, null], pointsP: 12, wins: 1, diff: 3, scored: 15 }),
    });

    const model = buildThaiUnifiedResults(boardFixture({ stage: 'r1_finished', rounds: [round] }));
    const player = model.players[0];

    expect(model.summary).toMatchObject({ totalMatches: 1, confirmedMatches: 1, totalScore: 27 });
    expect(player.matches[0].partner).toEqual({ playerId: null, playerName: 'Тёзка' });
    expect(player.matches[0].opponents).toEqual([
      { playerId: null, playerName: 'Алексей' },
      { playerId: null, playerName: 'Алексей' },
    ]);
    expect(player.advanced.uniquePartners).toBe(1);
    expect(player.ratingPts).toBeNull();
    expect(player.finalZone).toBeNull();
  });

  it('unions board and stored player IDs and provides an honest stored-only fallback', () => {
    const board = boardFixture({ stage: 'r2_finished', rounds: completedRounds() });
    const model = buildThaiUnifiedResults(board, [
      storedResult(),
      storedResult({
        playerId: STORED_ONLY,
        playerName: 'Только архив',
        playerPhotoUrl: '/archive.jpg',
        gender: 'W',
        place: 6,
        zoneLabel: null,
        gamePts: 26,
        wins: 2,
        diff: -4,
        balls: 46,
        ratingPts: 70,
      }),
    ]);

    expect(model.summary.playerCount).toBe(2);
    const boardPlayer = model.players.find((player) => player.playerId === A);
    const storedOnly = model.players.find((player) => player.playerId === STORED_ONLY);
    expect(boardPlayer?.ratingPts).toBe(100);
    expect(storedOnly).toMatchObject({
      playerName: 'Только архив',
      playerPhotoUrl: '/archive.jpg',
      gender: 'W',
      pool: 'secondary',
      finalZone: 'advance',
      finalZoneLabel: 'ADVANCE',
      finalLocalPlace: 2,
      finalGlobalPlace: 6,
      ratingPts: null,
      overall: {
        matches: null,
        wins: 2,
        losses: null,
        winRate: null,
        pointsP: 26,
        diff: -4,
        scored: 46,
        conceded: 50,
        ratio: 46 / 50,
      },
      rounds: { r1: null, r2: null },
      matches: [],
    });
  });

  it.each([
    ['MF', 'primary', 'M'],
    ['MF', 'secondary', 'W'],
    ['MN', 'primary', 'M'],
    ['MN', 'secondary', 'M'],
    ['MM', 'primary', 'M'],
    ['WW', 'primary', 'W'],
  ] as const)('infers gender for %s / %s', (variant, role, expectedGender) => {
    const row = standingsRow({
      matches: [],
      role,
      pointsP: 0,
      wins: 0,
      diff: 0,
      scored: 0,
    });
    const round = roundFixture({ type: 'r1', status: 'live', row });
    const model = buildThaiUnifiedResults(
      boardFixture({ stage: 'r1_live', rounds: [round], variant }),
    );

    expect(model.players[0].gender).toBe(expectedGender);
  });

  it('uses finished-round tour totals when a legacy snapshot has no matchup array', () => {
    const row = standingsRow({
      matches: [null, null],
      pointsP: 10,
      wins: 1,
      diff: 1,
      scored: 25,
    });
    row.tourDiffs = [2, -1];
    delete (row as ThaiStandingsRow & { tourMatchups?: ThaiStandingsTourMatchup[] }).tourMatchups;
    const round = roundFixture({
      type: 'r1',
      status: 'finished',
      includeCourtTours: false,
      row,
    });

    const player = buildThaiUnifiedResults(
      boardFixture({ stage: 'r1_finished', rounds: [round], variant: 'MM' }),
    ).players[0];

    expect(player.rounds.r1).toMatchObject({
      matches: 2,
      wins: 1,
      losses: 1,
      winRate: 50,
      tourDiffs: [2, -1],
    });
  });

  it('keeps duplicate names separate by playerId and orders MN pools independently', () => {
    const model = buildThaiUnifiedResults(
      boardFixture({ stage: 'r2_finished', rounds: [], variant: 'MN' }),
      [
        storedResult({
          playerId: B,
          playerName: 'Алексей',
          gender: 'M',
          ratingPool: 'novice',
          place: 1,
        }),
        storedResult({
          playerId: C,
          playerName: 'Алексей',
          gender: 'M',
          ratingPool: 'pro',
          place: 1,
        }),
      ],
    );

    expect(model.players).toHaveLength(2);
    expect(model.players.map((player) => player.playerId)).toEqual([C, B]);
    expect(model.players.map((player) => player.pool)).toEqual(['primary', 'secondary']);
  });

  it('keeps rating unavailable when stored results are stale after R2 finish', () => {
    const model = buildThaiUnifiedResults(
      boardFixture({ stage: 'r2_finished', rounds: completedRounds() }),
      [storedResult({ gamePts: 23, wins: 2, diff: 6, balls: 30, ratingPts: 100 })],
    );

    expect(model.isOfficial).toBe(true);
    expect(model.players[0].ratingPts).toBeNull();
  });

  it('does not expose an aligned R2-only stored rating without complete R1 data', () => {
    const r2 = roundFixture({
      type: 'r2',
      status: 'finished',
      zone: 'hard',
      row: standingsRow({
        matches: [],
        pointsP: 47,
        wins: 4,
        diff: 17,
        scored: 60,
      }),
    });
    const model = buildThaiUnifiedResults(
      boardFixture({ stage: 'r2_finished', rounds: [r2] }),
      [storedResult({ gamePts: 47, wins: 4, diff: 17, balls: 60, ratingPts: 100 })],
    );

    expect(model.players[0].ratingPts).toBeNull();
  });

  it('uses R1 court place as the preliminary default order', () => {
    const first = standingsRow({
      matches: [],
      playerId: A,
      playerName: 'Second place',
      place: 2,
      pointsP: 0,
      wins: 0,
      diff: 0,
      scored: 0,
    });
    const second = standingsRow({
      matches: [],
      playerId: B,
      playerName: 'First place',
      place: 1,
      pointsP: 0,
      wins: 0,
      diff: 0,
      scored: 0,
    });
    const round = roundFixture({ type: 'r1', status: 'live', row: first });
    round.courts[0].standingsGroups[0].rows = [first, second];

    const model = buildThaiUnifiedResults(
      boardFixture({ stage: 'r1_live', rounds: [round], variant: 'MM' }),
    );

    expect(model.players.map((player) => player.playerId)).toEqual([B, A]);
  });

  it('matches the published Putilov control totals across four R1 and four R2 tours', () => {
    const makeMatches = (round: 'r1' | 'r2', opponentScores: number[]) =>
      opponentScores.map((opponentScore, index) =>
        matchup({
          id: `${round}-control-${index + 1}`,
          tour: index + 1,
          partnerName: `Partner ${index + 1}`,
          partnerId: `${B}-${index}`,
          opponentNames: [`Opponent ${index + 1}A`, `Opponent ${index + 1}B`],
          opponentIds: [`${C}-${index}`, `${D}-${index}`],
          score: [15, opponentScore],
        }),
      );
    const r1 = roundFixture({
      type: 'r1',
      status: 'finished',
      row: standingsRow({
        matches: makeMatches('r1', [8, 8, 7, 7]),
        pointsP: 49,
        wins: 4,
        diff: 30,
        scored: 60,
      }),
    });
    const r2 = roundFixture({
      type: 'r2',
      status: 'finished',
      zone: 'hard',
      row: standingsRow({
        matches: makeMatches('r2', [10, 10, 11, 12]),
        pointsP: 47,
        wins: 4,
        diff: 17,
        scored: 60,
      }),
    });

    const result = buildThaiUnifiedResults(
      boardFixture({ stage: 'r2_finished', rounds: [r1, r2] }),
      [
        storedResult({
          place: 1,
          gamePts: 96,
          wins: 8,
          diff: 47,
          balls: 120,
          ratingPts: 100,
        }),
      ],
    ).players[0];

    expect(result.overall).toMatchObject({
      matches: 8,
      wins: 8,
      losses: 0,
      winRate: 100,
      pointsP: 96,
      diff: 47,
      scored: 120,
      conceded: 73,
    });
    expect(result.finalZone).toBe('hard');
    expect(result.finalLocalPlace).toBe(1);
    expect(result.ratingPts).toBe(100);
  });

  it('keeps the ball ratio unavailable when no balls were conceded', () => {
    const result = buildThaiUnifiedResults(
      boardFixture({ stage: 'r2_finished', rounds: [], variant: 'MM' }),
      [storedResult({ balls: 15, diff: 15, wins: 1 })],
    ).players[0];

    expect(result.overall.conceded).toBe(0);
    expect(result.overall.ratio).toBeNull();
  });

  it.each([
    ['MM', 'hard', 5, 5, 'M'],
    ['WW', 'advance', 1, 9, 'W'],
  ] as const)(
    'uses eight-place R2 zone offsets for %s',
    (variant, zone, localPlace, globalPlace, gender) => {
      const row = standingsRow({
        matches: [],
        place: localPlace,
        pointsP: 10,
        wins: 1,
        diff: 2,
        scored: 15,
      });
      const r2 = roundFixture({ type: 'r2', status: 'finished', zone, row });
      const result = buildThaiUnifiedResults(
        boardFixture({ stage: 'r2_finished', rounds: [r2], variant }),
        [
          storedResult({
            place: globalPlace,
            gamePts: 10,
            wins: 1,
            diff: 2,
            balls: 15,
            gender,
          }),
        ],
      ).players[0];

      expect(result.finalZone).toBe(zone);
      expect(result.finalLocalPlace).toBe(localPlace);
      expect(result.finalGlobalPlace).toBe(globalPlace);
      expect(result.ratingPts).toBeNull();
    },
  );
});
