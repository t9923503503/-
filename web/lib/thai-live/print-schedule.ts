import { buildThaiCourtBootstrapTours, thaiZoneLabel } from '@/lib/thai-live/core';
import type { ThaiBootstrapCourtPlayer, ThaiBootstrapTeam, ThaiPlayerRole } from '@/lib/thai-live/types';

export interface ThaiSchedulePrintMatch {
  matchNo: number;
  team1Names: string;
  team2Names: string;
  team1Symbolic: string;
  team2Symbolic: string;
}

export interface ThaiSchedulePrintTour {
  tourNo: number;
  matches: ThaiSchedulePrintMatch[];
}

export interface ThaiSchedulePrintCourt {
  courtNo: number;
  courtLabel: string;
  roundKind: 'r1' | 'r2';
  zoneKey?: 'hard' | 'advance' | 'medium' | 'light';
  zoneLabel?: string;
  rosterLines: string[];
  tours: ThaiSchedulePrintTour[];
  courtScheduleSeed: number;
}

export interface ThaiSchedulePrintPayload {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  tournamentTime: string;
  tournamentLocation: string;
  variant: string;
  pointLimitR1: number;
  pointLimitR2: number;
  tourCount: number;
  r1SeedUsed: number;
  r1SeedSource: 'database' | 'preview' | 'settings';
  r2Legend: string[];
  r1Courts: ThaiSchedulePrintCourt[];
  r2Courts: ThaiSchedulePrintCourt[];
  /** true если R2 ещё не создан — показаны шаблоны П1…Н4 */
  r2IsTemplate: boolean;
}

function poolAbbrev(variant: string): { primary: string; secondary: string } {
  const v = String(variant || '').toUpperCase();
  if (v === 'MN') return { primary: 'П', secondary: 'Н' };
  if (v === 'MF') return { primary: 'М', secondary: 'Ж' };
  return { primary: 'A', secondary: 'B' };
}

function splitDualLists(
  courtPlayers: ThaiBootstrapCourtPlayer[],
  variant: string,
): { primary: ThaiBootstrapCourtPlayer[]; secondary: ThaiBootstrapCourtPlayer[] } {
  const v = String(variant || '').toUpperCase();
  if (v === 'MF') {
    return {
      primary: courtPlayers.filter((p) => p.gender === 'M'),
      secondary: courtPlayers.filter((p) => p.gender === 'W'),
    };
  }
  return {
    primary: courtPlayers.slice(0, 4),
    secondary: courtPlayers.slice(4, 8),
  };
}

function formatTeamSymbolicDual(
  team: ThaiBootstrapTeam,
  courtPlayers: ThaiBootstrapCourtPlayer[],
  variant: string,
): string {
  const { primary, secondary } = poolAbbrev(variant);
  const { primary: pList, secondary: sList } = splitDualLists(courtPlayers, variant);
  const ordered = team.players.slice().sort((a, b) => {
    if (a.role === b.role) return a.playerName.localeCompare(b.playerName, 'ru');
    return a.role === 'primary' ? -1 : 1;
  });
  return ordered
    .map((p) => {
      const list = p.role === 'primary' ? pList : sList;
      const slot = list.findIndex((x) => x.playerId === p.playerId);
      const abbr = p.role === 'primary' ? primary : secondary;
      return `${abbr}${slot >= 0 ? slot + 1 : '?'}`;
    })
    .join('+');
}

function formatTeamSymbolicSingle(team: ThaiBootstrapTeam, courtPlayers: ThaiBootstrapCourtPlayer[]): string {
  const ordered = team.players.slice().sort((a, b) => {
    if (a.role === b.role) return a.playerName.localeCompare(b.playerName, 'ru');
    return a.role === 'primary' ? -1 : 1;
  });
  return ordered
    .map((p) => {
      const idx = courtPlayers.findIndex((x) => x.playerId === p.playerId);
      return `№${idx >= 0 ? idx + 1 : '?'}`;
    })
    .join('+');
}

function formatTeamSymbolic(team: ThaiBootstrapTeam, courtPlayers: ThaiBootstrapCourtPlayer[], variant: string): string {
  const v = String(variant || '').toUpperCase();
  if (v === 'MM' || v === 'WW') {
    return formatTeamSymbolicSingle(team, courtPlayers);
  }
  return formatTeamSymbolicDual(team, courtPlayers, variant);
}

function formatTeamNames(team: ThaiBootstrapTeam): string {
  return team.players
    .slice()
    .sort((a, b) => {
      if (a.role === b.role) return a.playerName.localeCompare(b.playerName, 'ru');
      return a.role === 'primary' ? -1 : 1;
    })
    .map((p) => p.playerName)
    .join(' + ');
}

export function buildPrintToursForCourt(
  courtPlayers: ThaiBootstrapCourtPlayer[],
  variant: string,
  tourCount: number,
  courtScheduleSeed: number,
): ThaiSchedulePrintTour[] {
  const tours = buildThaiCourtBootstrapTours({
    players: courtPlayers,
    variant,
    tourCount,
    seed: courtScheduleSeed,
  });
  return tours.map((tour) => ({
    tourNo: tour.tourNo,
    matches: tour.matches.map((m) => ({
      matchNo: m.matchNo,
      team1Names: formatTeamNames(m.team1),
      team2Names: formatTeamNames(m.team2),
      team1Symbolic: formatTeamSymbolic(m.team1, courtPlayers, variant),
      team2Symbolic: formatTeamSymbolic(m.team2, courtPlayers, variant),
    })),
  }));
}

