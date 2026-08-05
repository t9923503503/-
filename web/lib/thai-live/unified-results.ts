import type { TournamentResultRow } from '@/lib/queries';
import type { ThaiSpectatorBoardPayload } from '@/lib/thai-spectator';
import type {
  ThaiMatchStatus,
  ThaiOperatorStage,
  ThaiPlayerRole,
  ThaiRoundStatus,
  ThaiRoundType,
  ThaiStandingsPoolKey,
  ThaiStandingsRow,
  ThaiStandingsTourMatchup,
  ThaiZoneKey,
} from './types';

export type ThaiUnifiedGender = 'M' | 'W' | null;
export type ThaiUnifiedMatchOutcome = 'win' | 'loss' | 'draw' | 'pending';

export interface ThaiUnifiedStats {
  /** Null only when a player exists exclusively in legacy stored results. */
  matches: number | null;
  wins: number;
  /** Null only when the number of played matches is unavailable. */
  losses: number | null;
  /** Percentage in the 0..100 range. */
  winRate: number | null;
  pointsP: number;
  diff: number;
  scored: number;
  conceded: number;
  /** Scored / conceded. Null when there are no conceded balls. */
  ratio: number | null;
}

export interface ThaiUnifiedPlayerRef {
  playerId: string | null;
  playerName: string;
}

export interface ThaiUnifiedMatch {
  matchId: string;
  round: ThaiRoundType;
  roundNo: number;
  courtId: string;
  courtNo: number;
  courtLabel: string;
  zone: ThaiZoneKey | null;
  zoneLabel: string | null;
  tourNo: number;
  partner: ThaiUnifiedPlayerRef;
  opponents: ThaiUnifiedPlayerRef[];
  teamScore: number | null;
  opponentScore: number | null;
  status: ThaiMatchStatus;
  outcome: ThaiUnifiedMatchOutcome;
  diff: number | null;
  pointsP: number | null;
}

export interface ThaiUnifiedRoundStats extends ThaiUnifiedStats {
  round: ThaiRoundType;
  roundNo: number;
  status: ThaiRoundStatus;
  courtId: string;
  courtNo: number;
  courtLabel: string;
  zone: ThaiZoneKey | null;
  zoneLabel: string | null;
  localPlace: number | null;
  /** One entry per scheduled tour; unconfirmed or absent tours are null. */
  tourDiffs: Array<number | null>;
  /** Thai round coefficient. There is intentionally no combined K. */
  kef: number | null;
}

export interface ThaiUnifiedAdvancedStats {
  /** Wins by one or two balls. */
  closeWins: number;
  bestWin: ThaiUnifiedMatch | null;
  worstLoss: ThaiUnifiedMatch | null;
  longestWinStreak: number;
  uniquePartners: number;
}

export interface ThaiUnifiedPlayerResult {
  playerId: string;
  playerName: string;
  playerPhotoUrl: string;
  gender: ThaiUnifiedGender;
  pool: ThaiStandingsPoolKey;
  poolLabel: string;
  finalZone: ThaiZoneKey | null;
  finalZoneLabel: string | null;
  finalLocalPlace: number | null;
  finalGlobalPlace: number | null;
  /** Stored rating only; hidden until R2 is officially finished. */
  ratingPts: number | null;
  overall: ThaiUnifiedStats;
  rounds: Record<ThaiRoundType, ThaiUnifiedRoundStats | null>;
  matches: ThaiUnifiedMatch[];
  advanced: ThaiUnifiedAdvancedStats;
}

export interface ThaiUnifiedResultsSummary {
  playerCount: number;
  /** Scheduled matches, de-duplicated across player standings. */
  totalMatches: number;
  /** Confirmed matches, de-duplicated across player standings. */
  confirmedMatches: number;
  /** Sum of both teams' scores in confirmed matches. */
  totalScore: number;
}

export interface ThaiUnifiedResultsModel {
  tournamentId: string;
  tournamentName: string;
  variant: string;
  stage: ThaiOperatorStage;
  isOfficial: boolean;
  summary: ThaiUnifiedResultsSummary;
  players: ThaiUnifiedPlayerResult[];
}

interface BoardRowContext {
  round: ThaiSpectatorBoardPayload['rounds'][number];
  court: ThaiSpectatorBoardPayload['rounds'][number]['courts'][number];
  row: ThaiStandingsRow;
  zone: ThaiZoneKey | null;
  zoneLabel: string | null;
}

