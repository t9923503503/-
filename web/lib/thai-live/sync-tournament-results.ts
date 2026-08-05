import { normalizeThaiRulesPreset } from '@/lib/admin-legacy-sync';
import { upsertTournamentResults, getTournamentById } from '@/lib/admin-queries';
import { getPool } from '@/lib/db';
import { ratingPointsForLevelPlace, type TournamentRatingLevel } from '@/lib/rating-points';
import {
  isExactThaiTournamentFormat,
  normalizeThaiJudgeModule,
  THAI_JUDGE_MODULE_LEGACY,
  THAI_JUDGE_MODULE_NEXT,
} from '@/lib/thai-judge-config';
import { finalizeThaiStandingsRows } from './core';
import { getThaiOperatorStateSummary } from './service';
import type { ThaiOperatorRoundView, ThaiStandingsRow, ThaiZoneKey } from './types';

const THAI_R2_ZONE_ORDER: Record<ThaiZoneKey, number> = {
  hard: 0,
  advance: 1,
  medium: 2,
  light: 3,
};

function thaiZoneCapacity(variant: string): number {
  const normalized = String(variant || '').trim().toUpperCase();
  return normalized === 'MM' || normalized === 'WW' ? 8 : 4;
}

function zoneFromCourtLabel(label: string): ThaiZoneKey | null {
  const normalized = String(label || '').trim().toLowerCase();
  if (normalized.includes('hard')) return 'hard';
  if (normalized.includes('advance')) return 'advance';
  if (normalized.includes('medium')) return 'medium';
  if (normalized.includes('light')) return 'light';
  return null;
}

function ratingLevelFromZone(zone: ThaiZoneKey): TournamentRatingLevel {
  return zone === 'light' ? 'lite' : zone;
}

export interface ThaiTournamentResultSyncRow {
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
  placement: number;
  points: number;
  wins: number;
  diff: number;
  balls: number;
  ratingPool: 'pro' | 'novice';
  ratingPts?: number;
}

interface ThaiFinishedRoundTotals {
  points: number;
  wins: number;
  diff: number;
  balls: number;
}

export function isThaiNextTournamentForRatingSync(input: {
  format?: unknown;
  settings?: Record<string, unknown> | null;
} | null | undefined): boolean {
  if (!input || !isExactThaiTournamentFormat(input.format)) return false;
  return (
    normalizeThaiJudgeModule(input.settings?.thaiJudgeModule, THAI_JUDGE_MODULE_LEGACY) ===
    THAI_JUDGE_MODULE_NEXT
  );
}

export async function syncThaiStandingsToTournamentResultsOrThrowBadRequest(
  tournamentId: string,
): Promise<{ inserted: number; roundUsed: string }> {
  try {
    return await syncThaiStandingsToTournamentResults(tournamentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`BadRequest: ${message}`);
  }
}

async function loadPlayerGendersByTournament(tournamentId: string): Promise<Map<string, 'M' | 'W'>> {
  const pool = getPool();
  const { rows } = await pool.query<{ id: string; gender: string }>(
    `SELECT p.id::text AS id, p.gender
     FROM tournament_participants tp
     JOIN players p ON p.id = tp.player_id
     WHERE tp.tournament_id = $1 AND tp.is_waitlist = false`,
    [tournamentId],
  );
  const m = new Map<string, 'M' | 'W'>();
  for (const r of rows) {
    m.set(String(r.id), String(r.gender || '').toUpperCase() === 'W' ? 'W' : 'M');
  }
  return m;
}

async function loadStoredPositiveRatingPoints(tournamentId: string): Promise<Map<string, number>> {
  const pool = getPool();
  const { rows } = await pool.query<{ player_id: string; rating_pts: number | string }>(
    `SELECT player_id::text AS player_id, rating_pts
     FROM tournament_results
     WHERE tournament_id = $1 AND COALESCE(rating_pts, 0) > 0`,
    [tournamentId],
  );
  const stored = new Map<string, number>();
  for (const row of rows) {
    const ratingPts = Number(row.rating_pts);
    if (Number.isFinite(ratingPts) && ratingPts > 0) {
      stored.set(String(row.player_id), ratingPts);
    }
  }
  return stored;
}

function pickLatestFinishedRound(rounds: ThaiOperatorRoundView[]): ThaiOperatorRoundView | null {
  const finished = rounds.filter((round) => round.roundStatus === 'finished');
  return (
    [...finished].reverse().find((round) => round.roundType === 'r2') ??
    finished.at(-1) ??
    null
  );
}

function rowsFromRound(round: ThaiOperatorRoundView): ThaiStandingsRow[] {
  return round.courts.flatMap((court) => court.standingsGroups.flatMap((group) => group.rows));
}

