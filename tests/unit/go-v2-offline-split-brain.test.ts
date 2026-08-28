import { describe, expect, it } from 'vitest';

import {
  assessGoV2OfflineRebase,
  type GoV2QueuedCommand,
} from '../../web/lib/go-v2/client-offline';

function queued(
  kind: string,
  options: Partial<GoV2QueuedCommand> & { payload?: Record<string, unknown> } = {},
): GoV2QueuedCommand {
  const commandId = options.commandId ?? 'local-command-1';
  const expectedVersion = options.expectedVersion ?? 4;
  return {
    commandId,
    scopeKey: 'judge:tournament-1',
    endpoint: '/api/go-v2/judge/tournaments/tournament-1/commands',
    method: 'POST',
    expectedVersion,
    queuedAt: '2026-08-28T09:00:00.000Z',
    status: options.status ?? 'pending',
    envelope: {
      commandId,
      requestHash: 'a'.repeat(64),
      expectedVersion,
      deviceId: 'judge-device-1',
      command: {
        type: kind,
        matchId: 'match-1',
        payload: options.payload ?? {},
      },
    },
  };
}

describe('GO V2 explicit offline split-brain rebase', () => {
  it.each([
    ['match.start', 'ready'],
    ['match.pause', 'live'],
    ['match.resume', 'paused'],
  ] as const)('allows one unapplied %s intent against a compatible newer snapshot', (kind, playState) => {
    const command = queued(kind);
    expect(assessGoV2OfflineRebase(
      [command],
      command.commandId,
      { matchId: 'match-1', commandVersion: 7, playState },
    )).toEqual({
      safe: true,
      kind,
      matchId: 'match-1',
      expectedVersion: 7,
      payload: {},
    });
  });

  it.each(['score.replace', 'match.finish.request'])('fails closed for %s', (kind) => {
    const command = queued(kind, { payload: { liveScore: { points: { a: 10, b: 8 } } } });
    expect(assessGoV2OfflineRebase(
      [command],
      command.commandId,
      { matchId: 'match-1', commandVersion: 7, playState: 'live' },
    )).toMatchObject({ safe: false, code: 'SCORE_OR_RESULT_REBASE_FORBIDDEN' });
  });

  it('rejects dependent journals, stale snapshots and incompatible remote lifecycle state', () => {
    const start = queued('match.start');
    const second = queued('match.pause', { commandId: 'local-command-2', expectedVersion: 5 });
    expect(assessGoV2OfflineRebase(
      [start, second],
      start.commandId,
      { matchId: 'match-1', commandVersion: 7, playState: 'ready' },
    )).toMatchObject({ safe: false, code: 'REBASE_REQUIRES_SINGLE_PENDING_INTENT' });

    expect(assessGoV2OfflineRebase(
      [start],
      start.commandId,
      { matchId: 'match-1', commandVersion: 4, playState: 'ready' },
    )).toMatchObject({ safe: false, code: 'REMOTE_VERSION_NOT_NEWER' });

    expect(assessGoV2OfflineRebase(
      [start],
      start.commandId,
      { matchId: 'match-1', commandVersion: 7, playState: 'live' },
    )).toMatchObject({ safe: false, code: 'REMOTE_STATE_CHANGED' });
  });

  it('ignores already resolved history but rejects a signed envelope mismatch', () => {
    const discarded = queued('match.pause', { commandId: 'old-command', status: 'discarded' });
    const pending = queued('match.pause');
    const mismatched = {
      ...pending,
      envelope: { ...pending.envelope, expectedVersion: 99 },
    };
    expect(assessGoV2OfflineRebase(
      [discarded, mismatched],
      pending.commandId,
      { matchId: 'match-1', commandVersion: 7, playState: 'live' },
    )).toMatchObject({ safe: false, code: 'LOCAL_COMMAND_ENVELOPE_MISMATCH' });
  });
});