type MatchupWithOptionalIds = ThaiStandingsTourMatchup & {
  partnerPlayerId?: unknown;
  opponentPlayerIds?: unknown;
};

interface TournamentMatchAccumulator {
  status: ThaiMatchStatus;
  team1Score: number | null;
  team2Score: number | null;
}

const ZONE_LABELS: Record<ThaiZoneKey, string> = {
  hard: 'HARD',
  advance: 'ADVANCE',
  medium: 'MEDIUM',
  light: 'LIGHT',
};

const ZONE_SORT_ORDER: Record<ThaiZoneKey, number> = {
  hard: 0,
  advance: 1,
  medium: 2,
  light: 3,
};

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveIntOrNull(value: unknown): number | null {
  const parsed = Math.trunc(finiteNumber(value, 0));
  return parsed > 0 ? parsed : null;
}

function stringOrNull(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function normalizeGender(value: unknown): ThaiUnifiedGender {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'M') return 'M';
  if (normalized === 'W' || normalized === 'F') return 'W';
  return null;
}

function zoneFromLabel(value: unknown): ThaiZoneKey | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized.includes('hard') || normalized.includes('хард')) return 'hard';
  if (normalized.includes('advance') || normalized.includes('адванс')) return 'advance';
  if (normalized.includes('medium') || normalized.includes('медиум')) return 'medium';
  if (normalized.includes('light') || normalized.includes('lite') || normalized.includes('лайт')) return 'light';
  return null;
}

function zoneCapacity(variant: string): number {
  const normalized = String(variant || '').trim().toUpperCase();
  return normalized === 'MM' || normalized === 'WW' ? 8 : 4;
}

function zoneOffset(zone: ThaiZoneKey, variant: string): number {
  return ZONE_SORT_ORDER[zone] * zoneCapacity(variant);
}

function zoneFromStoredResult(
  result: TournamentResultRow | undefined,
  variant: string,
): ThaiZoneKey | null {
  if (!result) return null;
  const explicit = zoneFromLabel(result.zoneLabel);
  if (explicit) return explicit;
  const place = positiveIntOrNull(result.place);
  if (place == null) return null;
  const capacity = zoneCapacity(variant);
  if (place <= capacity) return 'hard';
  if (place <= capacity * 2) return 'advance';
  if (place <= capacity * 3) return 'medium';
  return 'light';
}

function zoneForCourt(
  round: ThaiSpectatorBoardPayload['rounds'][number],
  court: ThaiSpectatorBoardPayload['rounds'][number]['courts'][number],
): ThaiZoneKey | null {
  if (round.roundType !== 'r2') return null;
  return round.zones.find((zone) => zone.courtId === court.courtId)?.zone ?? zoneFromLabel(court.label);
}

function canonicalZoneLabel(zone: ThaiZoneKey | null, fallback?: unknown): string | null {
  return zone ? ZONE_LABELS[zone] : stringOrNull(fallback);
}

function calcPointsP(diff: number): number {
  if (diff <= 0) return 0;
  if (diff === 1) return 10;
  if (diff === 2) return 11;
  if (diff <= 4) return 12;
  return 13;
}

function safeRatio(scored: number, conceded: number): number | null {
  if (conceded <= 0) return null;
  return scored / conceded;
}

function buildStats(input: {
  matches: number | null;
  wins: number;
  pointsP: number;
  diff: number;
  scored: number;
}): ThaiUnifiedStats {
  const matches = input.matches == null ? null : Math.max(0, Math.trunc(input.matches));
  const wins = Math.max(0, Math.trunc(input.wins));
  const scored = finiteNumber(input.scored);
  const diff = finiteNumber(input.diff);
  const conceded = scored - diff;
  const losses = matches == null ? null : Math.max(0, matches - wins);
  return {
    matches,
    wins,
    losses,
    winRate: matches && matches > 0 ? (wins / matches) * 100 : matches === 0 ? 0 : null,
    pointsP: finiteNumber(input.pointsP),
    diff,
    scored,
    conceded,
    ratio: safeRatio(scored, conceded),
  };
}

function inferGender(
  variant: string,
  role: ThaiPlayerRole | null,
  storedGender: unknown,
): ThaiUnifiedGender {
  const stored = normalizeGender(storedGender);
  if (stored) return stored;
  const normalizedVariant = String(variant || '').trim().toUpperCase();
  if (normalizedVariant === 'MM' || normalizedVariant === 'MN') return 'M';
  if (normalizedVariant === 'WW') return 'W';
  if (normalizedVariant === 'MF') {
    return role === 'secondary' ? 'W' : role === 'primary' ? 'M' : null;
  }
  return null;
}

