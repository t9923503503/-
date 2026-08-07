import type { TournamentResult } from './types';

export interface InsightBestResult {
  tournamentId?: string;
  tournamentName: string;
  date: string;
  place: number;
  ratingPoints: number;
}

export interface InsightFormEntry {
  tournamentId?: string;
  tournamentName: string;
  date: string;
  place: number;
}

export interface ThaiPlayerInsightNativeRow {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  roundNo: number;
  roundType: 'r1' | 'r2';
  pointsP: number;
  wins: number;
  totalDiff: number;
  kef: number;
  zone: 'hard' | 'advanced' | 'medium' | 'light' | null;
  closeWins: number;
}

export interface KotcPlayerInsightNativeRow {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  roundNo: number;
  kingWins: number;
  takeovers: number;
  gamesPlayed: number;
  longestKingRun: number;
  zone: 'kin' | 'advanced' | 'medium' | 'light' | null;
}

export interface ThaiPlayerInsights {
  totalTournaments: number;
  nativeTournamentCount: number;
  fallbackTournamentCount: number;
  podiumRate: number;
  avgPlace: number;
  totalRatingPoints: number;
  avgRatingPoints: number;
  bestResult: InsightBestResult | null;
  latestForm: InsightFormEntry[];
  r1Count: number;
  r2Count: number;
  zoneFinishes: { hard: number; advanced: number; medium: number; light: number };
  avgPointsP: number | null;
  avgWins: number | null;
  avgDiff: number | null;
  bestDiff: number | null;
  closeMatchWins: number | null;
  hasDeepStats: boolean;
}

export interface KotcRoundTotals {
  totalKingWins: number;
  totalTakeovers: number;
  totalGamesPlayed: number;
  longestKingRun: number;
}

export interface KotcPlayerInsights {
  totalTournaments: number;
  nativeTournamentCount: number;
  fallbackTournamentCount: number;
  podiumRate: number;
  avgPlace: number;
  totalRatingPoints: number;
  avgRatingPoints: number;
  bestResult: InsightBestResult | null;
  latestForm: InsightFormEntry[];
  totalKingWins: number | null;
  totalTakeovers: number | null;
  totalGamesPlayed: number | null;
  avgKingWinsPerTournament: number | null;
  avgTakeoversPerTournament: number | null;
  kingEfficiency: number | null;
  takeoverConversion: number | null;
  longestKingRun: number | null;
  zoneFinishes: { kin: number; advanced: number; medium: number; light: number };
  bestZoneFinish: 'kin' | 'advanced' | 'medium' | 'light' | null;
  r1Totals: KotcRoundTotals | null;
  r2Totals: KotcRoundTotals | null;
  hasDeepStats: boolean;
}

export interface PlayerFormatInsights {
  overall: {
    totalTournaments: number;
    primaryRating: number;
    bestPlace: number;
    currentTop3Streak: number;
    lastTournament: { tournamentId?: string; tournamentName: string; date: string; place: number } | null;
    avgRatingPoints: number;
  };
  thai: ThaiPlayerInsights;
  kotc: KotcPlayerInsights;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function emptyThai(): ThaiPlayerInsights {
  return {
    totalTournaments: 0,
    nativeTournamentCount: 0,
    fallbackTournamentCount: 0,
    podiumRate: 0,
    avgPlace: 0,
    totalRatingPoints: 0,
    avgRatingPoints: 0,
    bestResult: null,
    latestForm: [],
    r1Count: 0,
    r2Count: 0,
    zoneFinishes: { hard: 0, advanced: 0, medium: 0, light: 0 },
    avgPointsP: null,
    avgWins: null,
    avgDiff: null,
    bestDiff: null,
    closeMatchWins: null,
    hasDeepStats: false,
  };
}

function emptyKotc(): KotcPlayerInsights {
  return {
    totalTournaments: 0,
    nativeTournamentCount: 0,
    fallbackTournamentCount: 0,
    podiumRate: 0,
    avgPlace: 0,
    totalRatingPoints: 0,
    avgRatingPoints: 0,
    bestResult: null,
    latestForm: [],
    totalKingWins: null,
    totalTakeovers: null,
    totalGamesPlayed: null,
    avgKingWinsPerTournament: null,
    avgTakeoversPerTournament: null,
    kingEfficiency: null,
    takeoverConversion: null,
    longestKingRun: null,
    zoneFinishes: { kin: 0, advanced: 0, medium: 0, light: 0 },
    bestZoneFinish: null,
    r1Totals: null,
    r2Totals: null,
    hasDeepStats: false,
  };
}

export function emptyPlayerFormatInsights(): PlayerFormatInsights {
  return {
    overall: {
      totalTournaments: 0,
      primaryRating: 0,
      bestPlace: 0,
      currentTop3Streak: 0,
      lastTournament: null,
      avgRatingPoints: 0,
    },
    thai: emptyThai(),
    kotc: emptyKotc(),
  };
}

function isThaiFormat(value: string | null | undefined): boolean {
  return String(value || '').trim().toLowerCase().includes('thai');
}

function isKotcFormat(value: string | null | undefined): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'kotc' || normalized.includes('king');
}

