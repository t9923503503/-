import {
  getTournamentById,
  getTournamentLegacyGameStateById,
  listRosterParticipants,
  type AdminTournament,
  type RosterParticipant,
} from "./admin-queries";
import {
  buildThaiJudgeRelativeUrl,
  resolveThaiJudgeParams,
  type ThaiJudgeParams,
} from "./build-thai-judge-url";
import {
  buildLegacyKotcFallbackUrl,
  getSudyamFormatForTournament,
  type SudyamFormat,
} from "./sudyam-launch";
import {
  getThaiJudgeStateSummary,
  getThaiOperatorStateSummary,
  type ThaiJudgeStateSummary,
  type ThaiOperatorStateSummary,
} from "./thai-live";
import {
  THAI_JUDGE_MODULE_LEGACY,
  buildThaiJudgeStructuralSignature,
  isExactThaiTournamentFormat,
  normalizeThaiJudgeBootstrapSignature,
  normalizeThaiJudgeModule,
  thaiJudgeBootstrapSignaturesMatch,
  type ThaiJudgeModule,
  validateThaiNextTournamentSetup,
} from "./thai-judge-config";

export class SudyamBootstrapError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SudyamBootstrapError";
    this.status = status;
  }
}

export interface SudyamBootstrapParticipant {
  playerId: string;
  playerName: string;
  gender: "M" | "W";
  isWaitlist: boolean;
  position: number;
}

export interface SudyamBootstrapPayload {
  tournamentId: string;
  format: SudyamFormat;
  title: string;
  thaiJudgeParams?: ThaiJudgeParams;
  thaiJudgeModule?: ThaiJudgeModule;
  thaiJudgeLegacyUrl?: string;
  thaiJudgeNeedsBootstrap?: boolean;
  thaiJudgeBlockedReason?: string | null;
  thaiJudgeState?: ThaiJudgeStateSummary;
  thaiOperatorState?: ThaiOperatorStateSummary;
  bootstrapState: {
    tournament: AdminTournament;
    settings: Record<string, unknown>;
    participants: SudyamBootstrapParticipant[];
    legacyGameState: Record<string, unknown> | null;
  };
  fallbackLegacyUrl: string;
}

function normalizeGender(value: unknown): "M" | "W" {
  return String(value ?? "").trim().toUpperCase() === "W" ? "W" : "M";
}

function normalizeParticipants(rows: RosterParticipant[]): SudyamBootstrapParticipant[] {
  return rows.map((row) => ({
    playerId: String(row.playerId || "").trim(),
    playerName: String(row.playerName || "").trim(),
    gender: normalizeGender(row.gender),
    isWaitlist: Boolean(row.isWaitlist),
    position: Number(row.position || 0),
  }));
}

function normalizeBootstrapSettings(tournament: AdminTournament): Record<string, unknown> {
  return tournament.settings && typeof tournament.settings === "object" && !Array.isArray(tournament.settings)
    ? tournament.settings
    : {};
}

function getMainParticipants(
  participants: SudyamBootstrapParticipant[],
): SudyamBootstrapParticipant[] {
  return participants.filter((participant) => !participant.isWaitlist);
}

