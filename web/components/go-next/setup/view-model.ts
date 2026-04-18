import type { GoGroupView, GoTeamView } from '@/lib/go-next/types';

export interface RosterLevelSummary {
  key: 'hard' | 'medium' | 'lite';
  teamCount: number;
  gridSize: number;
  byeCount: number;
  ok: boolean;
  isUsed: boolean;
}

export interface RosterSummaryViewModel {
  hard: RosterLevelSummary;
  medium: RosterLevelSummary;
  lite: RosterLevelSummary;
}

export function nextPowerOf2(n: number): number {
  if (n <= 1) return 2;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

export function byeInfo(teamCount: number): { gridSize: number; byeCount: number; ok: boolean } {
  if (teamCount < 2) return { gridSize: 2, byeCount: Math.max(0, 2 - teamCount), ok: false };
  const gridSize = nextPowerOf2(teamCount);
  return { gridSize, byeCount: gridSize - teamCount, ok: true };
}

function isRealActiveTeam(team: GoTeamView): boolean {
  const maybeTeam = team as GoTeamView & {
    isInactive?: boolean;
    inactive?: boolean;
    removed?: boolean;
    removedAt?: string | null;
  };
  if (team.isBye) return false;
  if (!team.teamId || !team.player1?.id) return false;
  const normalizedLabel = (team.label ?? '').trim().toUpperCase();
  if (!normalizedLabel || normalizedLabel === 'TBD' || normalizedLabel.startsWith('TBD ')) return false;
  if (maybeTeam.isInactive || maybeTeam.inactive || maybeTeam.removed || Boolean(maybeTeam.removedAt)) return false;
  return true;
}

function countByBucket(teams: GoGroupView[]): Record<'hard' | 'medium' | 'lite', number> {
  const all = teams.flatMap((group) => group.teams).filter(isRealActiveTeam);
  return {
    hard: all.filter((team) => team.initialBucket === 'hard').length,
    medium: all.filter((team) => team.initialBucket === 'medium').length,
    lite: all.filter((team) => team.initialBucket === 'lite').length,
  };
}

export function buildRosterLevelSummary(teams: GoGroupView[], levelCount: 2 | 3): RosterSummaryViewModel {
  const counts = countByBucket(teams);
  const hardBye = byeInfo(counts.hard);
  const mediumBye = byeInfo(counts.medium);
  const liteBye = byeInfo(counts.lite);

  return {
    hard: { key: 'hard', teamCount: counts.hard, isUsed: true, ...hardBye },
    medium: { key: 'medium', teamCount: counts.medium, isUsed: levelCount === 3, ...mediumBye },
    lite: { key: 'lite', teamCount: counts.lite, isUsed: true, ...liteBye },
  };
}
