import { createHash } from 'crypto';
import type { GoAdminSettings } from './go-next/types';
import { GO_ADMIN_PLAYOFF_LEAGUES } from './admin-legacy-sync';

export function buildGoCourtPin(tournamentId: string, courtNo: number): string {
  return createHash('sha1')
    .update(`go:${tournamentId}:${courtNo}`)
    .digest('base64url')
    .slice(0, 8)
    .toUpperCase();
}

export function buildGoStructuralSignature(settings: GoAdminSettings, teamCount: number): string {
  return createHash('sha1')
    .update(
      JSON.stringify({
        courts: settings.courts,
        groupFormula: settings.groupFormula,
        groupSlotSize: settings.groupSlotSize,
        matchFormat: settings.matchFormat,
        pointLimitGroup: settings.pointLimitGroup,
        pointLimitBracket: settings.pointLimitBracket,
        seedingMode: settings.seedingMode,
        slotMinutes: settings.slotMinutes,
        startTime: settings.startTime,
        enabledPlayoffLeagues: settings.enabledPlayoffLeagues,
        bracketSizes: settings.bracketSizes,
        bronzeMatchEnabled: settings.bronzeMatchEnabled,
        bracketLevels: settings.bracketLevels,
        matchPointSystem: settings.matchPointSystem,
        tieBreakerLogic: settings.tieBreakerLogic,
        teamCount,
      }),
    )
    .digest('hex');
}

export function validateGoSetup(settings: GoAdminSettings, teamCount: number): string | null {
  if (teamCount < 4) return 'Groups + Olympic requires at least 4 participants.';
  if (teamCount % 2 !== 0) return 'GO requires an even number of participants.';
  if (settings.groupSlotSize < 3 || settings.groupSlotSize > 4) {
    return 'GO group formula must produce groups of 3 or 4 teams.';
  }
  if (!settings.enabledPlayoffLeagues.length || settings.enabledPlayoffLeagues.length < 2) {
    return 'Choose at least 2 playoff leagues for GO.';
  }
  const contiguous = GO_ADMIN_PLAYOFF_LEAGUES.filter((league) => settings.enabledPlayoffLeagues.includes(league));
  if (contiguous.length !== settings.enabledPlayoffLeagues.length) {
    return 'GO playoff leagues contain unsupported values.';
  }
  for (let index = 0; index < contiguous.length - 1; index += 1) {
    const currentRank = GO_ADMIN_PLAYOFF_LEAGUES.indexOf(contiguous[index]);
    const nextRank = GO_ADMIN_PLAYOFF_LEAGUES.indexOf(contiguous[index + 1]);
    if (nextRank - currentRank !== 1) {
      return 'GO playoff leagues must form a continuous strength ladder.';
    }
  }
  if (contiguous[0] === 'medium' || contiguous[0] === 'lite') {
    return 'GO playoff leagues must start from HARD or LYUTYE.';
  }
  for (const league of settings.enabledPlayoffLeagues) {
    const size = Number(settings.bracketSizes[league] ?? 0);
    if (league === 'lyutye' || league === 'hard') {
      if (![4, 8, 16].includes(size)) {
        return `${String(league).toUpperCase()} bracket size must be 4, 8, or 16.`;
      }
    } else if (![2, 4, 8, 16].includes(size)) {
      return `${String(league).toUpperCase()} bracket size must be 2, 4, 8, or 16.`;
    }
  }
  return null;
}