function buildFinishedRoundTotals(
  rounds: ThaiOperatorRoundView[],
  expectedPlayerIds: Set<string>,
): Map<string, ThaiFinishedRoundTotals> {
  const totals = new Map<string, ThaiFinishedRoundTotals>();
  const finishedRounds = rounds.filter((round) => round.roundStatus === 'finished');

  for (const round of finishedRounds) {
    const rows = rowsFromRound(round);
    const seenInRound = new Set<string>();
    for (const row of rows) {
      const playerId = String(row.playerId || '').trim();
      if (!playerId || seenInRound.has(playerId) || !expectedPlayerIds.has(playerId)) {
        throw new Error(
          `Finished ${round.roundType.toUpperCase()} standings are incomplete: cannot sync partial Thai results.`,
        );
      }
      seenInRound.add(playerId);
      const current = totals.get(playerId) ?? { points: 0, wins: 0, diff: 0, balls: 0 };
      totals.set(playerId, {
        points: current.points + (Number(row.pointsP) || 0),
        wins: current.wins + (Number(row.wins) || 0),
        diff: current.diff + (Number(row.totalDiff) || 0),
        balls: current.balls + (Number(row.totalScored) || 0),
      });
    }
    if (seenInRound.size !== expectedPlayerIds.size) {
      throw new Error(
        `Finished ${round.roundType.toUpperCase()} standings are incomplete: cannot sync partial Thai results.`,
      );
    }
  }

  return totals;
}

function officialPlayerIds(rows: ThaiStandingsRow[], roundType: ThaiOperatorRoundView['roundType']): Set<string> {
  const playerIds = new Set<string>();
  for (const row of rows) {
    const playerId = String(row.playerId || '').trim();
    if (!playerId || playerIds.has(playerId)) {
      throw new Error(
        `${roundType.toUpperCase()} standings are incomplete: cannot sync partial Thai results.`,
      );
    }
    playerIds.add(playerId);
  }
  return playerIds;
}

function resultStatsForPlayer(
  playerId: string,
  totalsByPlayerId: Map<string, ThaiFinishedRoundTotals>,
): ThaiFinishedRoundTotals {
  const totals = totalsByPlayerId.get(playerId);
  if (!totals) {
    throw new Error('Finished Thai standings are incomplete: cannot sync partial Thai results.');
  }
  return totals;
}

