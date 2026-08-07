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
  type ThaiCompletionChecklist,
  type ThaiJudgeStateSummary,
  type ThaiOpsLogAction,
  type ThaiOpsLogEntry,
  type ThaiOperatorStateSummary,
} from "./thai-live";
import { fetchAuditLogForEntity } from "./admin-audit";
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
  GO_ADMIN_FORMAT,
  normalizeGoAdminSettings,
  normalizeKotcJudgeBootstrapSignature,
  normalizeKotcJudgeModule,
  normalizeKotcR2SeedingMode,
  normalizeKotcTakeoversMode,
  type KotcJudgeModule,
} from "./admin-legacy-sync";
import {
  type GoAdminSettings,
  getGoOperatorState,
  isGoNextError,
  type GoOperatorState,
} from "./go-next";
import {
  buildGoStructuralSignature,
  validateGoSetup,
} from "./go-next-config";

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
  thaiOpsLog?: ThaiOpsLogEntry[];
  thaiCompletionChecklist?: ThaiCompletionChecklist;
  lastSuccessfulSyncAt?: string | null;
  lastCalendarFinishAt?: string | null;
  kotcJudgeModule?: KotcJudgeModule;
  kotcJudgeNeedsBootstrap?: boolean;
  kotcJudgeBlockedReason?: string | null;
  kotcOperatorState?: KotcNextOperatorState;
  canAdminResetKotcNext?: boolean;
  canAdminForceFinishKotcRound?: boolean;
  goJudgeNeedsBootstrap?: boolean;
  goJudgeBlockedReason?: string | null;
  goOperatorState?: GoOperatorState;
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

function isThaiAuditAction(value: string): value is ThaiOpsLogAction {
  return (
    value === "bootstrap_r1" ||
    value === "reshuffle_r1" ||
    value === "finish_r1" ||
    value === "confirm_r2_seed" ||
    value === "finish_r2" ||
    value === "replace_player" ||
    value === "sync_results" ||
    value === "mark_calendar_finished"
  );
}

function mapThaiAuditAction(action: string): ThaiOpsLogAction | null {
  switch (String(action || "").trim()) {
    case "tournament.thaiBootstrapR1":
      return "bootstrap_r1";
    case "tournament.thaiReshuffleR1":
      return "reshuffle_r1";
    case "tournament.thaiFinishR1":
      return "finish_r1";
    case "tournament.thaiConfirmR2Seed":
      return "confirm_r2_seed";
    case "tournament.thaiFinishR2":
      return "finish_r2";
    case "tournament.thaiReplacePlayer":
      return "replace_player";
    case "tournament.thaiSyncResults":
      return "sync_results";
    case "tournament.thaiMarkCalendarFinished":
      return "mark_calendar_finished";
    default:
      return null;
  }
}

function formatThaiLogTitle(action: ThaiOpsLogAction): string {
  switch (action) {
    case "bootstrap_r1":
      return "Запуск R1";
    case "reshuffle_r1":
      return "Перемешивание R1";
    case "finish_r1":
      return "Завершение R1";
    case "confirm_r2_seed":
      return "Запуск R2";
    case "finish_r2":
      return "Завершение R2";
    case "replace_player":
      return "Замена игрока";
    case "sync_results":
      return "Синхронизация рейтинга";
    case "mark_calendar_finished":
      return "Завершение в календаре";
  }
}

function formatThaiLogSummary(action: ThaiOpsLogAction, afterState: unknown): string {
  const state = afterState && typeof afterState === "object" ? (afterState as Record<string, unknown>) : {};
  switch (action) {
    case "bootstrap_r1":
    case "reshuffle_r1":
      return `Seed: ${String(state.seed ?? state.drawSeed ?? "—")}`;
    case "finish_r1":
    case "finish_r2":
      return `Стадия: ${String(state.stage ?? "closed")}`;
    case "confirm_r2_seed":
      return `Зон: ${String(state.zoneCount ?? state.zones ?? "—")}`;
    case "replace_player":
      return `${String(state.playerName ?? state.oldPlayerName ?? "Игрок")} -> ${String(state.newPlayerName ?? state.playerId ?? "замена")}`;
    case "sync_results":
      return `Раунд: ${String(state.roundUsed ?? "—")} · строк: ${String(state.inserted ?? 0)}`;
    case "mark_calendar_finished":
      return `Статус: ${String(state.status ?? "finished")}`;
  }
}