export function buildRosterLines(courtPlayers: ThaiBootstrapCourtPlayer[], variant: string): string[] {
  const v = String(variant || '').toUpperCase();
  if (v === 'MF') {
    const men = courtPlayers.filter((p) => p.gender === 'M');
    const women = courtPlayers.filter((p) => p.gender === 'W');
    return [
      ...men.map((p, i) => `М${i + 1}: ${p.playerName}`),
      ...women.map((p, i) => `Ж${i + 1}: ${p.playerName}`),
    ];
  }
  if (v === 'MN') {
    return [
      ...courtPlayers.slice(0, 4).map((p, i) => `П${i + 1} (профи): ${p.playerName}`),
      ...courtPlayers.slice(4, 8).map((p, i) => `Н${i + 1} (новичок): ${p.playerName}`),
    ];
  }
  return courtPlayers.map((p, i) => `№${i + 1}: ${p.playerName}`);
}

export function r2FormationLegend(variant: string, courtCount: number): string[] {
  const zones = (['HARD', 'ADVANCE', 'MEDIUM', 'LIGHT'] as const).slice(0, Math.max(1, Math.min(4, courtCount)));
  const v = String(variant || '').toUpperCase();
  if (v === 'MN' || v === 'MF') {
    const pName = v === 'MN' ? 'профи' : 'мужчин';
    const sName = v === 'MN' ? 'новичков' : 'женщин';
    return [
      `После завершения R1 на всех кортах участники ранжируются отдельно в двух пулах (${pName} и ${sName}) по сумме очков P внутри своего пула по всем кортам R1 (при равенстве — по регламенту турнира: кеф и пр.).`,
      `На каждом корту R2 восемь человек: четыре сильнейших по пулу «${pName === 'профи' ? 'профи' : 'мужчины'}» и четыре сильнейших по пулу «${sName}» для соответствующего диапазона мест.`,
      ...zones.map((z, i) => {
        const start = i * 4 + 1;
        const end = (i + 1) * 4;
        return `Зона ${z} (корт R2 ${i + 1}): места ${start}–${end} в рейтинге ${pName} и ${start}–${end} в рейтинге ${sName}. Обозначения П1…П4 / Н1…Н4 в матчах — номера внутри состава этого корта R2.`;
      }),
    ];
  }
  return [
    'После R1 все участники объединяются в один общий рейтинг по сумме P; на зоны R2 идут последовательные восьмёрки из этого списка.',
    ...zones.map((z, i) => {
      const start = i * 8 + 1;
      const end = (i + 1) * 8;
      return `Зона ${z}: общие места R1 с ${start} по ${end} (восемь человек на корт). №1…№8 в расписании — порядок на корту R2.`;
    }),
  ];
}

export function placeholderR2CourtPlayers(variant: string): ThaiBootstrapCourtPlayer[] {
  const v = String(variant || '').toUpperCase();
  if (v === 'MF') {
    return [
      ...[1, 2, 3, 4].map((n) => ({
        playerId: `tpl-m${n}`,
        playerName: `М${n}`,
        gender: 'M' as const,
      })),
      ...[1, 2, 3, 4].map((n) => ({
        playerId: `tpl-w${n}`,
        playerName: `Ж${n}`,
        gender: 'W' as const,
      })),
    ];
  }
  if (v === 'MN') {
    return [
      ...[1, 2, 3, 4].map((n) => ({
        playerId: `tpl-p${n}`,
        playerName: `П${n}`,
        gender: 'M' as const,
      })),
      ...[1, 2, 3, 4].map((n) => ({
        playerId: `tpl-n${n}`,
        playerName: `Н${n}`,
        gender: 'M' as const,
      })),
    ];
  }
  return Array.from({ length: 8 }, (_, i) => ({
    playerId: `tpl-${i + 1}`,
    playerName: `№${i + 1}`,
    gender: 'M' as const,
  }));
}

export function buildSchedulePrintCourt(input: {
  courtNo: number;
  courtLabel: string;
  roundKind: 'r1' | 'r2';
  zoneKey?: 'hard' | 'advance' | 'medium' | 'light';
  players: ThaiBootstrapCourtPlayer[];
  variant: string;
  tourCount: number;
  courtScheduleSeed: number;
}): ThaiSchedulePrintCourt {
  const zoneLabel = input.zoneKey ? thaiZoneLabel(input.zoneKey) : undefined;
  return {
    courtNo: input.courtNo,
    courtLabel: input.courtLabel,
    roundKind: input.roundKind,
    zoneKey: input.zoneKey,
    zoneLabel,
    rosterLines: buildRosterLines(input.players, input.variant),
    tours: buildPrintToursForCourt(input.players, input.variant, input.tourCount, input.courtScheduleSeed),
    courtScheduleSeed: input.courtScheduleSeed,
  };
}
