import { createHash, webcrypto } from 'node:crypto';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { canonicalJson, canonicalSha256Hex } from '../../web/lib/go-v2/client-command-hash';
import {
  buildGoV2JudgeCommandEnvelope,
  classifyGoV2JudgeHttpStatus,
  normalizeGoV2JudgeMatchRule,
  sendGoV2JudgeCommandWithRetry,
  validateGoV2JudgeFinish,
  validateGoV2JudgeSetClose,
} from '../../web/lib/go-v2/judge-client';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  }
});

const tournamentId = '11111111-1111-4111-8111-111111111111';
const matchId = '22222222-2222-4222-8222-222222222222';

describe('GO V2 judge command envelope', () => {
  it('declares reasonCode and computes the exact server-compatible canonical hash', async () => {
    const envelope = await buildGoV2JudgeCommandEnvelope({
      tournamentId: tournamentId.toUpperCase(),
      commandId: 'judge-command-0001',
      expectedVersion: 4,
      deviceId: 'judge-device-1',
      kind: 'score.replace',
      matchId: matchId.toUpperCase(),
      payload: { liveScore: { points: { b: 7, a: 9 }, sets: [] } },
    });
    const serverShape = {
      tournamentId,
      commandId: 'judge-command-0001',
      expectedVersion: 4,
      deviceId: 'judge-device-1',
      kind: 'score.replace',
      matchId,
      payload: { liveScore: { points: { b: 7, a: 9 }, sets: [] } },
      reasonCode: 'judge_score_entry',
    };
    const expected = createHash('sha256').update(canonicalJson(serverShape)).digest('hex');

    expect(envelope.reasonCode).toBe('judge_score_entry');
    expect(envelope.requestHash).toBe(expected);
    expect(envelope.command.matchId).toBe(matchId);
  });

  it('retries transport and successful-response parse loss with the identical serialized command', async () => {
    const envelope = await buildGoV2JudgeCommandEnvelope({
      tournamentId,
      commandId: 'judge-command-0002',
      expectedVersion: 0,
      deviceId: 'judge-device-1',
      kind: 'match.start',
      matchId,
    });
    const receipt = {
      accepted: true,
      commandId: envelope.commandId,
      requestHash: envelope.requestHash,
      resultingVersion: 1,
      matchId,
      playState: 'live',
    };
    const transportRetry = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('response lost'))
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt), { status: 200 }));
    await expect(sendGoV2JudgeCommandWithRetry({
      endpoint: '/judge/commands', token: 'token', envelope, fetchImpl: transportRetry, timeoutMs: 100,
    })).resolves.toMatchObject({ payload: receipt });
    expect(transportRetry).toHaveBeenCalledTimes(2);
    expect(transportRetry.mock.calls[0][1]?.body).toBe(transportRetry.mock.calls[1][1]?.body);

    const parseRetry = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{broken', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...receipt, replayed: true }), { status: 200 }));
    await expect(sendGoV2JudgeCommandWithRetry({
      endpoint: '/judge/commands', token: 'token', envelope, fetchImpl: parseRetry, timeoutMs: 100,
    })).resolves.toMatchObject({ payload: { replayed: true } });
    expect(parseRetry.mock.calls[0][1]?.body).toBe(parseRetry.mock.calls[1][1]?.body);
  });

  it('classifies authorization, split-brain, validation and retryable responses separately', () => {
    expect(classifyGoV2JudgeHttpStatus(401)).toBe('authorization');
    expect(classifyGoV2JudgeHttpStatus(403)).toBe('authorization');
    expect(classifyGoV2JudgeHttpStatus(409)).toBe('conflict');
    expect(classifyGoV2JudgeHttpStatus(422)).toBe('rejected');
    expect(classifyGoV2JudgeHttpStatus(500)).toBe('retryable');
  });

  it('fails closed instead of hashing non-finite JSON numbers as null', async () => {
    expect(() => canonicalJson({ points: Number.NaN })).toThrow(/NaN или Infinity/);
    await expect(canonicalSha256Hex({ points: Number.POSITIVE_INFINITY })).rejects.toThrow(/NaN или Infinity/);
  });
});

describe('GO V2 judge match-rule validation', () => {
  it('validates single_21 and win-by-two before closing and finishing', () => {
    const rule = normalizeGoV2JudgeMatchRule({ preset: 'single_21' });
    expect(validateGoV2JudgeSetClose({ currentSet: 1, points: { a: 21, b: 20 }, sets: [] }, rule).ok).toBe(false);
    expect(validateGoV2JudgeSetClose({ currentSet: 1, points: { a: 22, b: 20 }, sets: [] }, rule).ok).toBe(true);
    expect(validateGoV2JudgeFinish({ currentSet: 2, points: { a: 0, b: 0 }, sets: [{ a: 22, b: 20 }] }, rule).ok).toBe(true);
  });

  it('uses all-15 best of three and honors a configured point cap', () => {
    const rule = normalizeGoV2JudgeMatchRule({
      preset: 'best_of_3_15',
      setsToWin: 2,
      sets: [0, 1, 2].map(() => ({ targetPoints: 15, winBy: 2, pointCap: 21 })),
    });
    expect(validateGoV2JudgeSetClose({ currentSet: 1, points: { a: 21, b: 20 }, sets: [] }, rule).ok).toBe(true);
    expect(validateGoV2JudgeFinish({ currentSet: 3, points: { a: 0, b: 0 }, sets: [{ a: 21, b: 20 }, { a: 15, b: 9 }] }, rule).ok).toBe(true);
    expect(validateGoV2JudgeFinish({ currentSet: 2, points: { a: 0, b: 0 }, sets: [{ a: 21, b: 20 }] }, rule).ok).toBe(false);
  });

  it('uses a 15-point deciding set for best_of_3_21_15', () => {
    const rule = normalizeGoV2JudgeMatchRule({ preset: 'best_of_3_21_15' });
    const tied = [{ a: 21, b: 12 }, { a: 18, b: 21 }];
    expect(validateGoV2JudgeSetClose({ currentSet: 3, points: { a: 15, b: 14 }, sets: tied }, rule).ok).toBe(false);
    expect(validateGoV2JudgeSetClose({ currentSet: 3, points: { a: 16, b: 14 }, sets: tied }, rule).ok).toBe(true);
  });
});
