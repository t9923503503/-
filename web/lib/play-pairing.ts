export type PlayPairingSuggestionMode = 'random' | 'balanced' | 'fresh' | 'rematch';

export interface PlayPairingPlayer {
  resultKey: number;
  rating?: number | null;
}

export interface PlayPairingSuggestion {
  mode: PlayPairingSuggestionMode;
  teamA: number[];
  teamB: number[];
  ratingDifference: number;
  repeatedPartnerships: number;
}

type PartnershipCounts = ReadonlyMap<string, number>;

function pairKey(first: number, second: number): string {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

function seededIndex(seed: number, length: number): number {
  const value = Math.abs(Math.trunc(seed || Date.now()));
  return length ? value % length : 0;
}

function partitions(ids: number[]): Array<[number[], number[]]> {
  if (ids.length !== 4) return [];
  return [
    [[ids[0], ids[1]], [ids[2], ids[3]]],
    [[ids[0], ids[2]], [ids[1], ids[3]]],
    [[ids[0], ids[3]], [ids[1], ids[2]]],
  ];
}

export function suggest2x2Pairing(
  players: PlayPairingPlayer[],
  mode: PlayPairingSuggestionMode,
  options: {
    partnershipCounts?: PartnershipCounts;
    previousTeams?: [number[], number[]] | null;
    seed?: number;
  } = {},
): PlayPairingSuggestion | null {
  if (players.length !== 4 || new Set(players.map((player) => player.resultKey)).size !== 4) return null;
  const ids = players.map((player) => player.resultKey);
  const ratings = new Map(players.map((player) => [player.resultKey, Number(player.rating) || 1000]));
  const counts = options.partnershipCounts ?? new Map<string, number>();
  const variants = partitions(ids).map(([teamA, teamB]) => {
    const ratingA = teamA.reduce((sum, id) => sum + (ratings.get(id) ?? 1000), 0);
    const ratingB = teamB.reduce((sum, id) => sum + (ratings.get(id) ?? 1000), 0);
    return {
      teamA,
      teamB,
      ratingDifference: Math.abs(ratingA - ratingB),
      repeatedPartnerships: (counts.get(pairKey(teamA[0], teamA[1])) ?? 0) + (counts.get(pairKey(teamB[0], teamB[1])) ?? 0),
    };
  });

  let selected = variants[0];
  if (mode === 'random') selected = variants[seededIndex(options.seed ?? Date.now(), variants.length)];
  if (mode === 'balanced') selected = [...variants].sort((a, b) => a.ratingDifference - b.ratingDifference || a.repeatedPartnerships - b.repeatedPartnerships)[0];
  if (mode === 'fresh') selected = [...variants].sort((a, b) => a.repeatedPartnerships - b.repeatedPartnerships || a.ratingDifference - b.ratingDifference)[0];
  if (mode === 'rematch' && options.previousTeams) {
    const previous = options.previousTeams.map((team) => [...team].sort((a, b) => a - b).join(':')).sort().join('|');
    selected = variants.find((variant) => [variant.teamA, variant.teamB].map((team) => [...team].sort((a, b) => a - b).join(':')).sort().join('|') === previous) ?? selected;
  }

  return { mode, ...selected };
}