function thaiZoneKey(
  value: string | null | undefined,
): 'hard' | 'advanced' | 'medium' | 'light' | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'advance' || normalized === 'advanced') return 'advanced';
  if (normalized === 'hard') return 'hard';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'light' || normalized === 'lite') return 'light';
  return null;
}

function kotcZoneKey(
  value: string | null | undefined,
): 'kin' | 'advanced' | 'medium' | 'light' | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'kin' || normalized === 'hard') return 'kin';
  if (normalized === 'advance' || normalized === 'advanced') return 'advanced';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'light' || normalized === 'lite') return 'light';
  return null;
}

function summarizeMatches(matches: TournamentResult[]) {
  const totalTournaments = matches.length;
  const places = matches.map((match) => Number(match.place || 0)).filter((place) => place > 0);
  const podiumCount = places.filter((place) => place <= 3).length;
  const totalRatingPoints = matches.reduce((sum, match) => sum + Number(match.ratingPts || 0), 0);
  const avgPlace = places.length ? round1(places.reduce((sum, place) => sum + place, 0) / places.length) : 0;
  const avgRatingPoints = totalTournaments ? round1(totalRatingPoints / totalTournaments) : 0;
  const podiumRate = totalTournaments ? Math.round((podiumCount / totalTournaments) * 100) : 0;
  let bestResult: InsightBestResult | null = null;
  for (const match of matches) {
    if (!bestResult || Number(match.ratingPts || 0) > bestResult.ratingPoints) {
      bestResult = {
        tournamentId: match.tournamentId,
        tournamentName: String(match.tournamentName || ''),
        date: String(match.tournamentDate || ''),
        place: Number(match.place || 0),
        ratingPoints: Number(match.ratingPts || 0),
      };
    }
  }
  const latestForm = matches.slice(0, 5).map((match) => ({
    tournamentId: match.tournamentId,
    tournamentName: String(match.tournamentName || ''),
    date: String(match.tournamentDate || ''),
    place: Number(match.place || 0),
  }));
  return {
    totalTournaments,
    podiumRate,
    avgPlace,
    totalRatingPoints,
    avgRatingPoints,
    bestResult,
    latestForm,
  };
}

