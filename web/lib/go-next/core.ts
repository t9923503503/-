import type {
  GoGroupFormula,
  GoGroupStandingRow,
  GoInitialBucket,
  GoMatchFormat,
  GoMatchPointSystem,
  GoMatchResult,
  GoTieBreakerLogic,
  SeedableTeam,
} from './types';

type StandingAccumulator = Omit<GoGroupStandingRow, 'setQuotient' | 'pointQuotient' | 'pointDiff' | 'position'>;

export interface BucketSeedableTeam extends SeedableTeam {
  initialBucket: GoInitialBucket;
  order?: number;
  isBye?: boolean;
}

export interface GoScheduleTemplateMatch {
  teamAIndex: number | null;
  teamBIndex: number | null;
  phase: number;
  source: 'fixed' | 'winners' | 'losers';
}

export interface SchedulableMatch {
  matchKey: string;
  phase: number;
  groupKey: string;
  teamIds: string[];
}

export interface ScheduledMatchSlot {
  matchKey: string;
  courtNo: number;
  slotIndex: number;
  scheduledAt: string;
}

export function generateRoundRobin(teamCount: number): Array<Array<[number, number]>> {
  const normalizedCount = Math.max(0, Math.floor(teamCount));
  if (normalizedCount < 2) return [];

  const participants =
    normalizedCount % 2 === 0
      ? Array.from({ length: normalizedCount }, (_, index) => index)
      : [-1, ...Array.from({ length: normalizedCount }, (_, index) => index)];
  const rounds: Array<Array<[number, number]>> = [];
  const current = [...participants];

  for (let round = 0; round < current.length - 1; round += 1) {
    const pairs: Array<[number, number]> = [];
    for (let index = 0; index < current.length / 2; index += 1) {
      pairs.push([current[index], current[current.length - 1 - index]]);
    }
    rounds.push(pairs);
    current.splice(1, 0, current.pop() as number);
  }

  return rounds;
}

export function generateGroupSchedule(teamCount: number, matchFormat: GoMatchFormat): GoScheduleTemplateMatch[] {
  const normalizedTeamCount = Math.max(0, Math.floor(teamCount));
  if (normalizedTeamCount < 2) return [];

  if (matchFormat === 'bo3' && normalizedTeamCount === 4) {
    return [
      { teamAIndex: 0, teamBIndex: 3, phase: 1, source: 'fixed' },
      { teamAIndex: 1, teamBIndex: 2, phase: 1, source: 'fixed' },
      { teamAIndex: null, teamBIndex: null, phase: 2, source: 'winners' },
      { teamAIndex: null, teamBIndex: null, phase: 2, source: 'losers' },
    ];
  }

  return generateRoundRobin(normalizedTeamCount)
    .flatMap((roundPairs, index) =>
      roundPairs.map(([teamAIndex, teamBIndex]) => ({
        teamAIndex: teamAIndex >= 0 ? teamAIndex : null,
        teamBIndex: teamBIndex >= 0 ? teamBIndex : null,
        phase: index + 1,
        source: 'fixed' as const,
      })),
    )
    .filter((item) => item.teamAIndex != null && item.teamBIndex != null);
}

export function serpentineSeed<T extends SeedableTeam>(teams: T[], groupCount: number): T[][] {
  const normalizedGroupCount = Math.max(1, Math.floor(groupCount));
  const groups = Array.from({ length: normalizedGroupCount }, () => [] as T[]);
  const sortedTeams = [...teams].sort(compareSeedableTeams);

  for (let index = 0; index < sortedTeams.length; index += 1) {
    const band = Math.floor(index / normalizedGroupCount);
    const offset = index % normalizedGroupCount;
    const groupIndex = band % 2 === 0 ? offset : normalizedGroupCount - 1 - offset;
    groups[groupIndex].push(sortedTeams[index]);
  }

  return groups;
}