export async function resolveSudyamBootstrap(
  tournamentId: string,
  requestedFormat?: SudyamFormat | null,
): Promise<SudyamBootstrapPayload> {
  const normalizedTournamentId = String(tournamentId || "").trim();
  if (!normalizedTournamentId) {
    throw new SudyamBootstrapError(400, "tournamentId is required");
  }

  const tournament = await getTournamentById(normalizedTournamentId);
  if (!tournament) {
    throw new SudyamBootstrapError(404, "Tournament not found");
  }

  const tournamentFormat = getSudyamFormatForTournament(tournament.format);
  if (!tournamentFormat) {
    throw new SudyamBootstrapError(400, `Unsupported tournament format: ${tournament.format}`);
  }
  const format = tournamentFormat;

  const participants = normalizeParticipants(await listRosterParticipants(normalizedTournamentId));
  const mainParticipants = getMainParticipants(participants);
  const settings = normalizeBootstrapSettings(tournament);
  const legacyGameState =
    format === "ipt" ? await getTournamentLegacyGameStateById(normalizedTournamentId) : null;
  const thaiJudgeParams =
    format === "thai"
      ? resolveThaiJudgeParams({
          settings,
          participantCount: mainParticipants.length,
        })
      : undefined;
  const thaiJudgeModule =
    format === "thai"
      ? normalizeThaiJudgeModule(settings.thaiJudgeModule, THAI_JUDGE_MODULE_LEGACY)
      : undefined;
  const thaiJudgeLegacyUrl =
    format === "thai"
      ? buildThaiJudgeRelativeUrl({
          settings,
          participantCount: mainParticipants.length,
          tournamentId: normalizedTournamentId,
        })
      : undefined;

  let thaiJudgeBlockedReason: string | null = null;
  let thaiJudgeState: ThaiJudgeStateSummary | undefined;
  let thaiOperatorState: ThaiOperatorStateSummary | undefined;
  let thaiJudgeNeedsBootstrap = false;

  if (format === "thai" && thaiJudgeModule !== THAI_JUDGE_MODULE_LEGACY) {
    const tournamentStatusKey = String(tournament.status || "").trim().toLowerCase();
    const isFinishedTournament = tournamentStatusKey === "finished";
    const storedSignature = normalizeThaiJudgeBootstrapSignature(settings.thaiJudgeBootstrapSignature);
    const currentSignature = buildThaiJudgeStructuralSignature({
      settings,
      participants: mainParticipants,
    });

    if (!isExactThaiTournamentFormat(tournament.format)) {
      thaiJudgeBlockedReason = "Thai Next judge module requires a Thai tournament format";
    } else if (isFinishedTournament) {
      thaiJudgeBlockedReason = "Thai judge launch is blocked for finished tournaments";
    } else if (tournamentStatusKey === "cancelled") {
      thaiJudgeBlockedReason = "Thai judge launch is blocked for cancelled tournaments";
    } else {
      thaiJudgeBlockedReason = validateThaiNextTournamentSetup({
        format: tournament.format,
        settings,
        participants: mainParticipants.map((participant) => ({
          playerId: participant.playerId,
          gender: participant.gender,
          position: participant.position,
          isWaitlist: participant.isWaitlist,
        })),
      });
    }

    if (
      !isFinishedTournament &&
      !thaiJudgeBlockedReason &&
      storedSignature &&
      !thaiJudgeBootstrapSignaturesMatch(storedSignature, currentSignature)
    ) {
      thaiJudgeBlockedReason = "Thai Next bootstrap blocked: roster/settings drifted after initialization";
    }

    if (!thaiJudgeBlockedReason || isFinishedTournament) {
      let thaiStateLoadError: string | null = null;
      try {
        thaiJudgeState = (await getThaiJudgeStateSummary(normalizedTournamentId)) ?? undefined;
        thaiOperatorState = (await getThaiOperatorStateSummary(normalizedTournamentId)) ?? undefined;
      } catch (error) {
        thaiStateLoadError =
          error instanceof Error ? error.message : "Thai Next state is not available yet";
      }

      if (thaiJudgeState) {
        thaiJudgeNeedsBootstrap = false;
      } else if (!storedSignature) {
        if (!isFinishedTournament) {
          thaiJudgeNeedsBootstrap = true;
        }
      } else if (thaiStateLoadError) {
        if (!isFinishedTournament) {
          thaiJudgeBlockedReason = thaiStateLoadError;
        }
      } else if (!isFinishedTournament) {
        thaiJudgeBlockedReason = "Thai Next state is not available yet";
      }
    }
  }

  return {
    tournamentId: normalizedTournamentId,
    format,
    title: tournament.name,
    thaiJudgeParams,
    thaiJudgeModule,
    thaiJudgeLegacyUrl,
    thaiJudgeNeedsBootstrap,
    thaiJudgeBlockedReason,
    thaiJudgeState,
    thaiOperatorState,
    bootstrapState: {
      tournament,
      settings,
      participants,
      legacyGameState,
    },
    fallbackLegacyUrl: buildLegacyKotcFallbackUrl({
      tournamentId: normalizedTournamentId,
      format,
    }),
  };
}
