import type {
  RrAvailablePlayer,
  RrDivision,
  RrGroup,
  RrMatch,
  RrMatchFormat,
  RrPlayoffMode,
  RrPlayoffPreview,
  RrSeedingMode,
  RrStandingRow,
  RrTeam,
} from './types';

export interface RrPairing {
  player1Id: string;
  player2Id: string;
}

export interface RrScheduleMatch {
  groupIndex: number;
  roundNo: number;
  teamAId: string;
  teamBId: string;
  scheduleSlot: number;
  courtNo: number;
}

export function normalizeRrDivision(value: unknown): RrDivision {
  const normalized = String(value ?? '').trim().toLocaleLowerCase('ru');
  if (normalized === 'w' || normalized.includes('жен') || normalized.includes('female')) return 'female';
  if (normalized.includes('mix') || normalized.includes('микс') || normalized.includes('микст')) return 'mixed';
  return 'male';
}

export function normalizeRrMatchFormat(value: unknown): RrMatchFormat {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : { code: value };
  const code = String(raw.code ?? 'single15');
  const scoringMode = raw.scoringMode === 'referee' ? 'referee' as const : raw.scoringMode === 'quick' ? 'quick' as const : undefined;
  if (code === 'single11' || code === 'single15' || code === 'single21' || code === 'bo3_21_15') {
    return { code, ...(scoringMode ? { scoringMode } : {}) };
  }
  if (code === 'timed') {
    return { code, durationMinutes: Math.max(1, Math.min(180, Math.floor(Number(raw.durationMinutes ?? 15)))), ...(scoringMode ? { scoringMode } : {}) };
  }
  return { code: 'single15', ...(scoringMode ? { scoringMode } : {}) };
}

export function validateFixedTeam(
  players: [Pick<RrAvailablePlayer, 'id' | 'gender'>, Pick<RrAvailablePlayer, 'id' | 'gender'>],
  division: RrDivision,
): string | null {
  const [first, second] = players;
  if (!first.id || !second.id) return 'В команде должны быть два игрока.';
  if (first.id === second.id) return 'Игрок не может занимать обе позиции команды.';
  if (division === 'mixed' && first.gender === second.gender) return 'Для микста требуется 1 мужчина + 1 женщина.';
  if (division === 'male' && (first.gender !== 'M' || second.gender !== 'M')) return 'В мужской команде должны быть два мужчины.';
  if (division === 'female' && (first.gender !== 'W' || second.gender !== 'W')) return 'В женской команде должны быть две женщины.';
  return null;
}

function highLowPairs(players: RrAvailablePlayer[]): RrPairing[] {
  const ordered = [...players].sort((a, b) => b.rating - a.rating || a.position - b.position);
  const pairs: RrPairing[] = [];
  while (ordered.length >= 2) {
    const first = ordered.shift();
    const second = ordered.pop();
    if (first && second) pairs.push({ player1Id: first.id, player2Id: second.id });
  }
  return pairs;
}

export function proposeFixedTeams(
  players: RrAvailablePlayer[],
  division: RrDivision,
  mode: 'roster' | 'rating' = 'roster',
): RrPairing[] {
  const ordered = [...players].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'ru'));
  if (division === 'mixed') {
    const men = ordered.filter((player) => player.gender === 'M');
    const women = ordered.filter((player) => player.gender === 'W');
    if (mode === 'rating') {
      men.sort((a, b) => b.rating - a.rating || a.position - b.position);
      women.sort((a, b) => a.rating - b.rating || a.position - b.position);
    }
    return Array.from({ length: Math.min(men.length, women.length) }, (_, index) => ({
      player1Id: men[index].id,
      player2Id: women[index].id,
    }));
  }
  return mode === 'rating'
    ? highLowPairs(ordered)
    : Array.from({ length: Math.floor(ordered.length / 2) }, (_, index) => ({
        player1Id: ordered[index * 2].id,
        player2Id: ordered[index * 2 + 1].id,
      }));
}