export function randomSeed<T extends SeedableTeam>(teams: T[], groupCount: number, seed: number): T[][] {
  const normalizedGroupCount = Math.max(1, Math.floor(groupCount));
  const groups = Array.from({ length: normalizedGroupCount }, () => [] as T[]);
  const shuffled = [...teams];
  const rng = createMulberry32(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  for (let index = 0; index < shuffled.length; index += 1) {
    groups[index % normalizedGroupCount].push(shuffled[index]);
  }

  return groups;
}

export function buildBalancedGoGroups(
  teams: BucketSeedableTeam[],
  options: {
    groupFormula: GoGroupFormula;
    seedingMode: 'serpentine' | 'random' | 'manual' | 'fixedPairs';
    seed?: number;
  },
): BucketSeedableTeam[][] {
  const groupSize = options.groupFormula.hard + options.groupFormula.medium + options.groupFormula.lite;
  const realTeams = teams.filter((team) => !team.isBye);
  const groupCount = Math.max(1, Math.ceil(realTeams.length / Math.max(1, groupSize)));
  const groups = Array.from({ length: groupCount }, () => [] as BucketSeedableTeam[]);
  const byBucket = {
    hard: [] as BucketSeedableTeam[],
    medium: [] as BucketSeedableTeam[],
    lite: [] as BucketSeedableTeam[],
  };

  for (const team of realTeams) {
    byBucket[team.initialBucket].push(team);
  }

  for (const bucket of ['hard', 'medium', 'lite'] as const) {
    const ordered = orderBucketTeams(byBucket[bucket], options.seedingMode, options.seed ?? 1);
    fillGroupsByTarget(groups, ordered, options.groupFormula[bucket], groupSize);
  }

  const leftovers = (['hard', 'medium', 'lite'] as const).flatMap((bucket) =>
    orderBucketTeams(
      byBucket[bucket].filter((team) => !groups.some((group) => group.some((row) => row.teamId === team.teamId))),
      options.seedingMode,
      (options.seed ?? 1) + 17,
    ),
  );

  for (const team of leftovers) {
    const target = groups
      .filter((group) => group.length < groupSize)
      .sort((left, right) => left.length - right.length)[0];
    if (!target) break;
    target.push(team);
  }

  let byeCounter = 1;
  for (const group of groups) {
    while (group.length < groupSize) {
      group.push({
        teamId: `bye-${byeCounter}`,
        rating: -byeCounter,
        initialBucket: 'lite',
        isBye: true,
      });
      byeCounter += 1;
    }
  }

  return groups;
}

export function buildCourtSchedule(
  matches: SchedulableMatch[],
  courts: number,
  startAtIso: string,
  slotMinutes: number,
): ScheduledMatchSlot[] {
  const normalizedCourts = Math.max(1, Math.floor(courts));
  const normalizedSlotMinutes = Math.max(1, Math.floor(slotMinutes));
  const unscheduled = [...matches].sort((left, right) => {
    if (left.phase !== right.phase) return left.phase - right.phase;
    return left.matchKey.localeCompare(right.matchKey);
  });
  const lastSlotByTeam = new Map<string, number>();
  const schedule: ScheduledMatchSlot[] = [];
  let slotIndex = 0;

  while (unscheduled.length > 0) {
    const usedTeams = new Set<string>();
    for (let courtNo = 1; courtNo <= normalizedCourts; courtNo += 1) {
      const eligible = unscheduled.filter(
        (match) =>
          match.phase - 1 <= slotIndex &&
          match.teamIds.every((teamId) => !usedTeams.has(teamId)),
      );
      if (!eligible.length) continue;
      const preferred = eligible.filter((match) =>
        match.teamIds.every((teamId) => (lastSlotByTeam.get(teamId) ?? -99) < slotIndex - 1),
      );
      const chosen = preferred[0] ?? eligible[0];
      const matchIndex = unscheduled.findIndex((item) => item.matchKey === chosen.matchKey);
      if (matchIndex < 0) continue;
      unscheduled.splice(matchIndex, 1);
      for (const teamId of chosen.teamIds) {
        usedTeams.add(teamId);
        lastSlotByTeam.set(teamId, slotIndex);
      }
      schedule.push({
        matchKey: chosen.matchKey,
        courtNo,
        slotIndex,
        scheduledAt: addMinutes(startAtIso, slotIndex * normalizedSlotMinutes),
      });
    }
    slotIndex += 1;
  }

  return schedule;
}

export function calculateStandings(
  matches: GoMatchResult[],
  teamIds: string[],
  config: { matchPointSystem: GoMatchPointSystem; tieBreakerLogic: GoTieBreakerLogic },
): GoGroupStandingRow[] {
  const baseRows = buildStandingRows(matches, teamIds, config.matchPointSystem);
  const seeded = [...baseRows].sort(compareStandingRows);

  const resolved: GoGroupStandingRow[] = [];
  for (let index = 0; index < seeded.length;) {
    const current = seeded[index];
    let end = index + 1;
    while (
      end < seeded.length &&
      seeded[end].wins === current.wins &&
      seeded[end].setQuotient === current.setQuotient &&
      seeded[end].pointQuotient === current.pointQuotient
    ) {
      end += 1;
    }

    const block = seeded.slice(index, end);
    const ordered =
      block.length > 1
        ? resolveGroupTiebreak(block, matches, config.tieBreakerLogic, config.matchPointSystem)
        : block;
    resolved.push(...ordered);
    index = end;
  }

  return resolved.map((row, index) => ({ ...row, position: index + 1 }));
}

export function resolveGroupTiebreak(
  tied: GoGroupStandingRow[],
  matches: GoMatchResult[],
  logic: GoTieBreakerLogic,
  matchPointSystem: GoMatchPointSystem = 'fivb',
): GoGroupStandingRow[] {
  if (tied.length <= 1) return tied;
  if (logic === 'classic') {
    return [...tied].sort(compareStandingRows);
  }

  const teamIds = tied.map((row) => row.teamId);
  const subgroupMatches = matches.filter((match) => teamIds.includes(match.teamAId) && teamIds.includes(match.teamBId));
  if (!subgroupMatches.length) {
    return [...tied].sort(compareStandingRows);
  }

  const subgroupRows = buildStandingRows(subgroupMatches, teamIds, matchPointSystem);
  const subgroupMap = new Map(subgroupRows.map((row) => [row.teamId, row]));
  const directWinnerMap = buildDirectWinnerMap(subgroupMatches);

  return [...tied].sort((left, right) => {
    const subgroupLeft = subgroupMap.get(left.teamId) ?? left;
    const subgroupRight = subgroupMap.get(right.teamId) ?? right;

    if (subgroupRight.wins !== subgroupLeft.wins) return subgroupRight.wins - subgroupLeft.wins;
    if (subgroupRight.setQuotient !== subgroupLeft.setQuotient) {
      return subgroupRight.setQuotient > subgroupLeft.setQuotient ? 1 : -1;
    }
    if (subgroupRight.pointQuotient !== subgroupLeft.pointQuotient) {
      return subgroupRight.pointQuotient > subgroupLeft.pointQuotient ? 1 : -1;
    }

    if (tied.length === 2) {
      const directKey = `${left.teamId}::${right.teamId}`;
      const directWinner = directWinnerMap.get(directKey);
      if (directWinner === left.teamId) return -1;
      if (directWinner === right.teamId) return 1;
    }

    return compareStandingRows(left, right);
  });
}

export function compareCrossGroupRows(left: GoGroupStandingRow, right: GoGroupStandingRow): number {
  if (right.wins !== left.wins) return right.wins - left.wins;
  if (right.setQuotient !== left.setQuotient) return right.setQuotient > left.setQuotient ? 1 : -1;
  if (right.pointQuotient !== left.pointQuotient) return right.pointQuotient > left.pointQuotient ? 1 : -1;
  if (right.pointDiff !== left.pointDiff) return right.pointDiff - left.pointDiff;
  return left.teamId.localeCompare(right.teamId);
}

export function calcMatchPoints(
  setsWon: number,
  setsLost: number,
  system: GoMatchPointSystem,
): number {
  if (setsWon === setsLost) return 0;
  if (system === 'simple') return setsWon > setsLost ? 2 : 1;
  if (setsWon > setsLost) return setsLost === 0 ? 3 : 2;
  return setsWon === 1 ? 1 : 0;
}

export function validateSeeding(teams: SeedableTeam[], groupCount: number): string | null {
  const normalizedGroupCount = Math.max(0, Math.floor(groupCount));
  if (normalizedGroupCount < 1) return 'Group count must be at least 1.';
  if (teams.length < normalizedGroupCount) return `Not enough teams for ${normalizedGroupCount} groups.`;
  return null;
}

function buildStandingRows(
  matches: GoMatchResult[],
  teamIds: string[],
  matchPointSystem: GoMatchPointSystem,
): GoGroupStandingRow[] {
  const stats = new Map<string, StandingAccumulator>();
  for (const teamId of teamIds) {
    stats.set(teamId, {
      teamId,
      teamLabel: teamId,
      played: 0,
      wins: 0,
      losses: 0,
      matchPoints: 0,
      setsWon: 0,
      setsLost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    });
  }

  for (const match of matches) {
    const teamA = stats.get(match.teamAId);
    const teamB = stats.get(match.teamBId);
    if (!teamA || !teamB) continue;
    if (match.walkover === 'mutual') continue;

    const normalized = normalizeMatchResult(match);
    teamA.played += 1;
    teamB.played += 1;
    teamA.setsWon += normalized.setsA;
    teamA.setsLost += normalized.setsB;
    teamB.setsWon += normalized.setsB;
    teamB.setsLost += normalized.setsA;
    teamA.pointsFor += normalized.pointsA;
    teamA.pointsAgainst += normalized.pointsB;
    teamB.pointsFor += normalized.pointsB;
    teamB.pointsAgainst += normalized.pointsA;
    teamA.matchPoints += calcMatchPoints(normalized.setsA, normalized.setsB, matchPointSystem);
    teamB.matchPoints += calcMatchPoints(normalized.setsB, normalized.setsA, matchPointSystem);

    if (normalized.setsA > normalized.setsB) {
      teamA.wins += 1;
      teamB.losses += 1;
    } else if (normalized.setsB > normalized.setsA) {
      teamB.wins += 1;
      teamA.losses += 1;
    }
  }

  return teamIds.map((teamId) => finalizeStandingRow(stats.get(teamId) as StandingAccumulator));
}

function normalizeMatchResult(match: GoMatchResult) {
  if (match.walkover === 'team_a') {
    return { setsA: 0, setsB: 2, pointsA: 0, pointsB: 0 };
  }
  if (match.walkover === 'team_b') {
    return { setsA: 2, setsB: 0, pointsA: 0, pointsB: 0 };
  }
  return {
    setsA: Math.max(0, Math.floor(match.setsA)),
    setsB: Math.max(0, Math.floor(match.setsB)),
    pointsA: sum(match.scoreA),
    pointsB: sum(match.scoreB),
  };
}

function finalizeStandingRow(row: StandingAccumulator): GoGroupStandingRow {
  return {
    ...row,
    setQuotient: calcQuotient(row.setsWon, row.setsLost),
    pointQuotient: calcQuotient(row.pointsFor, row.pointsAgainst),
    pointDiff: row.pointsFor - row.pointsAgainst,
    position: 0,
  };
}

function compareStandingRows(left: GoGroupStandingRow, right: GoGroupStandingRow): number {
  if (right.wins !== left.wins) return right.wins - left.wins;
  if (right.setQuotient !== left.setQuotient) return right.setQuotient > left.setQuotient ? 1 : -1;
  if (right.pointQuotient !== left.pointQuotient) return right.pointQuotient > left.pointQuotient ? 1 : -1;
  if (right.pointDiff !== left.pointDiff) return right.pointDiff - left.pointDiff;
  return left.teamId.localeCompare(right.teamId);
}

function buildDirectWinnerMap(matches: GoMatchResult[]): Map<string, string> {
  const winnerMap = new Map<string, string>();
  for (const match of matches) {
    const normalized = normalizeMatchResult(match);
    let winnerId: string | null = null;
    if (normalized.setsA > normalized.setsB) winnerId = match.teamAId;
    if (normalized.setsB > normalized.setsA) winnerId = match.teamBId;
    if (!winnerId) continue;
    winnerMap.set(`${match.teamAId}::${match.teamBId}`, winnerId);
    winnerMap.set(`${match.teamBId}::${match.teamAId}`, winnerId);
  }
  return winnerMap;
}

function compareSeedableTeams(left: SeedableTeam, right: SeedableTeam): number {
  if (right.rating !== left.rating) return right.rating - left.rating;
  return left.teamId.localeCompare(right.teamId);
}

function orderBucketTeams(
  teams: BucketSeedableTeam[],
  mode: 'serpentine' | 'random' | 'manual' | 'fixedPairs',
  seed: number,
): BucketSeedableTeam[] {
  if (mode === 'manual' || mode === 'fixedPairs') {
    return [...teams].sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || compareSeedableTeams(left, right));
  }
  if (mode === 'random') {
    const shuffled = [...teams];
    const rng = createMulberry32(seed);
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }
  return [...teams].sort(compareSeedableTeams);
}

