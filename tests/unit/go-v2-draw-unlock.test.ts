import { describe, expect, it } from 'vitest';

import { GoV2Error } from '../../web/lib/go-v2/contracts';
import {
  parseGoV2DrawUnlockReseed,
  planGoV2DrawUnlockSeeds,
} from '../../web/lib/go-v2/repository';

const entries = [
  { entryId: 'c', initialSeed: 7, ratingSnapshotValue: 500, confirmedAt: '2026-08-01T09:00:00.000Z' },
  { entryId: 'a', initialSeed: 2, ratingSnapshotValue: 800, confirmedAt: '2026-08-01T09:01:00.000Z' },
  { entryId: 'b', initialSeed: 4, ratingSnapshotValue: 800, confirmedAt: '2026-08-01T09:00:00.000Z' },
  { entryId: 'd', initialSeed: 9, ratingSnapshotValue: 800, confirmedAt: '2026-08-01T09:00:00.000Z' },
];

describe('GO V2 draw unlock seed planning', () => {
  it('defaults reseed to false but rejects ambiguous wire values', () => {
    expect(parseGoV2DrawUnlockReseed(undefined)).toBe(false);
    expect(parseGoV2DrawUnlockReseed(false)).toBe(false);
    expect(parseGoV2DrawUnlockReseed(true)).toBe(true);
    expect(() => parseGoV2DrawUnlockReseed('true')).toThrowError(GoV2Error);
    expect(() => parseGoV2DrawUnlockReseed(1)).toThrowError(GoV2Error);
  });

  it('preserves existing seed numbers, including intentional gaps', () => {
    expect(planGoV2DrawUnlockSeeds(entries, false)).toEqual([
      { entryId: 'a', seed: 2 },
      { entryId: 'b', seed: 4 },
      { entryId: 'c', seed: 7 },
      { entryId: 'd', seed: 9 },
    ]);
  });

  it('reseeds by rating, confirmation time and stable entry id', () => {
    expect(planGoV2DrawUnlockSeeds(entries, true)).toEqual([
      { entryId: 'b', seed: 1 },
      { entryId: 'd', seed: 2 },
      { entryId: 'a', seed: 3 },
      { entryId: 'c', seed: 4 },
    ]);
  });

  it('fails closed on duplicate preserved seeds or invalid timestamps', () => {
    expect(() => planGoV2DrawUnlockSeeds([
      ...entries,
      { entryId: 'e', initialSeed: 2, ratingSnapshotValue: 1, confirmedAt: '2026-08-01T10:00:00.000Z' },
    ], false)).toThrowError(GoV2Error);
    expect(() => planGoV2DrawUnlockSeeds([
      { entryId: 'x', initialSeed: 1, ratingSnapshotValue: 1, confirmedAt: 'invalid' },
    ], true)).toThrowError(GoV2Error);
  });
});
