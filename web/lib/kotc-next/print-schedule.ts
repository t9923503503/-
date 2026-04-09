import {
  getKotcNextOperatorStateSummary,
  KotcNextError,
} from './service';

export interface KotcNextSchedulePrintCourt {
  courtNo: number;
  courtLabel: string;
  pinCode: string;
  pairs: string[];
}

export interface KotcNextSchedulePrintRound {
  roundNo: number;
  roundType: 'r1' | 'r2';
  courts: KotcNextSchedulePrintCourt[];
}

export interface KotcNextSchedulePrintPayload {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  tournamentTime: string;
  tournamentLocation: string;
  variant: string;
  timerMinutes: number;
  raundCount: number;
  rounds: KotcNextSchedulePrintRound[];
}

export async function getKotcNextSchedulePrintPayload(
  tournamentId: string,
): Promise<KotcNextSchedulePrintPayload> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new KotcNextError(400, 'tournamentId is required');
  }

  const state = await getKotcNextOperatorStateSummary(normalizedId);
  if (!state) {
    throw new KotcNextError(404, 'KOTC Next state not found');
  }
  if (!state.rounds.length) {
    throw new KotcNextError(409, 'KOTC Next is not initialized yet');
  }

  return {
    tournamentId: state.tournamentId,
    tournamentName: state.tournamentName,
    tournamentDate: state.tournamentDate,
    tournamentTime: state.tournamentTime,
    tournamentLocation: state.tournamentLocation,
    variant: state.variant,
    timerMinutes: state.params.raundTimerMinutes,
    raundCount: state.params.raundCount,
    rounds: state.rounds.map((round) => ({
      roundNo: round.roundNo,
      roundType: round.roundType,
      courts: round.courts.map((court) => ({
        courtNo: court.courtNo,
        courtLabel: court.label,
        pinCode: court.pinCode,
        pairs: court.pairs.map((pair) => pair.label),
      })),
    })),
  };
}