function fillGroupsByTarget(
  groups: BucketSeedableTeam[][],
  bucketTeams: BucketSeedableTeam[],
  targetPerGroup: number,
  groupSize: number,
): void {
  if (targetPerGroup <= 0 || !bucketTeams.length) return;
  let index = 0;
  let forward = true;
  while (index < bucketTeams.length) {
    const order = forward
      ? Array.from({ length: groups.length }, (_, value) => value)
      : Array.from({ length: groups.length }, (_, value) => groups.length - 1 - value);
    let progressed = false;
    for (const groupIndex of order) {
      const group = groups[groupIndex];
      const currentBucketCount = group.filter((team) => team.initialBucket === bucketTeams[index]?.initialBucket).length;
      if (group.length >= groupSize || currentBucketCount >= targetPerGroup || index >= bucketTeams.length) continue;
      group.push(bucketTeams[index]);
      index += 1;
      progressed = true;
    }
    if (!progressed) break;
    forward = !forward;
  }
}

function createMulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function calcQuotient(numerator: number, denominator: number): number {
  if (denominator === 0) return numerator === 0 ? 0 : Number.POSITIVE_INFINITY;
  return numerator / denominator;
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + (Number(value) || 0), 0);
}

function addMinutes(isoString: string, minutes: number): string {
  const base = new Date(isoString);
  if (Number.isNaN(base.getTime())) return isoString;
  base.setUTCMinutes(base.getUTCMinutes() + minutes);
  return base.toISOString();
}