function inferStoredPool(
  variant: string,
  stored: TournamentResultRow,
): { pool: ThaiStandingsPoolKey; poolLabel: string } {
  const normalizedVariant = String(variant || '').trim().toUpperCase();
  const gender = normalizeGender(stored.gender);
  if (normalizedVariant === 'MF' && gender) {
    return gender === 'M'
      ? { pool: 'primary', poolLabel: 'Мужчины' }
      : { pool: 'secondary', poolLabel: 'Женщины' };
  }
  if (normalizedVariant === 'MN') {
    if (stored.ratingPool === 'novice') {
      return { pool: 'secondary', poolLabel: 'Новички' };
    }
    if (stored.ratingPool === 'pro') {
      return { pool: 'primary', poolLabel: 'Профи' };
    }
    const ratingType = String(stored.ratingType || '').trim().toLowerCase();
    if (ratingType.includes('nov') || ratingType.includes('нов')) {
      return { pool: 'secondary', poolLabel: 'Новички' };
    }
    if (ratingType.includes('pro') || ratingType.includes('проф')) {
      return { pool: 'primary', poolLabel: 'Профи' };
    }
  }
  return { pool: 'all', poolLabel: 'Общий' };
}

function matchupIds(matchup: ThaiStandingsTourMatchup): {
  partnerId: string | null;
  opponentIds: Array<string | null>;
} {
  const compatible = matchup as MatchupWithOptionalIds;
  const partnerId = stringOrNull(compatible.partnerId) ?? stringOrNull(compatible.partnerPlayerId);
  const rawOpponentIds = Array.isArray(compatible.opponentIds)
    ? compatible.opponentIds
    : Array.isArray(compatible.opponentPlayerIds)
      ? compatible.opponentPlayerIds
      : [];
  return {
    partnerId,
    opponentIds: rawOpponentIds.map((value) => stringOrNull(value)),
  };
}

function buildPlayerMatches(contexts: BoardRowContext[]): ThaiUnifiedMatch[] {
  const matches = new Map<string, ThaiUnifiedMatch>();
  for (const context of contexts) {
    const tourMatchups = Array.isArray(context.row.tourMatchups) ? context.row.tourMatchups : [];
    for (let index = 0; index < tourMatchups.length; index += 1) {
      const matchup = tourMatchups[index];
      if (!matchup) continue;
      const tourNo = positiveIntOrNull(matchup.tourNo) ?? index + 1;
      const rawMatchId = stringOrNull(matchup.matchId);
      const matchId = rawMatchId ?? `${context.round.roundType}-${context.court.courtId}-tour-${tourNo}`;
      const key = `${context.round.roundType}:${matchId}`;
      const status: ThaiMatchStatus = matchup.status === 'confirmed' ? 'confirmed' : 'pending';
      const teamScore = matchup.teamScore == null ? null : finiteNumber(matchup.teamScore);
      const opponentScore = matchup.opponentScore == null ? null : finiteNumber(matchup.opponentScore);
      const rawDiff =
        matchup.delta == null
          ? teamScore != null && opponentScore != null
            ? teamScore - opponentScore
            : null
          : finiteNumber(matchup.delta);
      const diff = status === 'confirmed' ? rawDiff : null;
      const ids = matchupIds(matchup);
      const opponentNames = Array.isArray(matchup.opponentNames) ? matchup.opponentNames : [];
      matches.set(key, {
        matchId,
        round: context.round.roundType,
        roundNo: context.round.roundNo,
        courtId: context.court.courtId,
        courtNo: context.court.courtNo,
        courtLabel: context.court.label,
        zone: context.zone,
        zoneLabel: context.zoneLabel,
        tourNo,
        partner: {
          playerId: ids.partnerId,
          playerName: String(matchup.partnerName || '').trim(),
        },
        opponents: opponentNames.map((playerName, opponentIndex) => ({
          playerId: ids.opponentIds[opponentIndex] ?? null,
          playerName: String(playerName || '').trim(),
        })),
        teamScore,
        opponentScore,
        status,
        outcome:
          diff == null
            ? 'pending'
            : diff > 0
              ? 'win'
              : diff < 0
                ? 'loss'
                : 'draw',
        diff,
        pointsP: diff == null ? null : calcPointsP(diff),
      });
    }
  }

  return [...matches.values()].sort(
    (left, right) =>
      left.roundNo - right.roundNo ||
      left.courtNo - right.courtNo ||
      left.tourNo - right.tourNo ||
      left.matchId.localeCompare(right.matchId),
  );
}

