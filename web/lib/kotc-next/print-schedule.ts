import {
  getKotcNextOperatorStateSummary,
  KotcNextError,
  buildKotcNextR1PairSources,
} from './service';
import { getInitialKotcNextCourtState } from './core';
import { getTournamentById, listRosterParticipants } from '@/lib/admin-queries';
import {
  buildKotcNextCourtPin,
  isKotcNextFormat,
  normalizeKotcAdminSettings,
  zoneLabel,
} from '@/lib/kotc-next-config';
import type { KotcNextVariant } from './types';
import type { KotcNextRotatingPairView } from './pair-rotation';
import { resolveKotcNextRotatingPairLabel, rotatingDisplayedPairIdx } from './pair-rotation';

export interface KotcNextSchedulePrintRaund {
  raundNo: number;
  pairs: string[];
}

export interface KotcNextSchedulePrintCourt {
  courtNo: number;
  courtLabel: string;
  pinCode: string;
  pairs: string[];
  raunds: KotcNextSchedulePrintRaund[];
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
  isTemplate: boolean;
  r2IsTemplate: boolean;
}


const R2_PLACEHOLDER_LABEL_RE = /^\s*(?:Место|Place)\s+(\d+)\s*$/i;

function normalizeVariant(value: unknown): KotcNextVariant | null {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'MM' || normalized === 'WW' || normalized === 'MN' || normalized === 'MF') {
    return normalized;
  }
  return null;
}

function inferVariant(
  division: string,
  roster: Array<{ gender: 'M' | 'W' }>,
  settings: Record<string, unknown>,
): KotcNextVariant {
  const explicit = normalizeVariant(settings.variant ?? settings.kotcVariant);
  if (explicit) return explicit;
  const normalizedDivision = String(division || '').trim().toLowerCase();
  const hasMen = roster.some((player) => player.gender === 'M');
  const hasWomen = roster.some((player) => player.gender === 'W');
  if (normalizedDivision.includes('жен') || (!hasMen && hasWomen)) return 'WW';
  if (normalizedDivision.includes('муж') || (hasMen && !hasWomen)) return 'MM';
  return 'MF';
}

export function formatKotcNextR2PrintPlaceholder(label: string, variant: KotcNextVariant): string {
  const normalizedLabel = String(label || '').trim();
  const match =
    normalizedLabel.match(R2_PLACEHOLDER_LABEL_RE) ??
    normalizedLabel.match(/^рњрµсѓс‚рѕ\s+(\d+)$/i) ??
    normalizedLabel.match(/^рњрµсЃс‚рѕ\s+(\d+)$/i);
  if (!match) return label;
  const slotNo = Number(match[1]);
  if (!Number.isFinite(slotNo) || slotNo <= 0) return label;
  if (variant === 'MF') return `М${slotNo} / Ж${slotNo}`;
  return `Место ${slotNo}`;
}

function normalizeR2PrintLabels(labels: string[], variant: KotcNextVariant): string[] {
  return labels.map((label) => formatKotcNextR2PrintPlaceholder(label, variant));
}

function buildCourtSeed(roundSeed: number, courtNo: number): number {
  return roundSeed * 1000 + courtNo * 97;
}

export function buildR2TemplateRaundPairs(
  pairLabels: string[],
  courtNo: number,
  raundNo: number,
  variant: KotcNextVariant = 'MF',
): string[] {
  const initialState = getInitialKotcNextCourtState(pairLabels.length, raundNo, buildCourtSeed(2, courtNo), 1, null);
  const pairIndexes = orderedRaundPairIndexes(pairLabels.length, initialState);
  if (variant !== 'MF' && variant !== 'MN') {
    return pairIndexes.map((pairIdx) => pairLabels[pairIdx] || `Место ${pairIdx + 1}`);
  }
  const rotatingPairs = pairLabels.map((label, index) => ({
    pairIdx: index,
    label,
    primaryPlayer: { name: label.split('/')[0]?.trim() || `M${index + 1}` },
    secondaryPlayer: { name: label.split('/')[1]?.trim() || `W${index + 1}` },
  }));
  return pairIndexes.map((pairIdx) => resolveKotcNextRotatingPairLabel(rotatingPairs, pairIdx, variant, raundNo));
}

