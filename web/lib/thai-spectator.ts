import { getTournamentById, mergeTournamentSettingsKeys, type AdminTournament } from '@/lib/admin-queries';
import { getThaiOperatorStateSummary } from '@/lib/thai-live/service';
import type {
  ThaiOperatorCourtRoundView,
  ThaiOperatorRoundView,
  ThaiOperatorStateSummary,
  ThaiOperatorZoneSummary,
} from '@/lib/thai-live/types';
import {
  isExactThaiTournamentFormat,
  normalizeThaiJudgeModule,
  THAI_JUDGE_MODULE_LEGACY,
  THAI_JUDGE_MODULE_NEXT,
} from '@/lib/thai-judge-config';
import type { ThaiFunStats } from '@/lib/thai-live/tournament-fun-stats';
import { getThaiTournamentFunStats } from '@/lib/thai-live/tournament-fun-stats';

export const THAI_SPECTATOR_SNAPSHOT_KEY = 'thaiSpectatorBoardSnapshot';
export const THAI_SPECTATOR_SNAPSHOT_AT_KEY = 'thaiSpectatorBoardSnapshotAt';

export type ThaiSpectatorCourtView = Omit<ThaiOperatorCourtRoundView, 'pin' | 'judgeUrl'>;
export type ThaiSpectatorZoneView = Omit<ThaiOperatorZoneSummary, 'pin' | 'judgeUrl'>;

export interface ThaiSpectatorRoundView extends Omit<ThaiOperatorRoundView, 'courts' | 'zones'> {
  courts: ThaiSpectatorCourtView[];
  zones: ThaiSpectatorZoneView[];
}

export type ThaiSpectatorBoardPayload = Omit<
  ThaiOperatorStateSummary,
  'canBootstrap' | 'canReshuffleR1' | 'canFinishR1' | 'canSeedR2' | 'canFinishR2' | 'rounds'
> & {
  rounds: ThaiSpectatorRoundView[];
  funStats: ThaiFunStats | null;
  /** Откуда взяты данные: живая Thai-схема или сохранённый снимок для истории. */
  viewSource?: 'live' | 'snapshot';
  /** ISO-время сохранения снимка (если viewSource === 'snapshot'). */
  snapshotCapturedAt?: string | null;
};

export function sanitizeThaiOperatorStateForSpectators(state: ThaiOperatorStateSummary): Omit<
  ThaiSpectatorBoardPayload,
  'viewSource' | 'snapshotCapturedAt'
> {
  const {
    canBootstrap: _cb,
    canReshuffleR1: _cr,
    canFinishR1: _cf1,
    canSeedR2: _cs2,
    canFinishR2: _cf2,
    ...rest
  } = state;
  return {
    ...rest,
    funStats: null,
    rounds: state.rounds.map((round) => ({
      ...round,
      courts: round.courts.map(({ pin: _p, judgeUrl: _j, ...court }) => court),
      zones: round.zones.map(({ pin: _pz, judgeUrl: _jz, ...zone }) => zone),
    })),
  };
}

async function composeSpectatorPayload(
  tournament: AdminTournament,
  summary: ThaiOperatorStateSummary,
): Promise<ThaiSpectatorBoardPayload> {
  const base = sanitizeThaiOperatorStateForSpectators(summary);
  if (summary.stage === 'r1_finished' || summary.stage === 'r2_finished') {
    try {
      const funStats = await getThaiTournamentFunStats(tournament.id, summary.variant);
      return { ...base, funStats, viewSource: 'live', snapshotCapturedAt: null };
    } catch {
      return { ...base, funStats: null, viewSource: 'live', snapshotCapturedAt: null };
    }
  }
  return { ...base, funStats: null, viewSource: 'live', snapshotCapturedAt: null };
}

function isSnapshotPayload(value: unknown): value is ThaiSpectatorBoardPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = (value as { rounds?: unknown }).rounds;
  return Array.isArray(r) && r.length > 0;
}

function payloadFromStoredSnapshot(
  raw: unknown,
  snapshotAt: unknown,
): ThaiSpectatorBoardPayload | null {
  if (!isSnapshotPayload(raw)) return null;
  return {
    ...raw,
    funStats: raw.funStats ?? null,
    viewSource: 'snapshot',
    snapshotCapturedAt: typeof snapshotAt === 'string' ? snapshotAt : null,
  };
}

/**
 * Сохраняет текущее табло (как для /live/thai) в `tournaments.settings.thaiSpectatorBoardSnapshot`
 * — чтобы после сброса Thai или при «завершённом» турнире зрительская страница не пустела.
 */
export async function persistThaiSpectatorBoardSnapshot(tournamentId: string): Promise<boolean> {
  const tid = String(tournamentId || '').trim();
  if (!tid) return false;

  const tournament = await getTournamentById(tid);
  if (!tournament || !isExactThaiTournamentFormat(tournament.format)) return false;

  const module = normalizeThaiJudgeModule(tournament.settings?.thaiJudgeModule, THAI_JUDGE_MODULE_LEGACY);
  if (module !== THAI_JUDGE_MODULE_NEXT) return false;

  const summary = await getThaiOperatorStateSummary(tid);
  if (!summary?.rounds?.length) return false;

  const payload = await composeSpectatorPayload(tournament, summary);
  const { viewSource: _v, snapshotCapturedAt: _s, ...toStore } = payload;

  const at = new Date().toISOString();
  await mergeTournamentSettingsKeys(tid, {
    [THAI_SPECTATOR_SNAPSHOT_KEY]: toStore,
    [THAI_SPECTATOR_SNAPSHOT_AT_KEY]: at,
  });
  return true;
}

export async function getThaiSpectatorBoardPayload(tournamentId: string): Promise<ThaiSpectatorBoardPayload | null> {
  const tid = String(tournamentId || '').trim();
  if (!tid) return null;

  const tournament = await getTournamentById(tid);
  if (!tournament) return null;
  if (!isExactThaiTournamentFormat(tournament.format)) return null;

  const module = normalizeThaiJudgeModule(tournament.settings?.thaiJudgeModule, THAI_JUDGE_MODULE_LEGACY);
  if (module !== THAI_JUDGE_MODULE_NEXT) return null;

  const summary = await getThaiOperatorStateSummary(tid);
  if (summary?.rounds?.length) {
    return composeSpectatorPayload(tournament, summary);
  }

  const snap = tournament.settings?.[THAI_SPECTATOR_SNAPSHOT_KEY];
  const snapAt = tournament.settings?.[THAI_SPECTATOR_SNAPSHOT_AT_KEY];
  return payloadFromStoredSnapshot(snap, snapAt);
}
