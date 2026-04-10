import { normalizeThaiRulesPreset } from '@/lib/admin-legacy-sync';
import { upsertTournamentResults, getTournamentById } from '@/lib/admin-queries';
import { getPool } from '@/lib/db';
import {
  isExactThaiTournamentFormat,
  normalizeThaiJudgeModule,
  THAI_JUDGE_MODULE_LEGACY,
  THAI_JUDGE_MODULE_NEXT,
} from '@/lib/thai-judge-config';
import { finalizeThaiStandingsRows } from './core';
import { getThaiOperatorStateSummary } from './service';
import type { ThaiOperatorRoundView, ThaiStandingsRow } from './types';

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

function pickLatestFinishedRound(rounds: ThaiOperatorRoundView[]): ThaiOperatorRoundView | null {
  return [...rounds].reverse().find((r) => r.roundStatus === 'finished') ?? null;
}

/**
 * Берёт итоговую таблицу последнего завершённого раунда (R2 если завершён, иначе R1),
 * объединяет корты, заново выставляет места внутри пула (как общий рейтинг по формату),
 * записывает в tournament_results для /rankings и архива.
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

  const latestFinished = pickLatestFinishedRound(state.rounds);
  if (!latestFinished) {
    throw new Error('Нет завершённого раунда: завершите R1 или R2 в судейском потоке.');
  }

  const variant = String(state.variant || '').toUpperCase();

  const allRows: ThaiStandingsRow[] = latestFinished.courts.flatMap((court) =>
    court.standingsGroups.flatMap((g) => g.rows),
  );

  if (!allRows.length) {
    throw new Error('Нет строк турнирной таблицы для выгрузки (ожидаются итоги после завершения раунда).');
  }

  const genderByPlayerId = await loadPlayerGendersByTournament(id);

  let results: Array<{
    playerName: string;
    gender: 'M' | 'W';
    placement: number;
    points: number;
    ratingPool: 'pro';
  }>;

  if (variant === 'MN' || variant === 'MF') {
    const primary = allRows.filter((r) => r.role === 'primary');
    const secondary = allRows.filter((r) => r.role === 'secondary');
    const pFin = finalizeThaiStandingsRows(primary, preset);
    const sFin = finalizeThaiStandingsRows(secondary, preset);
    results = [...pFin, ...sFin].map((row) => ({
      playerName: row.playerName.trim(),
      gender: genderByPlayerId.get(row.playerId) ?? 'M',
      placement: row.place,
      points: Number(row.pointsP) || 0,
      ratingPool: 'pro' as const,
    }));
  } else {
    const fin = finalizeThaiStandingsRows(allRows, preset);
    results = fin.map((row) => ({
      playerName: row.playerName.trim(),
      gender: genderByPlayerId.get(row.playerId) ?? 'M',
      placement: row.place,
      points: Number(row.pointsP) || 0,
      ratingPool: 'pro' as const,
    }));
  }

  const inserted = await upsertTournamentResults(id, results);
  return {
    inserted,
    roundUsed: latestFinished.roundType,
  };
}