function buildRoundStats(context: BoardRowContext, matches: ThaiUnifiedMatch[]): ThaiUnifiedRoundStats {
  const row = context.row;
  const roundMatches = matches.filter(
    (match) => match.round === context.round.roundType && match.courtId === context.court.courtId,
  );
  const confirmedMatchCount = roundMatches.filter((match) => match.status === 'confirmed').length;
  const hasMatchupArray = Array.isArray(row.tourMatchups);
  const inferredFinishedMatches = context.round.roundStatus === 'finished' ? context.round.tourCount : 0;
  const matchCount = Math.max(
    confirmedMatchCount,
    hasMatchupArray ? 0 : inferredFinishedMatches,
    Math.max(0, Math.trunc(finiteNumber(row.wins))),
  );
  const stats = buildStats({
    matches: matchCount,
    wins: row.wins,
    pointsP: row.pointsP,
    diff: row.totalDiff,
    scored: row.totalScored,
  });
  const rawTourDiffs = Array.isArray(row.tourDiffs) ? row.tourDiffs : [];
  const rawMatchups = Array.isArray(row.tourMatchups) ? row.tourMatchups : [];
  const tourDiffs = Array.from({ length: Math.max(0, context.round.tourCount) }, (_, index) => {
    const matchup = rawMatchups[index];
    if (!matchup) {
      const legacyValue = rawTourDiffs[index];
      return !hasMatchupArray && context.round.roundStatus === 'finished' && legacyValue != null
        ? finiteNumber(legacyValue)
        : null;
    }
    if (matchup.status !== 'confirmed') return null;
    if (matchup.delta != null) return finiteNumber(matchup.delta);
    const value = rawTourDiffs[index];
    return value == null ? null : finiteNumber(value);
  });
  const kef = matchCount > 0 && Number.isFinite(Number(row.kef)) ? Number(row.kef) : null;

  return {
    ...stats,
    round: context.round.roundType,
    roundNo: context.round.roundNo,
    status: context.round.roundStatus,
    courtId: context.court.courtId,
    courtNo: context.court.courtNo,
    courtLabel: context.court.label,
    zone: context.zone,
    zoneLabel: context.zoneLabel,
    localPlace: positiveIntOrNull(row.place),
    tourDiffs,
    kef,
  };
}

function sumRoundStats(rounds: Array<ThaiUnifiedRoundStats | null>): ThaiUnifiedStats {
  const available = rounds.filter((round): round is ThaiUnifiedRoundStats => Boolean(round));
  return buildStats({
    matches: available.reduce((sum, round) => sum + (round.matches ?? 0), 0),
    wins: available.reduce((sum, round) => sum + round.wins, 0),
    pointsP: available.reduce((sum, round) => sum + round.pointsP, 0),
    diff: available.reduce((sum, round) => sum + round.diff, 0),
    scored: available.reduce((sum, round) => sum + round.scored, 0),
  });
}

function storedStats(stored: TournamentResultRow): ThaiUnifiedStats {
  return buildStats({
    matches: null,
    wins: stored.wins,
    pointsP: stored.gamePts,
    diff: stored.diff,
    scored: stored.balls,
  });
}

function buildAdvanced(matches: ThaiUnifiedMatch[]): ThaiUnifiedAdvancedStats {
  const confirmed = matches.filter(
    (match): match is ThaiUnifiedMatch & { diff: number } => match.status === 'confirmed' && match.diff != null,
  );
  const wins = confirmed.filter((match) => match.diff > 0);
  const losses = confirmed.filter((match) => match.diff < 0);
  let longestWinStreak = 0;
  let currentWinStreak = 0;
  for (const match of confirmed) {
    if (match.diff > 0) {
      currentWinStreak += 1;
      longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
    } else {
      currentWinStreak = 0;
    }
  }

  const partnerKeys = new Set<string>();
  for (const match of confirmed) {
    const id = stringOrNull(match.partner.playerId);
    const name = stringOrNull(match.partner.playerName)?.toLocaleLowerCase('ru-RU') ?? null;
    if (id || name) partnerKeys.add(id ? `id:${id}` : `name:${name}`);
  }

  return {
    closeWins: wins.filter((match) => match.diff <= 2).length,
    bestWin: wins.reduce<ThaiUnifiedMatch | null>(
      (best, match) => (!best || (match.diff ?? 0) > (best.diff ?? 0) ? match : best),
      null,
    ),
    worstLoss: losses.reduce<ThaiUnifiedMatch | null>(
      (worst, match) => (!worst || (match.diff ?? 0) < (worst.diff ?? 0) ? match : worst),
      null,
    ),
    longestWinStreak,
    uniquePartners: partnerKeys.size,
  };
}