function buildThaiOpsLog(
  rows: Awaited<ReturnType<typeof fetchAuditLogForEntity>>,
): {
  entries: ThaiOpsLogEntry[];
  lastSuccessfulSyncAt: string | null;
  lastCalendarFinishAt: string | null;
} {
  const entries: ThaiOpsLogEntry[] = [];
  let lastSuccessfulSyncAt: string | null = null;
  let lastCalendarFinishAt: string | null = null;

  for (const row of rows) {
    const action = mapThaiAuditAction(row.action);
    if (!action || !isThaiAuditAction(action)) continue;
    if (!lastSuccessfulSyncAt && action === "sync_results") {
      lastSuccessfulSyncAt = row.createdAt || null;
    }
    if (!lastCalendarFinishAt && action === "mark_calendar_finished") {
      lastCalendarFinishAt = row.createdAt || null;
    }
    entries.push({
      id: row.id,
      createdAt: row.createdAt,
      actorId: row.actorId,
      actorRole: row.actorRole,
      action,
      title: formatThaiLogTitle(action),
      summary: formatThaiLogSummary(action, row.afterState),
    });
  }

  return { entries, lastSuccessfulSyncAt, lastCalendarFinishAt };
}

function buildThaiCompletionChecklist(input: {
  operatorState?: ThaiOperatorStateSummary;
  tournamentStatus: string;
  lastSuccessfulSyncAt: string | null;
  lastCalendarFinishAt: string | null;
}): ThaiCompletionChecklist {
  const tournamentFinished = input.tournamentStatus === "finished";
  const stage = input.operatorState?.stage ?? "setup";
  const hasR2 = Boolean(input.operatorState?.rounds.some((round) => round.roundType === "r2"));
  const playClosed =
    stage === "r2_finished" || (stage === "r1_finished" && !hasR2);
  const resultsSynced = Boolean(input.lastSuccessfulSyncAt || tournamentFinished);

  return {
    steps: [
      {
        key: "play_closed",
        label: "Раунды закрыты",
        status: playClosed ? "done" : input.operatorState ? "pending" : "unavailable",
        source: playClosed ? `stage=${stage}` : "Ждём завершение R1/R2",
        timestamp: null,
      },
      {
        key: "results_synced",
        label: "Рейтинг и архив синхронизированы",
        status: playClosed ? (resultsSynced ? "done" : "pending") : "unavailable",
        source: resultsSynced
          ? (input.lastSuccessfulSyncAt ? "Последняя ручная синхронизация" : "Автосинхронизация при finished")
          : "Будет синхронизирован автоматически при закрытии турнира",
        timestamp: input.lastSuccessfulSyncAt,
      },
      {
        key: "calendar_finished",
        label: "Турнир закрыт в календаре",
        status: tournamentFinished ? "done" : playClosed ? "pending" : "unavailable",
        source: tournamentFinished ? "Статус турнира = finished" : "Нужно закрыть карточку турнира",
        timestamp: input.lastCalendarFinishAt,
      },
    ],
    // Closing a Thai Next tournament already persists the standings before it changes
    // the calendar status. Do not make the operator repeat that automatic step manually.
    nextAction: !playClosed || tournamentFinished ? null : "mark_calendar_finished",
  };
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
  let thaiOpsLog: ThaiOpsLogEntry[] | undefined;
  let thaiCompletionChecklist: ThaiCompletionChecklist | undefined;
  let lastSuccessfulSyncAt: string | null = null;
  let lastCalendarFinishAt: string | null = null;
  let kotcJudgeBlockedReason: string | null = null;
  let kotcOperatorState: KotcNextOperatorState | undefined;
  let kotcJudgeNeedsBootstrap = false;
  let goJudgeBlockedReason: string | null = null;
  let goOperatorState: GoOperatorState | undefined;
  let goJudgeNeedsBootstrap = false;

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

    const thaiAuditRows = await fetchAuditLogForEntity("tournament", normalizedTournamentId, 40).catch(() => []);
    const thaiAudit = buildThaiOpsLog(thaiAuditRows);
    thaiOpsLog = thaiAudit.entries;
    lastSuccessfulSyncAt = thaiAudit.lastSuccessfulSyncAt;
    lastCalendarFinishAt = thaiAudit.lastCalendarFinishAt;
    thaiCompletionChecklist = buildThaiCompletionChecklist({
      operatorState: thaiOperatorState,
      tournamentStatus: tournamentStatusKey,
      lastSuccessfulSyncAt,
      lastCalendarFinishAt,
    });
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
    const normalizedRaundCount = normalizedPpc;
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
      takeoversMode: normalizeKotcTakeoversMode(settings.kotcTakeoversMode),
      r2SeedingMode: normalizeKotcR2SeedingMode(settings.kotcR2SeedingMode),
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

  if (format === "go") {
    const tournamentStatusKey = String(tournament.status || "").trim().toLowerCase();
    const isFinishedTournament = tournamentStatusKey === "finished";
    const normalizedGoSettings = normalizeGoAdminSettings(settings, mainParticipants.length) as GoAdminSettings;
    const storedSignature = String(settings.goJudgeBootstrapSignature || "").trim();
    const currentSignature = buildGoStructuralSignature(normalizedGoSettings, mainParticipants.length);

    if (String(tournament.format || "").trim() !== GO_ADMIN_FORMAT) {
      goJudgeBlockedReason = "GO judge module requires a Groups + Olympic tournament format";
    } else if (isFinishedTournament) {
      goJudgeBlockedReason = null;
    } else if (tournamentStatusKey === "cancelled") {
      goJudgeBlockedReason = "GO launch is blocked for cancelled tournaments";
    } else {
      goJudgeBlockedReason = validateGoSetup(normalizedGoSettings, mainParticipants.length);
    }

    if (!isFinishedTournament && !goJudgeBlockedReason && storedSignature && storedSignature !== currentSignature) {
      goJudgeBlockedReason = "GO bootstrap blocked: roster/settings drifted after initialization";
    }

    if (!goJudgeBlockedReason || isFinishedTournament) {
      let goStateLoadError: string | null = null;
      try {
        goOperatorState = (await getGoOperatorState(normalizedTournamentId)) ?? undefined;
      } catch (error) {
        if (isGoNextError(error) && error.status === 404) {
          goStateLoadError = null;
        } else {
          goStateLoadError = error instanceof Error ? error.message : "GO state is not available yet";
        }
      }

      if (goOperatorState?.r1 || goOperatorState?.r2 || (goOperatorState?.groups?.length ?? 0) > 0) {
        goJudgeNeedsBootstrap = false;
      } else if (!storedSignature) {
        if (!isFinishedTournament) {
          goJudgeNeedsBootstrap = true;
        }
      } else if (goStateLoadError) {
        if (!isFinishedTournament) {
          goJudgeBlockedReason = goStateLoadError;
        }
      } else if (!isFinishedTournament) {
        goJudgeNeedsBootstrap = true;
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
    thaiOpsLog,
    thaiCompletionChecklist,
    lastSuccessfulSyncAt,
    lastCalendarFinishAt,
    kotcJudgeModule,
    kotcJudgeNeedsBootstrap,
    kotcJudgeBlockedReason,
    kotcOperatorState,
    goJudgeNeedsBootstrap,
    goJudgeBlockedReason,
    goOperatorState,
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