function positiveStoredRatingPts(
  playerId: string,
  storedPositiveRatingPtsByPlayerId: Map<string, number>,
): number | undefined {
  const value = Number(storedPositiveRatingPtsByPlayerId.get(playerId));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function buildR2ZoneResults(input: {
  round: ThaiOperatorRoundView;
  variant: string;
  genderByPlayerId: Map<string, 'M' | 'W'>;
  totalsByPlayerId: Map<string, ThaiFinishedRoundTotals>;
  storedPositiveRatingPtsByPlayerId: Map<string, number>;
}): ThaiTournamentResultSyncRow[] {
  const { round, genderByPlayerId, totalsByPlayerId, storedPositiveRatingPtsByPlayerId } = input;
  const zoneByCourtId = new Map(round.zones.map((zone) => [zone.courtId, zone.zone] as const));
  const results: ThaiTournamentResultSyncRow[] = [];
  const seenZones = new Set<ThaiZoneKey>();
  const zoneCapacity = thaiZoneCapacity(input.variant);

  for (const court of round.courts) {
    const zone = zoneByCourtId.get(court.courtId) ?? zoneFromCourtLabel(court.label);
    if (!zone || seenZones.has(zone)) {
      throw new Error('R2 zone standings are incomplete: cannot sync partial Thai results.');
    }
    seenZones.add(zone);
    const offset = THAI_R2_ZONE_ORDER[zone] * zoneCapacity;
    const ratingLevel = ratingLevelFromZone(zone);
    for (const group of court.standingsGroups) {
      const places = new Set<number>();
      for (const row of group.rows) {
        const playerId = String(row.playerId || '').trim();
        const localPlace = Math.trunc(Number(row.place));
        if (
          !playerId ||
          !String(row.playerName || '').trim() ||
          !Number.isFinite(localPlace) ||
          localPlace <= 0 ||
          localPlace > zoneCapacity ||
          places.has(localPlace)
        ) {
          throw new Error('R2 zone standings are incomplete: cannot sync partial Thai results.');
        }
        places.add(localPlace);
        const totals = resultStatsForPlayer(playerId, totalsByPlayerId);
        const storedRatingPts = positiveStoredRatingPts(playerId, storedPositiveRatingPtsByPlayerId);
        const ratingPool =
          String(input.variant || '').trim().toUpperCase() === 'MN' && row.role === 'secondary'
            ? 'novice'
            : 'pro';
        results.push({
          playerId,
          playerName: row.playerName.trim(),
          gender: genderByPlayerId.get(playerId) ?? 'M',
          placement: offset + localPlace,
          points: totals.points,
          wins: totals.wins,
          diff: totals.diff,
          balls: totals.balls,
          ratingPool,
          ratingPts: storedRatingPts ?? ratingPointsForLevelPlace(localPlace, ratingLevel, ratingPool),
        });
      }
    }
  }

  return results;
}

export function buildThaiTournamentResultRows(input: {
  rounds: ThaiOperatorRoundView[];
  variant: string;
  preset: ReturnType<typeof normalizeThaiRulesPreset>;
  genderByPlayerId: Map<string, 'M' | 'W'>;
  storedPositiveRatingPtsByPlayerId?: Map<string, number>;
  expectedPlayerIds?: ReadonlySet<string>;
}): { results: ThaiTournamentResultSyncRow[]; roundUsed: ThaiOperatorRoundView['roundType'] } {
  const latestFinished = pickLatestFinishedRound(input.rounds);
  if (!latestFinished) {
    throw new Error('No finished Thai round is available for result sync.');
  }

  const allRows = rowsFromRound(latestFinished);
  if (!allRows.length) {
    throw new Error('No Thai standings rows are available for result sync.');
  }

  const officialIds = officialPlayerIds(allRows, latestFinished.roundType);
  const expectedIds = input.expectedPlayerIds
    ? new Set([...input.expectedPlayerIds].map((value) => String(value || '').trim()).filter(Boolean))
    : officialIds;
  if (
    expectedIds.size !== officialIds.size ||
    [...expectedIds].some((playerId) => !officialIds.has(playerId))
  ) {
    throw new Error('Finished Thai standings do not match the tournament roster: cannot sync partial results.');
  }
  const playerIds = expectedIds;
  const totalsByPlayerId = buildFinishedRoundTotals(input.rounds, playerIds);
  const storedRatingPts = input.storedPositiveRatingPtsByPlayerId ?? new Map<string, number>();

  let results: ThaiTournamentResultSyncRow[];
  if (latestFinished.roundType === 'r2') {
    results = buildR2ZoneResults({
      round: latestFinished,
      variant: input.variant,
      genderByPlayerId: input.genderByPlayerId,
      totalsByPlayerId,
      storedPositiveRatingPtsByPlayerId: storedRatingPts,
    });
    if (results.length !== allRows.length) {
      throw new Error('R2 zone standings are incomplete: cannot sync partial Thai results.');
    }
  } else {
    const variant = String(input.variant || '').toUpperCase();
    const finalizedRows =
      variant === 'MN' || variant === 'MF'
        ? [
            ...finalizeThaiStandingsRows(allRows.filter((row) => row.role === 'primary'), input.preset),
            ...finalizeThaiStandingsRows(allRows.filter((row) => row.role === 'secondary'), input.preset),
          ]
        : finalizeThaiStandingsRows(allRows, input.preset);

    results = finalizedRows.map((row) => {
      const playerId = String(row.playerId || '').trim();
      const totals = resultStatsForPlayer(playerId, totalsByPlayerId);
      return {
        playerId,
        playerName: row.playerName.trim(),
        gender: input.genderByPlayerId.get(playerId) ?? 'M',
        placement: row.place,
        points: totals.points,
        wins: totals.wins,
        diff: totals.diff,
        balls: totals.balls,
        ratingPool:
          variant === 'MN' && row.role === 'secondary'
            ? 'novice' as const
            : 'pro' as const,
        ratingPts: positiveStoredRatingPts(playerId, storedRatingPts),
      };
    });
  }

  if (results.length !== playerIds.size) {
    throw new Error('Finished Thai standings are incomplete: cannot sync partial Thai results.');
  }

  return { results, roundUsed: latestFinished.roundType };
}

/**
 * Берёт официальные места из последнего завершённого R2 (либо R1 fallback),
 * суммирует игровую статистику всех завершённых R1/R2 и атомарно публикует
 * полный состав в tournament_results для рейтинга и архива.
 */
export async function syncThaiStandingsToTournamentResults(tournamentId: string): Promise<{
  inserted: number;
  roundUsed: string;
}> {
  const id = String(tournamentId || '').trim();
  if (!id) throw new Error('tournamentId is required');

  const state = await getThaiOperatorStateSummary(id);
  if (!state?.rounds?.length) {
    throw new Error('Нет данных Thai по этому турниру.');
  }

  const tournament = await getTournamentById(id);
  if (!tournament) throw new Error('Турнир не найден.');

  const preset = normalizeThaiRulesPreset(tournament.settings?.thaiRulesPreset);

  if (!pickLatestFinishedRound(state.rounds)) {
    throw new Error('Нет завершённого раунда: завершите R1 или R2 в судейском потоке.');
  }

  const [genderByPlayerId, storedPositiveRatingPtsByPlayerId] = await Promise.all([
    loadPlayerGendersByTournament(id),
    loadStoredPositiveRatingPoints(id),
  ]);
  if (state.rosterTotal > 0 && genderByPlayerId.size !== state.rosterTotal) {
    throw new Error(
      `Thai roster is incomplete: expected ${state.rosterTotal}, resolved ${genderByPlayerId.size}.`,
    );
  }
  const built = buildThaiTournamentResultRows({
    rounds: state.rounds,
    variant: state.variant,
    preset,
    genderByPlayerId,
    storedPositiveRatingPtsByPlayerId,
    expectedPlayerIds: new Set(genderByPlayerId.keys()),
  });

  const inserted = await upsertTournamentResults(id, built.results);
  if (inserted !== built.results.length) {
    throw new Error(`Thai result sync was incomplete: expected ${built.results.length}, saved ${inserted}.`);
  }
  return {
    inserted,
    roundUsed: built.roundUsed,
  };
}
