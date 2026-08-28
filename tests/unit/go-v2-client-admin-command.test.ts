import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { adminCommandRequestHash } from '../../web/lib/go-v2/client-admin-command';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

const tournamentId = '11111111-1111-4111-8111-111111111111';
const entryId = '22222222-2222-4222-8222-222222222222';
const courtId = '33333333-3333-4333-8333-333333333333';
const grantId = '44444444-4444-4444-8444-444444444444';
const matchId = '55555555-5555-4555-8555-555555555555';
const disruptionId = '66666666-6666-4666-8666-666666666666';
const stageId = '77777777-7777-4777-8777-777777777777';

function envelope(extra: Record<string, unknown> = {}) {
  return {
    commandId: 'command-0001',
    idempotencyKey: 'command-0001',
    expectedVersion: 7,
    deviceId: 'admin-web-device',
    reasonCode: 'admin_override',
    ...extra,
  };
}

describe('GO V2 browser admin command hash', () => {
  it('binds stage-rule preview and commit hashes to the route stage', async () => {
    const preview = envelope({
      effectiveFromRoundNo: 2,
      matchRule: { preset: 'single_21' },
    });
    await expect(adminCommandRequestHash(
      tournamentId,
      `/stages/${stageId}/rules/preview`,
      preview,
    )).resolves.toBe(digest({
      operation: 'stage.rules.preview',
      entityId: null,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'admin_override',
      reasonNote: null,
      previewId: null,
      inputHash: null,
      confirmRed: false,
      redApprovalId: null,
      payload: {
        stageId,
        effectiveFromRoundNo: 2,
        matchRule: { preset: 'single_21' },
      },
    }));

    const commit = envelope({ previewId: grantId, inputHash: 'f'.repeat(64) });
    await expect(adminCommandRequestHash(
      tournamentId,
      `/stages/${stageId}/rules/commit`,
      commit,
    )).resolves.toBe(digest({
      operation: 'stage.rules.commit',
      entityId: stageId,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'admin_override',
      reasonNote: null,
      previewId: grantId,
      inputHash: 'f'.repeat(64),
      confirmRed: false,
      redApprovalId: null,
      payload: {},
    }));
  });

  it('matches the server canonical operation envelope', async () => {
    const command = envelope({ poolMode: 'round_robin_pool', swaps: [] });
    await expect(adminCommandRequestHash(tournamentId, '/draw/preview', command)).resolves.toBe(digest({
      operation: 'draw.preview',
      entityId: null,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'admin_override',
      reasonNote: null,
      previewId: null,
      inputHash: null,
      confirmRed: false,
      redApprovalId: null,
      payload: { poolMode: 'round_robin_pool', swaps: [] },
    }));
  });

  it('includes route-injected preview IDs and entity-scoped commit IDs', async () => {
    const preview = envelope({ replacementPolicy: 'LPV_LOCAL_ONE_PLAYER' });
    await expect(adminCommandRequestHash(
      tournamentId,
      `/entries/${entryId}/replacement/preview`,
      preview,
    )).resolves.toBe(digest({
      operation: 'roster.replacement.preview',
      entityId: null,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'admin_override',
      reasonNote: null,
      previewId: null,
      inputHash: null,
      confirmRed: false,
      redApprovalId: null,
      payload: { entryId, replacementPolicy: 'LPV_LOCAL_ONE_PLAYER' },
    }));

    const commit = envelope({ previewId: grantId, inputHash: 'a'.repeat(64) });
    await expect(adminCommandRequestHash(
      tournamentId,
      `/entries/${entryId}/replacement/commit`,
      commit,
    )).resolves.toBe(digest({
      operation: 'roster.replacement.commit',
      entityId: entryId,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'admin_override',
      reasonNote: null,
      previewId: grantId,
      inputHash: 'a'.repeat(64),
      confirmRed: false,
      redApprovalId: null,
      payload: {},
    }));
  });

  it('binds reserve-promotion preview and commit hashes to the waitlist entry', async () => {
    const targetEntryId = '88888888-8888-4888-8888-888888888888';
    const preview = envelope({
      reasonCode: 'reserve_promoted',
      reasonNote: 'Reserve replaces the withdrawn locked slot',
      targetEntryId,
    });
    await expect(adminCommandRequestHash(
      tournamentId,
      `/reserves/${entryId}/promote/preview`,
      preview,
    )).resolves.toBe(digest({
      operation: 'reserve.promotion.preview',
      entityId: null,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'reserve_promoted',
      reasonNote: 'Reserve replaces the withdrawn locked slot',
      previewId: null,
      inputHash: null,
      confirmRed: false,
      redApprovalId: null,
      payload: { reserveEntryId: entryId, targetEntryId },
    }));

    const commit = envelope({
      reasonCode: 'reserve_promoted',
      reasonNote: 'Reserve replaces the withdrawn locked slot',
      previewId: grantId,
      inputHash: '8'.repeat(64),
      confirmRed: true,
      redApprovalId: courtId,
    });
    await expect(adminCommandRequestHash(
      tournamentId,
      `/reserves/${entryId}/promote/commit`,
      commit,
    )).resolves.toBe(digest({
      operation: 'reserve.promotion.commit',
      entityId: entryId,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'reserve_promoted',
      reasonNote: 'Reserve replaces the withdrawn locked slot',
      previewId: grantId,
      inputHash: '8'.repeat(64),
      confirmRed: true,
      redApprovalId: courtId,
      payload: {},
    }));
  });

  it('hashes draw unlock preview and its immutable commit separately', async () => {
    const preview = envelope({ reasonNote: 'Reseed before start', reseed: true });
    await expect(adminCommandRequestHash(tournamentId, '/draw/unlock/preview', preview)).resolves.toBe(digest({
      operation: 'draw.unlock.preview',
      entityId: null,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'admin_override',
      reasonNote: 'Reseed before start',
      previewId: null,
      inputHash: null,
      confirmRed: false,
      redApprovalId: null,
      payload: { reseed: true },
    }));

    const commit = envelope({
      reasonNote: 'Reseed before start',
      previewId: grantId,
      inputHash: 'd'.repeat(64),
    });
    await expect(adminCommandRequestHash(tournamentId, '/draw/unlock/commit', commit)).resolves.toBe(digest({
      operation: 'draw.unlock.commit',
      entityId: null,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'admin_override',
      reasonNote: 'Reseed before start',
      previewId: grantId,
      inputHash: 'd'.repeat(64),
      confirmRed: false,
      redApprovalId: null,
      payload: {},
    }));
  });

  it('matches the special court-grant and approval hash contracts', async () => {
    const grant = envelope({
      reasonNote: 'rotation',
      payload: { targetDeviceId: 'judge-web-device', ttlMinutes: 480 },
    });
    await expect(adminCommandRequestHash(
      tournamentId,
      `/courts/${courtId}/grants/${grantId}/rotate`,
      grant,
    )).resolves.toBe(digest({
      operation: 'court_grant.rotate',
      tournamentId,
      courtId,
      grantId,
      expectedVersion: 7,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      reasonCode: 'admin_override',
      reasonNote: 'rotation',
      payload: { targetDeviceId: 'judge-web-device', ttlMinutes: 480 },
    }));

    await expect(adminCommandRequestHash(
      tournamentId,
      `/approvals/${grantId}`,
      envelope({ payload: { reviewedInputHash: 'b'.repeat(64), reviewedAggregateVersion: 7 } }),
    )).resolves.toBe(digest({
      operation: 'red_operation.approve',
      tournamentId,
      previewId: grantId,
      reviewedInputHash: 'b'.repeat(64),
      reviewedAggregateVersion: 7,
      expectedVersion: 7,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      reasonCode: 'admin_override',
      reasonNote: null,
    }));
  });

  it('hashes director finish decisions as match-scoped commands', async () => {
    const command = envelope({
      reasonNote: 'Server score checked',
      finishRequestVersion: 12,
    });
    await expect(adminCommandRequestHash(
      tournamentId,
      `/matches/${matchId}/finish/accept`,
      command,
    )).resolves.toBe(digest({
      operation: 'match.finish.accept',
      entityId: matchId,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'admin_override',
      reasonNote: 'Server score checked',
      previewId: null,
      inputHash: null,
      confirmRed: false,
      redApprovalId: null,
      payload: { finishRequestVersion: 12 },
    }));
  });

  it('hashes disruption resolution and paused-match transfer preview/commit with route IDs', async () => {
    const resolvePreview = envelope({ resolution: 'resolved' });
    await expect(adminCommandRequestHash(
      tournamentId,
      `/schedule/disruptions/${disruptionId}/resolve/preview`,
      resolvePreview,
    )).resolves.toBe(digest({
      operation: 'disruption.resolve.preview',
      entityId: null,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'admin_override',
      reasonNote: null,
      previewId: null,
      inputHash: null,
      confirmRed: false,
      redApprovalId: null,
      payload: { disruptionId, resolution: 'resolved' },
    }));

    const pausePreview = envelope({
      decision: 'transfer',
      disruptionId,
      targetCourtId: courtId,
    });
    await expect(adminCommandRequestHash(
      tournamentId,
      `/matches/${matchId}/pause-resolution/preview`,
      pausePreview,
    )).resolves.toBe(digest({
      operation: 'match.pause_resolution.preview',
      entityId: null,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'admin_override',
      reasonNote: null,
      previewId: null,
      inputHash: null,
      confirmRed: false,
      redApprovalId: null,
      payload: { matchId, decision: 'transfer', disruptionId, targetCourtId: courtId },
    }));

    const pauseCommit = envelope({ previewId: grantId, inputHash: 'e'.repeat(64) });
    await expect(adminCommandRequestHash(
      tournamentId,
      `/matches/${matchId}/pause-resolution/commit`,
      pauseCommit,
    )).resolves.toBe(digest({
      operation: 'match.pause_resolution.commit',
      entityId: matchId,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'admin_override',
      reasonNote: null,
      previewId: grantId,
      inputHash: 'e'.repeat(64),
      confirmRed: false,
      redApprovalId: null,
      payload: {},
    }));
  });

  it('uses an explicit preview/commit envelope for paper protocol imports', async () => {
    const preview = envelope({
      reasonCode: 'paper_result_import',
      resultKind: 'played',
      actualStartedAt: '2026-08-28T04:00:00.000Z',
      actualEndedAt: '2026-08-28T04:20:00.000Z',
    });
    await expect(adminCommandRequestHash(
      tournamentId,
      `/matches/${matchId}/paper-import/preview`,
      preview,
    )).resolves.toBe(digest({
      operation: 'match.paper_import.preview',
      entityId: null,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'paper_result_import',
      reasonNote: null,
      previewId: null,
      inputHash: null,
      confirmRed: false,
      redApprovalId: null,
      payload: {
        matchId,
        resultKind: 'played',
        actualStartedAt: '2026-08-28T04:00:00.000Z',
        actualEndedAt: '2026-08-28T04:20:00.000Z',
      },
    }));

    const commit = envelope({
      reasonCode: 'paper_result_import',
      previewId: grantId,
      inputHash: 'f'.repeat(64),
    });
    await expect(adminCommandRequestHash(
      tournamentId,
      `/matches/${matchId}/paper-import/commit`,
      commit,
    )).resolves.toBe(digest({
      operation: 'match.paper_import.commit',
      entityId: matchId,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'paper_result_import',
      reasonNote: null,
      previewId: grantId,
      inputHash: 'f'.repeat(64),
      confirmRed: false,
      redApprovalId: null,
      payload: {},
    }));
  });

  it('fails closed for an unknown command route', async () => {
    await expect(adminCommandRequestHash(tournamentId, '/unknown', envelope()))
      .rejects.toThrow('Неизвестная V2-команда');
  });

  it('distinguishes initial schedule preview from its explicit commit', async () => {
    const preview = envelope({ timezone: 'Asia/Yekaterinburg' });
    await expect(adminCommandRequestHash(tournamentId, '/schedule/generate', preview)).resolves.toBe(digest({
      operation: 'schedule.generate.preview',
      entityId: null,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'admin_override',
      reasonNote: null,
      previewId: null,
      inputHash: null,
      confirmRed: false,
      redApprovalId: null,
      payload: { timezone: 'Asia/Yekaterinburg' },
    }));

    const commit = envelope({ previewId: grantId, inputHash: 'c'.repeat(64) });
    await expect(adminCommandRequestHash(tournamentId, '/schedule/commit', commit)).resolves.toBe(digest({
      operation: 'schedule.generate.commit',
      entityId: null,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'admin_override',
      reasonNote: null,
      previewId: grantId,
      inputHash: 'c'.repeat(64),
      confirmRed: false,
      redApprovalId: null,
      payload: {},
    }));
  });

  it('hashes director court-policy preview and immutable commit independently', async () => {
    const preview = envelope({
      tier: 'light',
      allowedCourtIds: [courtId],
      effectiveFrom: '2026-08-28T06:00:00.000Z',
      effectiveUntil: '2026-08-28T08:00:00.000Z',
    });
    await expect(adminCommandRequestHash(tournamentId, '/schedule/policy/preview', preview)).resolves.toBe(digest({
      operation: 'schedule.policy.preview',
      entityId: null,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'admin_override',
      reasonNote: null,
      previewId: null,
      inputHash: null,
      confirmRed: false,
      redApprovalId: null,
      payload: {
        tier: 'light',
        allowedCourtIds: [courtId],
        effectiveFrom: '2026-08-28T06:00:00.000Z',
        effectiveUntil: '2026-08-28T08:00:00.000Z',
      },
    }));

    const commit = envelope({ previewId: grantId, inputHash: '9'.repeat(64) });
    await expect(adminCommandRequestHash(tournamentId, '/schedule/policy/commit', commit)).resolves.toBe(digest({
      operation: 'schedule.policy.commit',
      entityId: null,
      commandId: 'command-0001',
      deviceId: 'admin-web-device',
      expectedVersion: 7,
      reasonCode: 'admin_override',
      reasonNote: null,
      previewId: grantId,
      inputHash: '9'.repeat(64),
      confirmRed: false,
      redApprovalId: null,
      payload: {},
    }));
  });
});
