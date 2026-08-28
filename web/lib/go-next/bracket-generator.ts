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

export interface GoStructuralBracketSlot {
  slotId: string;
  bracketLevel: string;
  bracketRound: number;
  position: number;
  teamId: string | null;
  nextSlotId: string | null;
  isBye: boolean;
}

export interface GoStructuralBracketSlotUpdate {
  slotId: string;
  teamId: string | null;
  isBye: boolean;
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
      const size = calcBracketSize(
        Math.max(calcBracketSize(entrants.length), Math.floor(bracketSizes[level] || entrants.length || 2)),
      );
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
  const seedByPosition = buildBracketSeedOrder(normalizedSize);
  const positionBySeed = new Map(seedByPosition.map((seed, index) => [seed, index + 1]));
  const sortedTeams = [...teams].sort((left, right) => {
    if (right.seedQuality !== left.seedQuality) return right.seedQuality - left.seedQuality;
    return left.teamId.localeCompare(right.teamId);
  });
  const output = Array.from({ length: normalizedSize }, (_, index) => ({
    teamId: null as string | null,
    position: index + 1,
    isBye: true,
  }));

  for (let index = 0; index < sortedTeams.length && index < seedByPosition.length; index += 1) {
    const position = positionBySeed.get(index + 1);
    if (!position) continue;
    output[position - 1] = {
      teamId: sortedTeams[index].teamId,
      position,
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

/**
 * Resolves only structural empty subtrees. An unresolved match winner remains
 * distinct from a BYE, so a known team is never advanced past a real match.
 */
export function planStructuralByeUpdates(slots: GoStructuralBracketSlot[]): GoStructuralBracketSlotUpdate[] {
  const original = new Map(slots.map((slot) => [slot.slotId, { ...slot }]));
  const planned = new Map(slots.map((slot) => [slot.slotId, { ...slot }]));
  const levelRounds = [...new Set(slots.map((slot) => `${slot.bracketLevel}\u0000${slot.bracketRound}`))]
    .map((key) => {
      const [level, roundRaw] = key.split('\u0000');
      return { level, round: Number(roundRaw) };
    })
    .sort((left, right) => left.level.localeCompare(right.level) || left.round - right.round);

  for (const { level, round } of levelRounds) {
    const rows = [...planned.values()]
      .filter((slot) => slot.bracketLevel === level && slot.bracketRound === round)
      .sort((left, right) => left.position - right.position);
    for (let index = 0; index < rows.length; index += 2) {
      const left = rows[index];
      const right = rows[index + 1];
      if (!left || !right) continue;
      const nextSlotId = left.nextSlotId ?? right.nextSlotId;
      const target = nextSlotId ? planned.get(nextSlotId) : null;
      if (!target) continue;
      const leftEmpty = left.isBye && !left.teamId;
      const rightEmpty = right.isBye && !right.teamId;
      if (leftEmpty && rightEmpty) {
        target.teamId = null;
        target.isBye = true;
      } else if (leftEmpty !== rightEmpty) {
        const advancingTeamId = leftEmpty ? right.teamId : left.teamId;
        if (advancingTeamId) {
          target.teamId = advancingTeamId;
          target.isBye = false;
        }
      }
    }
  }

  return [...planned.values()]
    .filter((slot) => {
      const before = original.get(slot.slotId);
      return Boolean(before) && (before?.teamId !== slot.teamId || before?.isBye !== slot.isBye);
    })
    .map((slot) => ({ slotId: slot.slotId, teamId: slot.teamId, isBye: slot.isBye }));
}

/** Standard single-elimination seed at every physical first-round slot. */
export function buildBracketSeedOrder(size: number): number[] {
  const normalizedSize = calcBracketSize(size);
  return buildSeedOrder(normalizedSize);
}

function buildSeedOrder(size: number): number[] {
  if (size <= 1) return [1];
  const previous = buildSeedOrder(size / 2);
  return previous.flatMap((seed) => [seed, size + 1 - seed]);
}
