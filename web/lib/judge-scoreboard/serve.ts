import type {
  MatchEventPlayerRef,
  ServeTeamState,
  TeamId,
  TeamPlayer,
} from './types';

export const MAX_TEAM_PLAYERS = 4;
const DEFAULT_PLAYER_COUNT = 2;

function normalizeName(value: unknown): string {
  return String(value || '').trim();
}

function normalizePlayerId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

function dedupeByName(players: TeamPlayer[]): TeamPlayer[] {
  const seen = new Set<string>();
  return players.filter((player) => {
    const key = normalizeName(player.name).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackPlayers(prefix: string, count = DEFAULT_PLAYER_COUNT): TeamPlayer[] {
  return Array.from({ length: Math.max(1, Math.min(MAX_TEAM_PLAYERS, count)) }, (_, index) => ({
    id: normalizePlayerId(prefix, index),
    name: `Игрок ${prefix.toUpperCase()}${index + 1}`,
  }));
}

export function splitTeamLabelToPlayers(label: string, prefix: string): TeamPlayer[] {
  const raw = normalizeName(label);
  if (!raw) return fallbackPlayers(prefix);
  const parts = raw
    .split(/\s*(?:\/|,|;|&|\+)\s*/g)
    .map((item) => normalizeName(item))
    .filter(Boolean)
    .slice(0, MAX_TEAM_PLAYERS);
  if (!parts.length) return fallbackPlayers(prefix);
  return parts.map((name, index) => ({
    id: normalizePlayerId(prefix, index),
    name,
  }));
}

export function normalizeTeamPlayers(players: TeamPlayer[] | undefined | null, fallbackLabel: string, prefix: string): TeamPlayer[] {
  const candidate = Array.isArray(players)
    ? players
        .map((player, index) => ({
          id: normalizeName(player?.id) || normalizePlayerId(prefix, index),
          name: normalizeName(player?.name),
        }))
        .filter((player) => player.name)
        .slice(0, MAX_TEAM_PLAYERS)
    : [];

  const deduped = dedupeByName(candidate);
  if (deduped.length) return deduped;
  return splitTeamLabelToPlayers(fallbackLabel, prefix);
}

export function createServeTeamState(players: TeamPlayer[] | undefined | null, prefix: string): ServeTeamState {
  const order = normalizeTeamPlayers(players, '', prefix);
  return {
    order,
    currentIndex: 0,
    nextIndex: order.length > 1 ? 1 : 0,
  };
}

export function cycleServeIndex(orderLength: number, index: number): number {
  if (orderLength <= 1) return 0;
  const normalized = Math.max(0, Math.trunc(index));
  return normalized % orderLength;
}

export function normalizeServeTeamState(
  raw: Partial<ServeTeamState> | null | undefined,
  roster: TeamPlayer[] | undefined | null,
  prefix: string,
): ServeTeamState {
  const normalizedRoster = normalizeTeamPlayers(roster, '', prefix);
  const fallback = createServeTeamState(normalizedRoster, prefix);
  if (!raw || !Array.isArray(raw.order) || !raw.order.length) {
    return fallback;
  }

  const rosterById = new Map(normalizedRoster.map((player) => [player.id, player] as const));
  const rosterByName = new Map(normalizedRoster.map((player) => [player.name.toLowerCase(), player] as const));

  const mapped = raw.order
    .map((player, index) => {
      const playerId = normalizeName(player?.id);
      const playerName = normalizeName(player?.name);
      if (playerId && rosterById.has(playerId)) return rosterById.get(playerId)!;
      if (playerName && rosterByName.has(playerName.toLowerCase())) return rosterByName.get(playerName.toLowerCase())!;
      if (!playerName) return null;
      return {
        id: playerId || normalizePlayerId(prefix, index),
        name: playerName,
      } satisfies TeamPlayer;
    })
    .filter(Boolean)
    .slice(0, Math.max(1, Math.min(MAX_TEAM_PLAYERS, normalizedRoster.length || MAX_TEAM_PLAYERS))) as TeamPlayer[];

  const order = dedupeByName(mapped);
  if (!order.length) return fallback;

  return {
    order,
    currentIndex: cycleServeIndex(order.length, Number(raw.currentIndex || 0)),
    nextIndex: cycleServeIndex(
      order.length,
      Number(raw.nextIndex ?? (Number(raw.currentIndex || 0) + 1)),
    ),
  };
}

export function getServePlayerRef(
  teamState: ServeTeamState | null | undefined,
  mode: 'current' | 'next' = 'current',
): MatchEventPlayerRef | null {
  if (!teamState?.order?.length) return null;
  const index = mode === 'next' ? teamState.nextIndex : teamState.currentIndex;
  const position = cycleServeIndex(teamState.order.length, index);
  const player = teamState.order[position];
  if (!player) return null;
  return {
    id: player.id,
    name: player.name,
    position: position + 1,
  };
}

export function advanceServeTeamState(teamState: ServeTeamState): ServeTeamState {
  if (!teamState.order.length) return teamState;
  const nextCurrent = cycleServeIndex(teamState.order.length, teamState.nextIndex);
  return {
    ...teamState,
    currentIndex: nextCurrent,
    nextIndex: cycleServeIndex(teamState.order.length, nextCurrent + 1),
  };
}

export function cloneTeamPlayers(players: TeamPlayer[] | undefined | null): TeamPlayer[] {
  return (players || []).map((player) => ({ ...player }));
}

export function teamPrefix(team: TeamId): string {
  return team === 'A' ? 'a' : 'b';
}