function buildR2TemplateCourts(
  tournamentId: string,
  courtCount: number,
  ppc: number,
  variant: KotcNextVariant,
  raundCount: number,
): KotcNextSchedulePrintCourt[] {
  const zones = (['kin', 'advance', 'medium', 'lite'] as const).slice(0, Math.max(1, Math.min(4, courtCount)));
  return zones.map((zone, index) => {
    const placeholderLabels = normalizeR2PrintLabels(
      Array.from({ length: ppc }, (_, pairIdx) => `Место ${index * ppc + pairIdx + 1}`),
      variant,
    );
    return {
      courtNo: index + 1,
      courtLabel: zoneLabel(zone),
      pinCode: buildKotcNextCourtPin(tournamentId, 'r2', index + 1),
        pairs: placeholderLabels,
        raunds: Array.from({ length: raundCount }, (_, raundIndex) => ({
          raundNo: raundIndex + 1,
          pairs: buildR2TemplateRaundPairs(placeholderLabels, index + 1, raundIndex + 1, variant),
        })),
      };
  });
}

function orderedRaundPairIndexes(
  pairCount: number,
  order: { kingPairIdx: number; challengerPairIdx: number; queueOrder: number[] },
): number[] {
  const seen = new Set<number>();
  const indexes = [order.kingPairIdx, order.challengerPairIdx, ...order.queueOrder]
    .map((value) => Math.trunc(Number(value)))
    .filter((value) => value >= 0 && value < pairCount)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  for (let index = 0; index < pairCount; index += 1) {
    if (!seen.has(index)) indexes.push(index);
  }
  return indexes;
}

function displayedRotatingRaundPairs(
  pairs: KotcNextRotatingPairView[],
  variant: KotcNextVariant,
  raundNo: number,
): string[] {
  return pairs.map((_, rowIndex) => {
    const pairIdx = rotatingDisplayedPairIdx(rowIndex, raundNo, pairs.length);
    return resolveKotcNextRotatingPairLabel(pairs, pairIdx, variant, raundNo);
  });
}

function rotatingPairIndexes(count: number, raundNo: number): Array<{ primaryIdx: number; secondaryIdx: number }> {
  const roundOffset = Math.max(0, Math.trunc(Number(raundNo)) - 1);
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, rowIndex) => {
    const primaryIdx = (rowIndex + roundOffset) % count;
    return {
      primaryIdx,
      secondaryIdx: (primaryIdx + roundOffset) % count,
    };
  });
}

function rotatingR1PairLabels(
  pairs: Array<{ primaryPlayer?: { name: string } | null; secondaryPlayer?: { name: string } | null }>,
  raundNo: number,
): string[] {
  return rotatingPairIndexes(pairs.length, raundNo).map(({ primaryIdx, secondaryIdx }) => {
    const primary = pairs[primaryIdx]?.primaryPlayer?.name?.trim() || `M${primaryIdx + 1}`;
    const secondary = pairs[secondaryIdx]?.secondaryPlayer?.name?.trim() || `W${secondaryIdx + 1}`;
    return `${primary} / ${secondary}`;
  });
}

function rotatingR1PairSourceLabels(
  pairs: Array<{ primaryPlayerName: string; secondaryPlayerName: string }>,
  raundNo: number,
): string[] {
  return rotatingPairIndexes(pairs.length, raundNo).map(({ primaryIdx, secondaryIdx }) => {
    const primary = pairs[primaryIdx]?.primaryPlayerName?.trim() || `M${primaryIdx + 1}`;
    const secondary = pairs[secondaryIdx]?.secondaryPlayerName?.trim() || `W${secondaryIdx + 1}`;
    return `${primary} / ${secondary}`;
  });
}

