export interface GoBracketSeed {
  level: string;
  size: number;
  slots: Array<{
    bracketRound: number;
    position: number;
    teamId: string | null;
    nextSlotPosition: { round: number; position: number } | null;
    isBye: boolean;
  }>;
  firstRoundMatches: Array<{
    teamAId: string | null;
    teamBId: string | null;
    bracketRound: number;
    position: number;
  }>;
}

export function calcBracketSize(teamCount: number): number {
  const normalized = Math.max(1, Math.floor(teamCount));
  let size = 1;
  while (size < normalized) size *= 2;
  return size;
}

export function generateBracketSlots(
  levels: Record<string, Array<{ teamId: string; seedQuality: number }>>,
  bracketSizes: Record<string, number>,
): GoBracketSeed[] {
  return Object.entries(levels)
    .map(([level, entrants]) => {
      const size = Math.max(calcBracketSize(entrants.length), Math.floor(bracketSizes[level] || entrants.length || 2));
      const seededSlots = assignByes(entrants, size);
      const slots: GoBracketSeed['slots'] = [];
      const firstRoundMatches: GoBracketSeed['firstRoundMatches'] = [];
      let roundSize = size;
      let bracketRound = 1;

      while (roundSize >= 1) {
        for (let position = 1; position <= roundSize; position += 1) {
          const seeded = bracketRound === 1 ? seededSlots.find((slot) => slot.position === position) ?? null : null;
          slots.push({
            bracketRound,
            position,
            teamId: seeded?.teamId ?? null,
            nextSlotPosition: roundSize > 1 ? getNextSlotPosition(bracketRound, position) : null,
            isBye: seeded?.isBye ?? false,
          });
        }
        if (bracketRound === 1) {
          for (let position = 1; position <= roundSize; position += 2) {
            firstRoundMatches.push({
              teamAId: seededSlots.find((slot) => slot.position === position)?.teamId ?? null,
              teamBId: seededSlots.find((slot) => slot.position === position + 1)?.teamId ?? null,
              bracketRound,
              position: Math.ceil(position / 2),
            });
          }
        }
        if (roundSize === 1) break;
        roundSize = Math.ceil(roundSize / 2);
        bracketRound += 1;
      }

      return { level, size, slots, firstRoundMatches };
    })
    .filter((item) => item.firstRoundMatches.length > 0);
}

export function assignByes(
  teams: Array<{ teamId: string; seedQuality: number }>,
  bracketSize: number,
): Array<{ teamId: string | null; position: number; isBye: boolean }> {
  const normalizedSize = calcBracketSize(bracketSize);
  const order = buildSeedOrder(normalizedSize);
  const sortedTeams = [...teams].sort((left, right) => {
    if (right.seedQuality !== left.seedQuality) return right.seedQuality - left.seedQuality;
    return left.teamId.localeCompare(right.teamId);
  });
  const output = Array.from({ length: normalizedSize }, (_, index) => ({
    teamId: null as string | null,
    position: index + 1,
    isBye: true,
  }));

  for (let index = 0; index < sortedTeams.length && index < order.length; index += 1) {
    output[order[index] - 1] = {
      teamId: sortedTeams[index].teamId,
      position: order[index],
      isBye: false,
    };
  }

  return output;
}

export function getNextSlotPosition(
  bracketRound: number,
  position: number,
): { round: number; position: number } {
  return {
    round: bracketRound + 1,
    position: Math.ceil(position / 2),
  };
}

function buildSeedOrder(size: number): number[] {
  if (size <= 1) return [1];
  const previous = buildSeedOrder(size / 2);
  return previous.flatMap((seed) => [seed, size + 1 - seed]);
}
