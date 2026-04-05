import { getTournamentById } from '@/lib/admin-queries';
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
};

export function sanitizeThaiOperatorStateForSpectators(state: ThaiOperatorStateSummary): ThaiSpectatorBoardPayload {
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

export async function getThaiSpectatorBoardPayload(tournamentId: string): Promise<ThaiSpectatorBoardPayload | null> {
  const tid = String(tournamentId || '').trim();
  if (!tid) return null;

  const tournament = await getTournamentById(tid);
  if (!tournament) return null;
  if (!isExactThaiTournamentFormat(tournament.format)) return null;

  const module = normalizeThaiJudgeModule(tournament.settings?.thaiJudgeModule, THAI_JUDGE_MODULE_LEGACY);
  if (module !== THAI_JUDGE_MODULE_NEXT) return null;

  const summary = await getThaiOperatorStateSummary(tid);
  if (!summary) return null;

  const base = sanitizeThaiOperatorStateForSpectators(summary);
  if (summary.stage === 'r1_finished' || summary.stage === 'r2_finished') {
    try {
      const funStats = await getThaiTournamentFunStats(tid, summary.variant);
      return { ...base, funStats };
    } catch {
      return base;
    }
  }
  return base;
}
