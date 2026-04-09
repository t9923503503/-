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
  buildKotcNextStructuralSignature,
  validateKotcNextSetup,
} from "./kotc-next-config";
import {
  getKotcNextOperatorStateSummary,
  type KotcNextOperatorState,
} from "./kotc-next";
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
import {
  normalizeKotcJudgeBootstrapSignature,
  normalizeKotcJudgeModule,
  type KotcJudgeModule,
} from "./admin-legacy-sync";

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
  kotcJudgeModule?: KotcJudgeModule;
  kotcJudgeNeedsBootstrap?: boolean;
  kotcJudgeBlockedReason?: string | null;
  kotcOperatorState?: KotcNextOperatorState;
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
  const kotcJudgeModule =
    format === "kotc"
      ? normalizeKotcJudgeModule(settings.kotcJudgeModule, "legacy")
      : undefined;

  let thaiJudgeBlockedReason: string | null = null;
  let thaiJudgeState: ThaiJudgeStateSummary | undefined;
  let thaiOperatorState: ThaiOperatorStateSummary | undefined;
  let thaiJudgeNeedsBootstrap = false;
  let kotcJudgeBlockedReason: string | null = null;
  let kotcOperatorState: KotcNextOperatorState | undefined;
  let kotcJudgeNeedsBootstrap = false;

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

  if (format === "kotc" && kotcJudgeModule !== "legacy") {
    const tournamentStatusKey = String(tournament.status || "").trim().toLowerCase();
    const isFinishedTournament = tournamentStatusKey === "finished";
    const storedSignature = normalizeKotcJudgeBootstrapSignature(
      settings.kotcJudgeBootstrapSignature ?? settings.kotcJudgeBootstrapSig,
    );
    const normalizedPpc = Math.max(1, Math.trunc(Number(settings.kotcPpc ?? tournament.kotcPpc ?? 4) || 4));
    const normalizedCourts = Math.max(
      1,
      Math.trunc(Number(settings.courts) || Math.ceil(mainParticipants.length / Math.max(1, normalizedPpc * 2)) || 1),
    );
    const normalizedRaundCount = Math.max(
      1,
      Math.trunc(Number(settings.kotcRaundCount ?? tournament.kotcRaundCount ?? 2) || 2),
    );
    const normalizedTimer = Math.max(
      1,
      Math.trunc(Number(settings.kotcRaundTimerMinutes ?? tournament.kotcRaundTimerMinutes ?? 10) || 10),
    );
    const variant =
      mainParticipants.some((participant) => participant.gender === "W") &&
      mainParticipants.some((participant) => participant.gender === "M")
        ? "MF"
        : mainParticipants.every((participant) => participant.gender === "W")
          ? "WW"
          : "MM";
    const currentSignature = buildKotcNextStructuralSignature({
      variant,
      courts: normalizedCourts,
      ppc: normalizedPpc,
      raundCount: normalizedRaundCount,
      playerIds: mainParticipants.map((participant) => participant.playerId),
    });

    if (!tournament.format || getSudyamFormatForTournament(tournament.format) !== "kotc") {
      kotcJudgeBlockedReason = "KOTC Next judge module requires a KOTC tournament format";
    } else if (isFinishedTournament) {
      kotcJudgeBlockedReason = null;
    } else if (tournamentStatusKey === "cancelled") {
      kotcJudgeBlockedReason = "KOTC Next launch is blocked for cancelled tournaments";
    } else {
      kotcJudgeBlockedReason = validateKotcNextSetup({
        courts: normalizedCourts,
        ppc: normalizedPpc,
        raundCount: normalizedRaundCount,
        raundTimerMinutes: normalizedTimer,
        participantCount: mainParticipants.length,
      });
    }

    if (!isFinishedTournament && !kotcJudgeBlockedReason && storedSignature && storedSignature !== currentSignature) {
      kotcJudgeBlockedReason =
        "KOTC Next bootstrap blocked: roster/settings drifted after initialization";
    }

    if (!kotcJudgeBlockedReason || isFinishedTournament) {
      let kotcStateLoadError: string | null = null;
      try {
        kotcOperatorState = (await getKotcNextOperatorStateSummary(normalizedTournamentId)) ?? undefined;
      } catch (error) {
        kotcStateLoadError =
          error instanceof Error ? error.message : "KOTC Next state is not available yet";
      }

      if (kotcOperatorState) {
        kotcJudgeNeedsBootstrap = false;
      } else if (!storedSignature) {
        if (!isFinishedTournament) {
          kotcJudgeNeedsBootstrap = true;
        }
      } else if (kotcStateLoadError) {
        if (!isFinishedTournament) {
          kotcJudgeBlockedReason = kotcStateLoadError;
        }
      } else if (!isFinishedTournament) {
        kotcJudgeBlockedReason = "KOTC Next state is not available yet";
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
    kotcJudgeModule,
    kotcJudgeNeedsBootstrap,
    kotcJudgeBlockedReason,
    kotcOperatorState,
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
