import { describe, expect, it } from 'vitest';
import {
  normalizePlayPostInput,
  validatePlayPostInput,
  validatePlayResultConfig,
  validatePlayResultApproval,
} from '../../web/lib/play-core';

describe('ordinary game lifecycle', () => {
  it('defaults games to rated and trainings to friendly', () => {
    expect(normalizePlayPostInput({ kind: 'game' }).ratingMode).toBe('rated');
    expect(normalizePlayPostInput({ kind: 'training' }).ratingMode).toBe('friendly');
  });

  it('normalizes management aliases into the canonical result contract', () => {
    const input = normalizePlayPostInput({
      kind: 'game',
      ratingMode: 'friendly',
      resultFormat: 'fixed_pairs',
      resultEntryMode: 'quick',
      resultConfig: { targetScore: 21, decidingSetTargetScore: 15 },
    });
    expect(input).toMatchObject({
      ratingMode: 'friendly',
      resultFormat: 'classic_2x2',
      resultEntryMode: 'after_game',
      resultConfig: { pointLimit: 21, decidingPointLimit: 15 },
    });
  });

  it('locks KING to 15 points at the server boundary', () => {
    const input = normalizePlayPostInput({
      kind: 'game',
      resultFormat: 'king_sideout',
      resultConfig: { pointLimit: 11, pairingMode: 'random', roundDurationMinutes: 10 },
    });
    expect(input.resultConfig.pointLimit).toBe(15);
    expect(validatePlayResultConfig('king_sideout', {
      pointLimit: 11,
      pairingMode: 'random',
      roundDurationMinutes: 10,
    })).toBe('KING проводится до 15 очков');
  });

  it('blocks rated approval until every confirmed player has an account', () => {
    expect(validatePlayResultApproval({
      ratingMode: 'rated',
      confirmedCount: 4,
      registeredCount: 3,
      hasStructuredPayload: true,
    })).toContain('аккаунт');
    expect(validatePlayResultApproval({
      ratingMode: 'rated',
      confirmedCount: 4,
      registeredCount: 4,
      hasStructuredPayload: true,
    })).toBeNull();
  });

  it('allows mixed rosters for friendly results without rating requirements', () => {
    expect(validatePlayResultApproval({
      ratingMode: 'friendly',
      confirmedCount: 4,
      registeredCount: 2,
      hasStructuredPayload: false,
    })).toBeNull();
  });

  it('validates structured result configuration on the server boundary', () => {
    expect(validatePlayResultConfig('classic_2x2', {
      pointLimit: 21,
      decidingPointLimit: 15,
      pairingMode: 'fixed',
      bestOf: 3,
    })).toBeNull();
    expect(validatePlayResultConfig('classic_2x2', {
      pointLimit: 17,
      decidingPointLimit: 15,
      pairingMode: 'fixed',
      bestOf: 3,
    })).not.toBeNull();
    expect(validatePlayResultConfig('thai_8', {
      pointLimit: 15,
      pairingMode: 'random',
      tourCount: 0,
    })).not.toBeNull();

    const invalidPost = normalizePlayPostInput({
      kind: 'game',
      ratingMode: 'friendly',
      resultFormat: 'king',
      resultConfig: { targetScore: 15, roundDurationMinutes: 0 },
    });
    expect(validatePlayPostInput({
      ...invalidPost,
      venueId: '11111111-1111-4111-8111-111111111111',
      title: 'KING',
      startsAt: '2026-08-12T10:00:00.000Z',
      endsAt: '2026-08-12T12:00:00.000Z',
      capacity: 8,
    })).not.toBeNull();
  });
});
