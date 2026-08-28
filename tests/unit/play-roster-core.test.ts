import { describe, expect, it } from 'vitest';
import {
  PLAY_ROSTER_BULK_LIMIT,
  normalizePlayRosterBulkItems,
} from '../../web/lib/play-roster-core';

describe('atomic play roster batch normalization', () => {
  it('normalizes invite, add and guest items while preserving indexes', () => {
    const result = normalizePlayRosterBulkItems([
      { action: 'invite', userId: '41' },
      { action: 'add', playerId: '11111111-1111-4111-8111-111111111111' },
      { action: 'guest', guestName: '  Иван   Петров  ' },
    ]);

    expect(result.issues).toEqual([]);
    expect(result.items).toEqual([
      { index: 0, action: 'invite', userId: 41, playerId: null, guestName: null },
      {
        index: 1,
        action: 'add',
        userId: null,
        playerId: '11111111-1111-4111-8111-111111111111',
        guestName: null,
      },
      { index: 2, action: 'guest', userId: null, playerId: null, guestName: 'Иван Петров' },
    ]);
  });

  it('rejects malformed identities and duplicate people before any write', () => {
    const result = normalizePlayRosterBulkItems([
      { action: 'invite', userId: 7 },
      { action: 'add', userId: 7 },
      { action: 'guest', guestName: 'A' },
      { action: 'remove', userId: 8 },
    ]);

    expect(result.items).toHaveLength(1);
    expect(result.issues.map((issue) => issue.index)).toEqual([1, 2, 3]);
  });

  it('requires a non-empty bounded batch', () => {
    expect(normalizePlayRosterBulkItems([]).issues[0]?.index).toBe(-1);
    expect(normalizePlayRosterBulkItems(
      Array.from({ length: PLAY_ROSTER_BULK_LIMIT + 1 }, (_, index) => ({ action: 'invite', userId: index + 1 })),
    ).issues[0]?.index).toBe(-1);
  });
});