function buildTournamentSummary(
  board: ThaiSpectatorBoardPayload,
  contextsByPlayerId: Map<string, BoardRowContext[]>,
  playerCount: number,
): ThaiUnifiedResultsSummary {
  const matches = new Map<string, TournamentMatchAccumulator>();
  for (const round of board.rounds) {
    for (const court of round.courts) {
      for (const tour of court.tours) {
        for (const match of tour.matches) {
          const rawId = stringOrNull(match.matchId);
          const key = rawId
            ? `${round.roundType}:${rawId}`
            : `${round.roundType}:${court.courtId}:${tour.tourNo}:${match.matchNo}`;
          matches.set(key, {
            status: match.status === 'confirmed' ? 'confirmed' : 'pending',
            team1Score: match.team1Score == null ? null : finiteNumber(match.team1Score),
            team2Score: match.team2Score == null ? null : finiteNumber(match.team2Score),
          });
        }
      }
    }
  }

  // Very old stored snapshots may contain standings matchups but omit court tours.
  for (const contexts of contextsByPlayerId.values()) {
    for (const playerMatch of buildPlayerMatches(contexts)) {
      const key = `${playerMatch.round}:${playerMatch.matchId}`;
      if (matches.has(key)) continue;
      matches.set(key, {
        status: playerMatch.status,
        team1Score: playerMatch.teamScore,
        team2Score: playerMatch.opponentScore,
      });
    }
  }

  const confirmed = [...matches.values()].filter((match) => match.status === 'confirmed');
  return {
    playerCount,
    totalMatches: matches.size,
    confirmedMatches: confirmed.length,
    totalScore: confirmed.reduce(
      (sum, match) => sum + finiteNumber(match.team1Score) + finiteNumber(match.team2Score),
      0,
    ),
  };
}

function playerSortKey(player: ThaiUnifiedPlayerResult): [number, number, number, string] {
  const division =
    player.pool === 'primary'
      ? 0
      : player.pool === 'secondary'
        ? 1
        : player.gender === 'M'
          ? 2
          : player.gender === 'W'
            ? 3
            : 4;
  const zone = player.finalZone
    ? ZONE_SORT_ORDER[player.finalZone]
    : player.rounds.r1
      ? 10 + player.rounds.r1.courtNo
      : 99;
  const place =
    player.finalLocalPlace ??
    player.finalGlobalPlace ??
    player.rounds.r1?.localPlace ??
    Number.MAX_SAFE_INTEGER;
  return [division, zone, place, player.playerName];
}

function storedResultMatchesFinal(input: {
  stored: TournamentResultRow | undefined;
  overall: ThaiUnifiedStats;
  finalGlobalPlace: number | null;
  hasCompleteBoardStats: boolean;
}): boolean {
  const { stored, overall, finalGlobalPlace, hasCompleteBoardStats } = input;
  if (!stored || !hasCompleteBoardStats || finalGlobalPlace == null) return false;
  return (
    positiveIntOrNull(stored.place) === finalGlobalPlace &&
    finiteNumber(stored.gamePts) === overall.pointsP &&
    finiteNumber(stored.wins) === overall.wins &&
    finiteNumber(stored.diff) === overall.diff &&
    finiteNumber(stored.balls) === overall.scored
  );
}

function comparePlayers(left: ThaiUnifiedPlayerResult, right: ThaiUnifiedPlayerResult): number {
  const a = playerSortKey(left);
  const b = playerSortKey(right);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3].localeCompare(b[3], 'ru');
}

