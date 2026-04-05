import { IPT_MIXED_FORMAT } from "./admin-legacy-sync";

export const SUDYAM_FORMATS = ["ipt", "kotc", "rr", "thai"] as const;

export type SudyamFormat = (typeof SUDYAM_FORMATS)[number];

export type SearchParamsShape = Record<string, string | string[] | undefined>;

export interface SudyamLaunchTarget {
  tournamentId: string;
  format: SudyamFormat;
}

export interface ParsedSudyamLaunch {
  source: "none" | "canonical" | "legacy";
  tournamentId: string;
  format: SudyamFormat | null;
  forceLegacy: boolean;
}

const FORMAT_ALIASES: Record<string, SudyamFormat> = {
  ipt: "ipt",
  "ipt mixed": "ipt",
  ipt_mixed: "ipt",
  kotc: "kotc",
  "king of the court": "kotc",
  "king-of-the-court": "kotc",
  rr: "rr",
  "round robin": "rr",
  round_robin: "rr",
  thai: "thai",
};

const ADMIN_TOURNAMENT_FORMATS: Record<string, SudyamFormat> = {
  [IPT_MIXED_FORMAT]: "ipt",
  "King of the Court": "kotc",
  "Round Robin": "rr",
  Thai: "thai",
};

export function getSingleSearchParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

export function normalizeSudyamFormat(value: unknown): SudyamFormat | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return FORMAT_ALIASES[normalized] ?? null;
}

export function getSudyamFormatForTournament(value: unknown): SudyamFormat | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return ADMIN_TOURNAMENT_FORMATS[raw] ?? normalizeSudyamFormat(raw);
}

export function getSudyamFormatLabel(format: SudyamFormat): string {
  switch (format) {
    case "ipt":
      return "IPT";
    case "kotc":
      return "KOTC";
    case "rr":
      return "Round Robin";
    case "thai":
      return "Thai";
  }
}

export function buildSudyamLaunchUrl(input: {
  tournamentId: string;
  format: unknown;
  legacy?: boolean;
}): string {
  const tournamentId = String(input.tournamentId || "").trim();
  const format = normalizeSudyamFormat(input.format);
  if (!tournamentId || !format) return "";
  const params = new URLSearchParams();
  params.set("tournamentId", tournamentId);
  params.set("format", format);
  if (input.legacy) {
    params.set("legacy", "1");
  }
  return `/sudyam?${params.toString()}`;
}

export function buildLegacyKotcFallbackUrl(input: {
  tournamentId: string;
  format: unknown;
}): string {
  const tournamentId = String(input.tournamentId || "").trim();
  const format = normalizeSudyamFormat(input.format);
  if (!tournamentId || !format) return "";
  const params = new URLSearchParams();
  params.set("legacyTournamentId", tournamentId);
  params.set("legacyFormat", format);
  params.set("startTab", "roster");
  return `/kotc/?${params.toString()}`;
}

export function parseSudyamLaunch(searchParams?: SearchParamsShape): ParsedSudyamLaunch {
  const canonicalTournamentId = getSingleSearchParam(searchParams?.tournamentId).trim();
  const canonicalFormat = normalizeSudyamFormat(getSingleSearchParam(searchParams?.format));
  const legacyTournamentId = getSingleSearchParam(searchParams?.legacyTournamentId).trim();
  const legacyFormat = normalizeSudyamFormat(getSingleSearchParam(searchParams?.legacyFormat));
  const forceLegacy = getSingleSearchParam(searchParams?.legacy).trim() === "1";

  if (canonicalTournamentId) {
    return {
      source: "canonical",
      tournamentId: canonicalTournamentId,
      format: canonicalFormat,
      forceLegacy,
    };
  }

  if (legacyTournamentId) {
    return {
      source: "legacy",
      tournamentId: legacyTournamentId,
      format: legacyFormat,
      forceLegacy: false,
    };
  }

  return {
    source: "none",
    tournamentId: "",
    format: null,
    forceLegacy: false,
  };
}
