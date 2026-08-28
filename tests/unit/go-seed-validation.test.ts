import { describe, expect, it } from 'vitest';
import { validateGoSeedDraft } from '../../web/lib/go-next/seed-validation';

const baseDraft = {
  hard: [{ teamId: 'a' }, { teamId: 'b' }, { teamId: 'c' }, { teamId: 'd' }],
  lite: [{ teamId: 'e' }, { teamId: 'f' }],
};

describe('GO manual playoff seed validation', () => {
  it('accepts deterministic swaps while preserving every league quota', () => {
    expect(validateGoSeedDraft({
      hard: [{ teamId: 'd' }, { teamId: 'b' }, { teamId: 'c' }, { teamId: 'a' }],
      lite: [{ teamId: 'f' }, { teamId: 'e' }],
    }, baseDraft, ['hard', 'lite'])).toEqual({
      ok: true,
      value: { hard: ['d', 'b', 'c', 'a'], lite: ['f', 'e'] },
    });
  });

  it.each([
    [{ hard: [{ teamId: 'a' }, { teamId: 'b' }, { teamId: 'c' }], lite: [{ teamId: 'e' }, { teamId: 'f' }] }, 'quota mismatch'],
    [{ hard: [{ teamId: 'a' }, { teamId: 'a' }, { teamId: 'c' }, { teamId: 'd' }], lite: [{ teamId: 'e' }, { teamId: 'f' }] }, 'duplicate team'],
    [{ hard: [{ teamId: 'a' }, { teamId: 'b' }, { teamId: 'c' }, { teamId: 'unknown' }], lite: [{ teamId: 'e' }, { teamId: 'f' }] }, 'unknown or ineligible'],
    [{ hard: [{ teamId: 'a' }, { teamId: 'e' }, { teamId: 'c' }, { teamId: 'd' }], lite: [{ teamId: 'b' }, { teamId: 'f' }] }, 'expected lite'],
    [{ hard: [{ teamId: 'a' }, { teamId: 'b' }, { teamId: 'c' }, { teamId: 'd' }], medium: [], lite: [{ teamId: 'e' }, { teamId: 'f' }] }, 'unsupported league'],
  ])('rejects malformed drafts: %s', (draft, errorPart) => {
    const result = validateGoSeedDraft(draft, baseDraft, ['hard', 'lite']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(errorPart);
  });
});
