import type {
  GroupDraw,
  GroupPartition,
  PoolPairing,
  SeedEntry,
  SeededEntry,
  SeededGroup,
  SlotSource,
} from './types';
import { SportsDomainError } from './types';

const MAX_TEAMS = 48;

export function partitionGroups(teamCount: number): GroupPartition {
  if (!Number.isInteger(teamCount) || teamCount < 3 || teamCount > MAX_TEAMS) {
    throw new SportsDomainError(
      'INVALID_GROUP_TEAM_COUNT',
      `A group stage requires an integer team count from 3 to ${MAX_TEAMS}.`,
      { teamCount },
    );
  }
  if (teamCount === 5) {
    throw new SportsDomainError(
      'GROUPS_UNAVAILABLE_FOR_FIVE',
      'Five teams cannot be partitioned into groups of three or four.',
      { teamCount, alternatives: ['standalone_bracket', 'add_sixth_team'] },
    );
  }

  for (let threes = 0; threes <= Math.floor(teamCount / 3); threes += 1) {
    const remainder = teamCount - threes * 3;
    if (remainder >= 0 && remainder % 4 === 0) {
      const fours = remainder / 4;
      const capacities: (3 | 4)[] = [
        ...Array.from({ length: fours }, () => 4 as const),
        ...Array.from({ length: threes }, () => 3 as const),
      ];
      return {
        teamCount,
        groupCount: capacities.length,
        threes,
        fours,
        capacities,
      };
    }
  }

  throw new SportsDomainError('GROUP_PARTITION_NOT_FOUND', 'No valid 3/4 group partition exists.', { teamCount });
}

export function supportsModifiedPool4(partition: GroupPartition): boolean {
  return partition.threes === 0 && partition.fours > 0;
}

export function sortSeedEntries(entries: readonly SeedEntry[]): SeededEntry[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.entryId || seen.has(entry.entryId)) {
      throw new SportsDomainError('DUPLICATE_ENTRY', 'Every entryId must be non-empty and unique.', { entryId: entry.entryId });
    }
    if (!Number.isFinite(entry.rating)) {
      throw new SportsDomainError('INVALID_RATING', 'Entry rating must be a finite number.', { entryId: entry.entryId, rating: entry.rating });
    }
    if (!Number.isFinite(toTimestamp(entry.confirmedAt))) {
      throw new SportsDomainError('INVALID_CONFIRMATION_TIME', 'confirmedAt must be a valid timestamp.', {
        entryId: entry.entryId,
        confirmedAt: entry.confirmedAt,
      });
    }
    seen.add(entry.entryId);
  }

  return [...entries]
    .sort((left, right) => {
      if (right.rating !== left.rating) return right.rating - left.rating;
      const confirmationDelta = toTimestamp(left.confirmedAt) - toTimestamp(right.confirmedAt);
      if (confirmationDelta !== 0) return confirmationDelta;
      return left.entryId.localeCompare(right.entryId);
    })
    .map((entry, index) => ({ ...entry, initialSeed: index + 1 }));
}

export function seedGroupsSnake(
  entries: readonly SeedEntry[],
  partition: GroupPartition = partitionGroups(entries.length),
  groupIdPrefix = 'POOL-',
): GroupDraw {
  if (partition.teamCount !== entries.length) {
    throw new SportsDomainError('PARTITION_SIZE_MISMATCH', 'Group partition and entry list must have the same team count.', {
      partitionTeamCount: partition.teamCount,
      entryCount: entries.length,
    });
  }
  if (partition.capacities.some((capacity) => capacity !== 3 && capacity !== 4)) {
    throw new SportsDomainError('INVALID_GROUP_CAPACITY', 'Every group capacity must be three or four.');
  }

  const sorted = sortSeedEntries(entries);
  const mutableGroups = partition.capacities.map((capacity, index) => ({
    groupId: `${groupIdPrefix}${index + 1}`,
    capacity,
    slots: [] as Array<{ entry: SeededEntry; slot: number }>,
  }));

  let cursor = 0;
  for (let row = 0; cursor < sorted.length; row += 1) {
    const indices = mutableGroups.map((_, index) => index);
    if (row % 2 === 1) indices.reverse();

    let placedInRow = 0;
    for (const groupIndex of indices) {
      if (cursor >= sorted.length) break;
      const group = mutableGroups[groupIndex];
      if (group.slots.length >= group.capacity) continue;
      group.slots.push({ entry: sorted[cursor], slot: group.slots.length + 1 });
      cursor += 1;
      placedInRow += 1;
    }
    if (placedInRow === 0) {
      throw new SportsDomainError('GROUP_DRAW_STALLED', 'Snake seeding could not place all entries.');
    }
  }

  return {
    groups: mutableGroups.map((group) => ({ ...group, slots: group.slots.map((slot) => ({ ...slot })) })),
    seedSnapshot: sorted.map((entry) => ({ ...entry })),
  };
}