export async function getKotcNextSchedulePrintPayload(
  tournamentId: string,
): Promise<KotcNextSchedulePrintPayload> {
  const normalizedId = String(tournamentId || '').trim();
  if (!normalizedId) {
    throw new KotcNextError(400, 'tournamentId is required');
  }

  const state = await getKotcNextOperatorStateSummary(normalizedId);
  if (state?.rounds.length) {
    const rounds = state.rounds.map((round) => ({
      roundNo: round.roundNo,
      roundType: round.roundType,
      courts: round.courts.map((court) => ({
        courtNo: court.courtNo,
        courtLabel: court.label,
        pinCode: court.pinCode,
        pairs:
          round.roundType === 'r2'
            ? normalizeR2PrintLabels(court.pairs.map((pair) => pair.label), state.variant)
            : court.pairs.map((pair) => pair.label),
        raunds: court.raunds.map((raund) => ({
          raundNo: raund.raundNo,
          pairs:
            round.roundType === 'r1'
              ? rotatingR1PairLabels(court.pairs, raund.raundNo)
              : normalizeR2PrintLabels(
                  displayedRotatingRaundPairs(court.pairs, state.variant, raund.raundNo),
                  state.variant,
                ),
        })),
      })),
    }));
    const hasMaterializedR2 = rounds.some((round) => round.roundType === 'r2');
    if (!hasMaterializedR2) {
      rounds.push({
        roundNo: 2,
        roundType: 'r2',
        courts: buildR2TemplateCourts(
          state.tournamentId,
          state.params.courts,
          state.params.ppc,
          state.variant,
          state.params.raundCount,
        ),
      });
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
      isTemplate: false,
      r2IsTemplate: !hasMaterializedR2,
      rounds,
    };
  }

  const tournament = await getTournamentById(normalizedId);
  if (!tournament) {
    throw new KotcNextError(404, 'Tournament not found');
  }
  if (!isKotcNextFormat(tournament.format)) {
    throw new KotcNextError(400, 'Tournament is not KOTC');
  }
  const roster = (await listRosterParticipants(normalizedId))
    .filter((participant) => !participant.isWaitlist)
    .sort((left, right) => Number(left.position || 0) - Number(right.position || 0));
  const settings =
    tournament.settings && typeof tournament.settings === 'object' && !Array.isArray(tournament.settings)
      ? tournament.settings
      : {};
  const params = normalizeKotcAdminSettings(settings);
  const variant = inferVariant(tournament.division, roster, settings);
  const pairSources = buildKotcNextR1PairSources(
    roster.map((participant) => ({
      playerId: participant.playerId,
      playerName: participant.playerName,
      gender: participant.gender,
      position: participant.position,
    })),
    { courts: params.courts, ppc: params.ppc, variant },
  );

  return {
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    tournamentDate: tournament.date,
    tournamentTime: tournament.time,
    tournamentLocation: tournament.location,
    variant,
    timerMinutes: params.raundTimerMinutes,
    raundCount: params.raundCount,
    isTemplate: true,
    r2IsTemplate: true,
    rounds: [
      {
        roundNo: 1,
        roundType: 'r1',
        courts: pairSources.map((court) => ({
          courtNo: court.courtNo,
          courtLabel: `K${court.courtNo}`,
          pinCode: buildKotcNextCourtPin(tournament.id, 'r1', court.courtNo),
          pairs: court.pairs.map((pair) => `${pair.primaryPlayerName} / ${pair.secondaryPlayerName}`),
          raunds: Array.from({ length: params.raundCount }, (_, raundIndex) => ({
            raundNo: raundIndex + 1,
            pairs: rotatingR1PairSourceLabels(court.pairs, raundIndex + 1),
          })),
        })),
      },
      {
        roundNo: 2,
        roundType: 'r2',
        courts: buildR2TemplateCourts(tournament.id, params.courts, params.ppc, variant, params.raundCount),
      },
    ],
  };
}