export function seededRandom(seed: number): () => number {
  let value = Math.floor(seed) || 1;
  return () => {
    value |= 0;
    value = value + 0x6d2b79f5 | 0;
    let result = Math.imul(value ^ value >>> 15, 1 | value);
    result = result + Math.imul(result ^ result >>> 7, 61 | result) ^ result;
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

export function seedRrGroups<T extends { rating: number; seed: number }>(
  teams: T[],
  groupCount: number,
  mode: RrSeedingMode,
  randomSeed = Date.now(),
  manualGroups?: T[][],
): T[][] {
  const count = Math.max(1, Math.min(4, Math.floor(groupCount)));
  if (mode === 'manual' && manualGroups) return manualGroups.map((group) => [...group]);
  const ordered = [...teams].sort((a, b) => b.rating - a.rating || a.seed - b.seed);
  if (mode === 'random') {
    const random = seededRandom(randomSeed);
    for (let index = ordered.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    }
  }
  const groups = Array.from({ length: count }, () => [] as T[]);
  ordered.forEach((team, index) => {
    const row = Math.floor(index / count);
    const offset = index % count;
    const groupIndex = row % 2 === 0 ? offset : count - 1 - offset;
    groups[groupIndex].push(team);
  });
  return groups;
}

export function generateRoundRobinRounds<T>(values: T[]): Array<Array<[T, T]>> {
  if (values.length < 2) return [];
  const bye = Symbol('rr-bye');
  const rotation: Array<T | symbol> = [...values];
  if (rotation.length % 2 === 1) rotation.push(bye);
  const rounds: Array<Array<[T, T]>> = [];
  for (let round = 0; round < rotation.length - 1; round += 1) {
    const matches: Array<[T, T]> = [];
    for (let left = 0; left < rotation.length / 2; left += 1) {
      const first = rotation[left];
      const second = rotation[rotation.length - 1 - left];
      if (first !== bye && second !== bye) matches.push([first as T, second as T]);
    }
    rounds.push(matches);
    const fixed = rotation[0];
    const tail = rotation.slice(1);
    tail.unshift(tail.pop() as T | symbol);
    rotation.splice(0, rotation.length, fixed, ...tail);
  }
  return rounds;
}

export function buildRrCourtSchedule(groupTeamIds: string[][], courtCount: number): RrScheduleMatch[] {
  const courts = Math.max(1, Math.floor(courtCount));
  const roundsByGroup = groupTeamIds.map((teamIds) => generateRoundRobinRounds(teamIds));
  const maxRounds = Math.max(0, ...roundsByGroup.map((rounds) => rounds.length));
  const output: RrScheduleMatch[] = [];
  let slot = 1;
  for (let roundIndex = 0; roundIndex < maxRounds; roundIndex += 1) {
    const roundMatches = roundsByGroup.flatMap((rounds, groupIndex) =>
      (rounds[roundIndex] ?? []).map(([teamAId, teamBId]) => ({ groupIndex, teamAId, teamBId })),
    );
    const ordered = roundIndex % 2 === 0 ? roundMatches : [...roundMatches].reverse();
    for (let offset = 0; offset < ordered.length; offset += courts) {
      ordered.slice(offset, offset + courts).forEach((match, courtIndex) => {
        output.push({
          ...match,
          roundNo: roundIndex + 1,
          scheduleSlot: slot,
          courtNo: courtIndex + 1,
        });
      });
      slot += 1;
    }
  }
  return output;
}

export function targetForSet(format: RrMatchFormat, setIndex: number): number | null {
  if (format.code === 'single11') return 11;
  if (format.code === 'single15') return 15;
  if (format.code === 'single21') return 21;
  if (format.code === 'bo3_21_15') return setIndex >= 2 ? 15 : 21;
  return null;
}

export function isHardCapSetFinished(format: RrMatchFormat, setIndex: number, scoreA: number, scoreB: number): boolean {
  const target = targetForSet(format, setIndex);
  return target != null && (scoreA >= target || scoreB >= target) && scoreA !== scoreB;
}

export function winnerFromScores(match: Pick<RrMatch, 'format' | 'scoreA' | 'scoreB' | 'setsA' | 'setsB' | 'teamAId' | 'teamBId'>): string | null {
  if (!match.teamAId || !match.teamBId) return null;
  if (match.format.code === 'bo3_21_15') {
    if (match.setsA >= 2) return match.teamAId;
    if (match.setsB >= 2) return match.teamBId;
    return null;
  }
  const scoreA = match.scoreA[match.scoreA.length - 1] ?? 0;
  const scoreB = match.scoreB[match.scoreB.length - 1] ?? 0;
  if (match.format.code === 'timed') return scoreA === scoreB ? null : scoreA > scoreB ? match.teamAId : match.teamBId;
  return isHardCapSetFinished(match.format, 0, scoreA, scoreB)
    ? scoreA > scoreB ? match.teamAId : match.teamBId
    : null;
}

function quotient(forPoints: number, againstPoints: number): number {
  if (againstPoints === 0) return forPoints > 0 ? forPoints : 0;
  return forPoints / againstPoints;
}

function directWinner(teamAId: string, teamBId: string, matches: RrMatch[]): string | null {
  const match = matches.find((row) =>
    row.status !== 'cancelled' &&
    ((row.teamAId === teamAId && row.teamBId === teamBId) || (row.teamAId === teamBId && row.teamBId === teamAId)),
  );
  return match?.winnerId ?? null;
}

function miniLeagueQuotient(teamId: string, tiedIds: Set<string>, matches: RrMatch[]): number {
  let pointsFor = 0;
  let pointsAgainst = 0;
  for (const match of matches) {
    if (!match.teamAId || !match.teamBId || !tiedIds.has(match.teamAId) || !tiedIds.has(match.teamBId)) continue;
    const aFor = match.scoreA.reduce((sum, value) => sum + value, 0);
    const bFor = match.scoreB.reduce((sum, value) => sum + value, 0);
    if (match.teamAId === teamId) {
      pointsFor += aFor;
      pointsAgainst += bFor;
    } else if (match.teamBId === teamId) {
      pointsFor += bFor;
      pointsAgainst += aFor;
    }
  }
  return quotient(pointsFor, pointsAgainst);
}

export function calculateRrStandings(groupId: string, teams: RrTeam[], matches: RrMatch[]): RrStandingRow[] {
  const confirmed = matches.filter((match) =>
    match.groupId === groupId && (match.status === 'finished' || match.status === 'forfeit'),
  );
  const rows = teams.filter((team) => team.groupId === groupId).map<RrStandingRow>((team) => ({
    groupId,
    teamId: team.id,
    position: 0,
    played: 0,
    wins: 0,
    losses: 0,
    matchPoints: 0,
    setsWon: 0,
    setsLost: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDiff: 0,
    pointQuotient: 0,
    tiebreakNote: null,
    seed: team.seed,
    manualRank: team.manualRank,
  }));
  const byId = new Map(rows.map((row) => [row.teamId, row]));
  for (const match of confirmed) {
    if (!match.teamAId || !match.teamBId || !match.winnerId) continue;
    const rowA = byId.get(match.teamAId);
    const rowB = byId.get(match.teamBId);
    if (!rowA || !rowB) continue;
    const pointsA = match.scoreA.reduce((sum, value) => sum + value, 0);
    const pointsB = match.scoreB.reduce((sum, value) => sum + value, 0);
    rowA.played += 1;
    rowB.played += 1;
    rowA.setsWon += match.setsA || (match.winnerId === match.teamAId ? 1 : 0);
    rowA.setsLost += match.setsB || (match.winnerId === match.teamBId ? 1 : 0);
    rowB.setsWon += match.setsB || (match.winnerId === match.teamBId ? 1 : 0);
    rowB.setsLost += match.setsA || (match.winnerId === match.teamAId ? 1 : 0);
    rowA.pointsFor += pointsA;
    rowA.pointsAgainst += pointsB;
    rowB.pointsFor += pointsB;
    rowB.pointsAgainst += pointsA;
    const aWon = match.winnerId === match.teamAId;
    rowA.wins += aWon ? 1 : 0;
    rowA.losses += aWon ? 0 : 1;
    rowB.wins += aWon ? 0 : 1;
    rowB.losses += aWon ? 1 : 0;
    rowA.matchPoints += aWon ? 2 : match.status === 'forfeit' ? 0 : 1;
    rowB.matchPoints += aWon ? match.status === 'forfeit' ? 0 : 1 : 2;
  }
  rows.forEach((row) => {
    row.pointDiff = row.pointsFor - row.pointsAgainst;
    row.pointQuotient = quotient(row.pointsFor, row.pointsAgainst);
  });
  rows.sort((left, right) => right.matchPoints - left.matchPoints || left.seed - right.seed);
  let cursor = 0;
  while (cursor < rows.length) {
    const tied = rows.slice(cursor).filter((row) => row.matchPoints === rows[cursor].matchPoints);
    if (tied.length > 1) {
      const tiedIds = new Set(tied.map((row) => row.teamId));
      tied.sort((left, right) => {
        if (left.manualRank != null || right.manualRank != null) {
          const manual = (left.manualRank ?? Number.MAX_SAFE_INTEGER) - (right.manualRank ?? Number.MAX_SAFE_INTEGER);
          if (manual) return manual;
        }
        if (tied.length === 2) {
          const overall = right.pointQuotient - left.pointQuotient;
          if (Math.abs(overall) > Number.EPSILON) return overall;
          const winner = directWinner(left.teamId, right.teamId, confirmed);
          if (winner) return winner === left.teamId ? -1 : 1;
        } else {
          const mini = miniLeagueQuotient(right.teamId, tiedIds, confirmed) - miniLeagueQuotient(left.teamId, tiedIds, confirmed);
          if (Math.abs(mini) > Number.EPSILON) return mini;
          const overall = right.pointQuotient - left.pointQuotient;
          if (Math.abs(overall) > Number.EPSILON) return overall;
        }
        return left.seed - right.seed;
      });
      tied.forEach((row, index) => {
        rows[cursor + index] = row;
        row.tiebreakNote = tied.length === 2 ? 'Коэффициент, затем личная встреча' : 'Мини-таблица равных команд';
      });
    }
    cursor += tied.length;
  }
  rows.forEach((row, index) => { row.position = index + 1; });
  return rows;
}

function balancedLevelCounts(total: number): number[] {
  const levelCount = Math.min(3, Math.max(1, total));
  const base = Math.floor(total / levelCount);
  const remainder = total % levelCount;
  return Array.from({ length: levelCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function buildRrPlayoffPreview(
  groups: RrGroup[],
  standings: RrStandingRow[],
  mode: RrPlayoffMode,
): RrPlayoffPreview {
  const orderedGroups = [...groups].sort((a, b) => a.groupNo - b.groupNo);
  if (mode === 'championship') {
    if (orderedGroups.length !== 2) throw new Error('Чемпионский плей-офф требует ровно две группы.');
    const groupRows = orderedGroups.map((group) => standings.filter((row) => row.groupId === group.id).sort((a, b) => a.position - b.position));
    if (groupRows.some((rows) => rows.length < 2)) throw new Error('В каждой группе нужны минимум две команды с рассчитанными местами.');
    const a1 = groupRows[0][0].teamId;
    const a2 = groupRows[0][1].teamId;
    const b1 = groupRows[1][0].teamId;
    const b2 = groupRows[1][1].teamId;
    return {
      mode,
      levels: [{
        key: 'championship',
        label: 'Чемпионский плей-офф',
        bracketSize: 4,
        teamIds: [a1, b2, b1, a2],
        firstRoundPairs: [[a1, b2], [b1, a2]],
      }],
    };
  }
  const overall = [...standings].sort((left, right) =>
    left.position - right.position || right.matchPoints - left.matchPoints || right.pointQuotient - left.pointQuotient || left.seed - right.seed,
  );
  const counts = balancedLevelCounts(overall.length);
  const keys = ['hard', 'medium', 'lite'] as const;
  const labels = ['HARD', 'MEDIUM', 'LITE'];
  let offset = 0;
  return {
    mode,
    levels: counts.map((count, index) => {
      const teamIds = overall.slice(offset, offset + count).map((row) => row.teamId);
      offset += count;
      return {
        key: keys[index],
        label: labels[index],
        bracketSize: (teamIds.length > 4 ? 8 : 4) as 4 | 8,
        teamIds,
      };
    }),
  };
}
