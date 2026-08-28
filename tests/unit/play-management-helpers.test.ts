import { describe, expect, it } from 'vitest';
import type { PlayManagedPost } from '../../web/lib/play-service';
import {
  getNextWeeklyRepeatDate,
  normalizeGameComposition,
  selectRepeatGame,
} from '../../web/components/partner/PlayManagementClient';

type RepeatCandidate = Pick<PlayManagedPost, 'kind' | 'archivedAt' | 'status' | 'startsAt'> & { id: string };

function candidate(
  id: string,
  startsAt: string,
  overrides: Partial<RepeatCandidate> = {},
): RepeatCandidate {
  return {
    id,
    kind: 'game',
    archivedAt: null,
    status: 'completed',
    startsAt,
    ...overrides,
  };
}

describe('play management composition helpers', () => {
  it('keeps classic games live-compatible while allowing a larger rotating roster', () => {
    expect(normalizeGameComposition('2x2', 2, 2)).toEqual({ capacity: 4, minPlayers: 4 });
    expect(normalizeGameComposition('2x2', 9, 2)).toEqual({ capacity: 9, minPlayers: 4 });
  });

  it('locks Thai at eight and normalizes KING to an even 6–10 player roster', () => {
    expect(normalizeGameComposition('thai', 10, 4)).toEqual({ capacity: 8, minPlayers: 8 });
    expect(normalizeGameComposition('sideout', 5, 2)).toEqual({ capacity: 6, minPlayers: 6 });
    expect(normalizeGameComposition('sideout', 7, 6)).toEqual({ capacity: 8, minPlayers: 6 });
    expect(normalizeGameComposition('sideout', 8, 7)).toEqual({ capacity: 8, minPlayers: 8 });
    expect(normalizeGameComposition('sideout', 9, 12)).toEqual({ capacity: 10, minPlayers: 10 });
    expect(normalizeGameComposition('sideout', 20, 6)).toEqual({ capacity: 10, minPlayers: 6 });
  });
});

describe('play management repeat helpers', () => {
  it('advances an old start by whole weeks until it is in the future', () => {
    const next = getNextWeeklyRepeatDate('2026-08-01T20:00:00.000Z', new Date('2026-08-14T12:00:00.000Z'));
    expect(next.toISOString()).toBe('2026-08-15T20:00:00.000Z');
  });

  it('always creates the next weekly occurrence for an already future game', () => {
    const next = getNextWeeklyRepeatDate('2026-08-20T20:00:00.000Z', new Date('2026-08-14T12:00:00.000Z'));
    expect(next.toISOString()).toBe('2026-08-27T20:00:00.000Z');
  });

  it('chooses the most recent playable past game instead of the furthest future event', () => {
    const posts: RepeatCandidate[] = [
      candidate('far-future', '2026-10-01T20:00:00.000Z', { status: 'published' }),
      candidate('latest-past', '2026-08-10T20:00:00.000Z'),
      candidate('older-past', '2026-08-03T20:00:00.000Z'),
      candidate('training', '2026-08-13T20:00:00.000Z', { kind: 'training' }),
      candidate('cancelled', '2026-08-12T20:00:00.000Z', { status: 'cancelled' }),
    ];
    expect(selectRepeatGame(posts, new Date('2026-08-14T12:00:00.000Z'))?.id).toBe('latest-past');
  });

  it('uses the nearest upcoming game when there is no completed game', () => {
    const posts = [
      candidate('far', '2026-09-01T20:00:00.000Z', { status: 'published' }),
      candidate('near', '2026-08-16T20:00:00.000Z', { status: 'published' }),
    ];
    expect(selectRepeatGame(posts, new Date('2026-08-14T12:00:00.000Z'))?.id).toBe('near');
  });
});