export function buildThaiUnifiedResults(
  board: ThaiSpectatorBoardPayload,
  storedResults: TournamentResultRow[] = [],
): ThaiUnifiedResultsModel {
  const isOfficial = board.stage === 'r2_finished';
  const storedByPlayerId = new Map<string, TournamentResultRow>();
  for (const stored of storedResults) {
    const playerId = String(stored.playerId || '').trim();
    if (playerId) storedByPlayerId.set(playerId, stored);
  }

  const contextsByPlayerId = new Map<string, BoardRowContext[]>();
  const contextKeys = new Set<string>();
  for (const round of board.rounds) {
    for (const court of round.courts) {
      const zone = zoneForCourt(round, court);
      const zoneLabel = canonicalZoneLabel(zone, court.label);
      for (const group of court.standingsGroups) {
        for (const row of group.rows) {
          const playerId = String(row.playerId || '').trim();
          if (!playerId) continue;
          const contextKey = `${round.roundId}:${court.courtId}:${playerId}`;
          if (contextKeys.has(contextKey)) continue;
          contextKeys.add(contextKey);
          const contexts = contextsByPlayerId.get(playerId) ?? [];
          contexts.push({ round, court, row, zone, zoneLabel });
          contextsByPlayerId.set(playerId, contexts);
        }
      }
    }
  }

  const playerIds = new Set<string>([...contextsByPlayerId.keys(), ...storedByPlayerId.keys()]);
  const players: ThaiUnifiedPlayerResult[] = [];
  for (const playerId of playerIds) {
    const contexts = contextsByPlayerId.get(playerId) ?? [];
    contexts.sort((left, right) => left.round.roundNo - right.round.roundNo);
    const stored = storedByPlayerId.get(playerId);
    const r1Context = [...contexts].reverse().find((context) => context.round.roundType === 'r1') ?? null;
    const r2Context = [...contexts].reverse().find((context) => context.round.roundType === 'r2') ?? null;
    const identityContext = r2Context ?? r1Context ?? contexts[contexts.length - 1] ?? null;
    const identityRow = identityContext?.row ?? null;
    const role = identityRow?.role ?? null;
    const storedPool = stored ? inferStoredPool(board.variant, stored) : null;
    const pool = identityRow?.pool ?? storedPool?.pool ?? 'all';
    const poolLabel = String(identityRow?.poolLabel || storedPool?.poolLabel || 'Общий').trim();
    const gender = inferGender(board.variant, role, stored?.gender);
    const matches = buildPlayerMatches(contexts);
    const r1 = r1Context ? buildRoundStats(r1Context, matches) : null;
    const r2 = r2Context ? buildRoundStats(r2Context, matches) : null;
    const overall = r1 || r2 ? sumRoundStats([r1, r2]) : stored ? storedStats(stored) : buildStats({
      matches: 0,
      wins: 0,
      pointsP: 0,
      diff: 0,
      scored: 0,
    });

    const storedZone = isOfficial ? zoneFromStoredResult(stored, board.variant) : null;
    const finalZone = r2Context?.zone ?? storedZone;
    const finalLocalPlace =
      positiveIntOrNull(r2Context?.row.place) ??
      (isOfficial && stored && finalZone
        ? positiveIntOrNull(finiteNumber(stored.place) - zoneOffset(finalZone, board.variant))
        : null);
    const finalGlobalPlace = finalZone && finalLocalPlace
      ? zoneOffset(finalZone, board.variant) + finalLocalPlace
      : isOfficial
        ? positiveIntOrNull(stored?.place)
        : null;

    const syncedFinalResult =
      isOfficial &&
      storedResultMatchesFinal({
        stored,
        overall,
        finalGlobalPlace,
        hasCompleteBoardStats: Boolean(
          r1Context?.round.roundStatus === 'finished' &&
          r2Context?.round.roundStatus === 'finished',
        ),
      });

    players.push({
      playerId,
      playerName: String(identityRow?.playerName || stored?.playerName || playerId).trim(),
      playerPhotoUrl: String(stored?.playerPhotoUrl || '').trim(),
      gender,
      pool,
      poolLabel,
      finalZone,
      finalZoneLabel: canonicalZoneLabel(finalZone, isOfficial ? stored?.zoneLabel : null),
      finalLocalPlace,
      finalGlobalPlace,
      ratingPts: syncedFinalResult && stored ? finiteNumber(stored.ratingPts) : null,
      overall,
      rounds: { r1, r2 },
      matches,
      advanced: buildAdvanced(matches),
    });
  }

  players.sort(comparePlayers);
  return {
    tournamentId: board.tournamentId,
    tournamentName: board.tournamentName,
    variant: board.variant,
    stage: board.stage,
    isOfficial,
    summary: buildTournamentSummary(board, contextsByPlayerId, players.length),
    players,
  };
}