export function buildPlayerFormatInsights(input: {
  matches: TournamentResult[];
  primaryRating: number;
  currentTop3Streak: number;
  thaiNativeRows: ThaiPlayerInsightNativeRow[];
  kotcNativeRows: KotcPlayerInsightNativeRow[];
}): PlayerFormatInsights {
  const { matches, primaryRating, currentTop3Streak, thaiNativeRows, kotcNativeRows } = input;
  const overallBestPlace = matches.reduce((best, match) => {
    const place = Number(match.place || 0);
    if (!place) return best;
    if (!best) return place;
    return Math.min(best, place);
  }, 0);
  const overallLastMatch = matches[0] || null;
  const overallAvgRatingPoints = matches.length
    ? round1(matches.reduce((sum, match) => sum + Number(match.ratingPts || 0), 0) / matches.length)
    : 0;

  const thaiMatches = matches.filter((match) => isThaiFormat(match.format));
  const kotcMatches = matches.filter((match) => isKotcFormat(match.format));

  const thai = emptyThai();
  const kotc = emptyKotc();

  const thaiSummary = summarizeMatches(thaiMatches);
  Object.assign(thai, thaiSummary);
  thai.nativeTournamentCount = thaiNativeRows.length;
  thai.fallbackTournamentCount = Math.max(0, thaiSummary.totalTournaments - thai.nativeTournamentCount);
  thai.hasDeepStats = thaiNativeRows.length > 0;
  if (thaiNativeRows.length) {
    thai.r1Count = thaiNativeRows.filter((row) => row.roundType === 'r1').length;
    thai.r2Count = thaiNativeRows.filter((row) => row.roundType === 'r2').length;
    for (const row of thaiNativeRows) {
      const zone = thaiZoneKey(row.zone);
      if (row.roundType === 'r2' && zone) thai.zoneFinishes[zone] += 1;
    }
    thai.avgPointsP = round1(thaiNativeRows.reduce((sum, row) => sum + row.pointsP, 0) / thaiNativeRows.length);
    thai.avgWins = round1(thaiNativeRows.reduce((sum, row) => sum + row.wins, 0) / thaiNativeRows.length);
    thai.avgDiff = round1(thaiNativeRows.reduce((sum, row) => sum + row.totalDiff, 0) / thaiNativeRows.length);
    thai.bestDiff = Math.max(...thaiNativeRows.map((row) => row.totalDiff));
    thai.closeMatchWins = thaiNativeRows.reduce((sum, row) => sum + row.closeWins, 0);
  }

  const kotcSummary = summarizeMatches(kotcMatches);
  Object.assign(kotc, kotcSummary);
  kotc.nativeTournamentCount = new Set(kotcNativeRows.map((row) => row.tournamentId)).size;
  kotc.fallbackTournamentCount = Math.max(0, kotcSummary.totalTournaments - kotc.nativeTournamentCount);
  kotc.hasDeepStats = kotcNativeRows.length > 0;
  if (kotcNativeRows.length) {
    const totalKingWins = kotcNativeRows.reduce((sum, row) => sum + row.kingWins, 0);
    const totalTakeovers = kotcNativeRows.reduce((sum, row) => sum + row.takeovers, 0);
    const totalGamesPlayed = kotcNativeRows.reduce((sum, row) => sum + row.gamesPlayed, 0);
    kotc.totalKingWins = totalKingWins;
    kotc.totalTakeovers = totalTakeovers;
    kotc.totalGamesPlayed = totalGamesPlayed;
    kotc.longestKingRun = Math.max(...kotcNativeRows.map((row) => row.longestKingRun));
    kotc.kingEfficiency = totalGamesPlayed > 0 ? round1(totalKingWins / totalGamesPlayed) : null;
    kotc.takeoverConversion = round1(totalKingWins / Math.max(1, totalTakeovers));

    const tournamentIds = new Set(kotcNativeRows.map((row) => row.tournamentId));
    const tournamentCount = tournamentIds.size;
    kotc.avgKingWinsPerTournament = tournamentCount ? round1(totalKingWins / tournamentCount) : null;
    kotc.avgTakeoversPerTournament = tournamentCount ? round1(totalTakeovers / tournamentCount) : null;

    for (const row of kotcNativeRows) {
      const zone = kotcZoneKey(row.zone);
      if (zone && row.roundNo === 2) kotc.zoneFinishes[zone] += 1;
    }
    kotc.bestZoneFinish =
      kotc.zoneFinishes.kin > 0
        ? 'kin'
        : kotc.zoneFinishes.advanced > 0
          ? 'advanced'
          : kotc.zoneFinishes.medium > 0
            ? 'medium'
            : kotc.zoneFinishes.light > 0
              ? 'light'
              : null;

    const r1Rows = kotcNativeRows.filter((row) => row.roundNo === 1);
    const r2Rows = kotcNativeRows.filter((row) => row.roundNo === 2);
    kotc.r1Totals = r1Rows.length
      ? {
          totalKingWins: r1Rows.reduce((sum, row) => sum + row.kingWins, 0),
          totalTakeovers: r1Rows.reduce((sum, row) => sum + row.takeovers, 0),
          totalGamesPlayed: r1Rows.reduce((sum, row) => sum + row.gamesPlayed, 0),
          longestKingRun: Math.max(...r1Rows.map((row) => row.longestKingRun)),
        }
      : null;
    kotc.r2Totals = r2Rows.length
      ? {
          totalKingWins: r2Rows.reduce((sum, row) => sum + row.kingWins, 0),
          totalTakeovers: r2Rows.reduce((sum, row) => sum + row.takeovers, 0),
          totalGamesPlayed: r2Rows.reduce((sum, row) => sum + row.gamesPlayed, 0),
          longestKingRun: Math.max(...r2Rows.map((row) => row.longestKingRun)),
        }
      : null;
  }

  return {
    overall: {
      totalTournaments: matches.length,
      primaryRating,
      bestPlace: overallBestPlace,
      currentTop3Streak,
      lastTournament: overallLastMatch
        ? {
            tournamentId: overallLastMatch.tournamentId,
            tournamentName: String(overallLastMatch.tournamentName || ''),
            date: String(overallLastMatch.tournamentDate || ''),
            place: Number(overallLastMatch.place || 0),
          }
        : null,
      avgRatingPoints: overallAvgRatingPoints,
    },
    thai,
    kotc,
  };
}