export function swapGroupSlots(
  draw: GroupDraw,
  left: { groupId: string; slot: number },
  right: { groupId: string; slot: number },
): GroupDraw {
  if (left.groupId === right.groupId && left.slot === right.slot) return cloneDraw(draw);
  const groups: SeededGroup[] = draw.groups.map((group) => ({
    ...group,
    slots: group.slots.map((slot) => ({ ...slot, entry: { ...slot.entry } })),
  }));
  const leftGroup = groups.find((group) => group.groupId === left.groupId);
  const rightGroup = groups.find((group) => group.groupId === right.groupId);
  const leftSlot = leftGroup?.slots.find((slot) => slot.slot === left.slot);
  const rightSlot = rightGroup?.slots.find((slot) => slot.slot === right.slot);
  if (!leftSlot || !rightSlot) {
    throw new SportsDomainError('GROUP_SLOT_NOT_FOUND', 'Both group slots must exist before they can be swapped.', { left, right });
  }
  const leftEntry = leftSlot.entry;
  (leftSlot as { entry: SeededEntry }).entry = rightSlot.entry;
  (rightSlot as { entry: SeededEntry }).entry = leftEntry;
  return { groups, seedSnapshot: draw.seedSnapshot.map((entry) => ({ ...entry })) };
}

export function generateRoundRobinPairings(poolId: string, seededEntries: readonly SeededEntry[]): PoolPairing[] {
  if (seededEntries.length !== 3 && seededEntries.length !== 4) {
    throw new SportsDomainError('INVALID_ROUND_ROBIN_SIZE', 'LPVolley round-robin pools must contain three or four teams.', {
      size: seededEntries.length,
    });
  }
  ensureUniqueEntries(seededEntries);

  const entrants: Array<SeededEntry | null> = [...seededEntries];
  if (entrants.length % 2 === 1) entrants.push(null);
  const matches: PoolPairing[] = [];
  let rotation = [...entrants];

  for (let round = 1; round < entrants.length; round += 1) {
    let position = 1;
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const left = rotation[index];
      const right = rotation[rotation.length - 1 - index];
      if (left && right) {
        matches.push({
          matchId: `${poolId}-RR-R${round}-M${position}`,
          poolId,
          round,
          position,
          sourceA: entrySource(left),
          sourceB: entrySource(right),
        });
        position += 1;
      }
    }
    rotation = [rotation[0], rotation[rotation.length - 1], ...rotation.slice(1, -1)];
  }
  return matches;
}

export function generateModifiedPool4(poolId: string, seededEntries: readonly SeededEntry[]): PoolPairing[] {
  if (seededEntries.length !== 4) {
    throw new SportsDomainError('MODIFIED_POOL_REQUIRES_FOUR', 'Modified Pool 4 requires exactly four seeded entries.', {
      size: seededEntries.length,
    });
  }
  ensureUniqueEntries(seededEntries);
  const ordered = [...seededEntries].sort((left, right) => left.initialSeed - right.initialSeed);
  const first = `${poolId}-MP-R1-M1`;
  const second = `${poolId}-MP-R1-M2`;

  return [
    {
      matchId: first,
      poolId,
      round: 1,
      position: 1,
      sourceA: entrySource(ordered[0]),
      sourceB: entrySource(ordered[3]),
    },
    {
      matchId: second,
      poolId,
      round: 1,
      position: 2,
      sourceA: entrySource(ordered[1]),
      sourceB: entrySource(ordered[2]),
    },
    {
      matchId: `${poolId}-MP-R2-M1`,
      poolId,
      round: 2,
      position: 1,
      sourceA: { kind: 'MATCH_WINNER', matchId: first },
      sourceB: { kind: 'MATCH_WINNER', matchId: second },
      placementRange: [1, 2],
    },
    {
      matchId: `${poolId}-MP-R2-M2`,
      poolId,
      round: 2,
      position: 2,
      sourceA: { kind: 'MATCH_LOSER', matchId: first },
      sourceB: { kind: 'MATCH_LOSER', matchId: second },
      placementRange: [3, 4],
    },
  ];
}

function entrySource(entry: SeededEntry): SlotSource {
  return { kind: 'ENTRY', entryId: entry.entryId, initialSeed: entry.initialSeed };
}

function toTimestamp(value: SeedEntry['confirmedAt']): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return Date.parse(value);
}

function ensureUniqueEntries(entries: readonly SeededEntry[]): void {
  const ids = new Set(entries.map((entry) => entry.entryId));
  if (ids.size !== entries.length) {
    throw new SportsDomainError('DUPLICATE_ENTRY', 'Pool entries must be unique.');
  }
}

function cloneDraw(draw: GroupDraw): GroupDraw {
  return {
    groups: draw.groups.map((group) => ({
      ...group,
      slots: group.slots.map((slot) => ({ ...slot, entry: { ...slot.entry } })),
    })),
    seedSnapshot: draw.seedSnapshot.map((entry) => ({ ...entry })),
  };
}
