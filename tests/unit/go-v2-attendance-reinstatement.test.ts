import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  attendanceReinstatementRisk,
  parseGoV2AttendanceReinstatementDecision,
  parseGoV2AttendanceReinstatementTarget,
} from '../../web/lib/go-v2/attendance-reinstatement';
import { assertGoV2OperationAuthority } from '../../web/lib/go-v2/authorization';
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
const previewId = '33333333-3333-4333-8333-333333333333';

describe('GO V2 attendance reinstatement policy', () => {
  it('treats overturning a final awarded trigger with no descendants as red', () => {
    expect(attendanceReinstatementRisk({
      decision: 'overturn_and_cascade',
      affectedMatches: [],
    })).toBe('red');
  });

  it('keeps an overturn red when a ready descendant is present', () => {
    expect(attendanceReinstatementRisk({
      decision: 'overturn_and_cascade',
      affectedMatches: [{ playState: 'ready', scheduleState: 'published' }],
    })).toBe('red');
  });

  it('keeps prior awarded results immutable at amber risk', () => {
    expect(attendanceReinstatementRisk({
      decision: 'keep_awarded_result',
      affectedMatches: [{ playState: 'final', scheduleState: 'completed' }],
    })).toBe('amber');
  });

  it('requires an explicit supported decision and safe target state', () => {
    expect(() => parseGoV2AttendanceReinstatementDecision(undefined)).toThrowError(
      expect.objectContaining({ code: 'ATTENDANCE_REINSTATEMENT_DECISION_REQUIRED' }),
    );
    expect(parseGoV2AttendanceReinstatementDecision('keep_awarded_result'))
      .toBe('keep_awarded_result');
    expect(parseGoV2AttendanceReinstatementTarget(undefined)).toBe('checked_in');
    expect(() => parseGoV2AttendanceReinstatementTarget('confirmed')).toThrowError(
      expect.objectContaining({ code: 'ATTENDANCE_REINSTATEMENT_TARGET_INVALID' }),
    );
  });

  it('is director-only in both preview and commit', () => {
    expect(() => assertGoV2OperationAuthority(
      'attendance.reinstate.preview',
      { id: 'operator-1', role: 'operator' },
    )).toThrowError(expect.objectContaining({ code: 'TOURNAMENT_DIRECTOR_REQUIRED' }));
    expect(() => assertGoV2OperationAuthority(
      'attendance.reinstate.commit',
      { id: 'operator-1', role: 'operator' },
    )).toThrowError(expect.objectContaining({ code: 'TOURNAMENT_DIRECTOR_REQUIRED' }));
    expect(() => assertGoV2OperationAuthority(
      'attendance.reinstate.commit',
      { id: 'director-1', role: 'admin' },
    )).not.toThrow();
  });
});

describe('GO V2 attendance reinstatement client command hash', () => {
  it('binds preview input to the dedicated director operation', async () => {
    const command = {
      commandId: 'attendance-reinstate-preview-1',
      idempotencyKey: 'attendance-reinstate-preview-1',
      expectedVersion: 8,
      deviceId: 'admin-web-device',
      reasonCode: 'attendance_reinstated',
      entryId,
      decision: 'keep_awarded_result',
      toState: 'checked_in',
    };

    await expect(adminCommandRequestHash(
      tournamentId,
      '/attendance/reinstate/preview',
      command,
    )).resolves.toBe(digest({
      operation: 'attendance.reinstate.preview',
      entityId: null,
      commandId: 'attendance-reinstate-preview-1',
      deviceId: 'admin-web-device',
      expectedVersion: 8,
      reasonCode: 'attendance_reinstated',
      reasonNote: null,
      previewId: null,
      inputHash: null,
      confirmRed: false,
      redApprovalId: null,
      payload: {
        entryId,
        decision: 'keep_awarded_result',
        toState: 'checked_in',
      },
    }));
  });

  it('binds a red commit to its frozen preview and second approval', async () => {
    const command = {
      commandId: 'attendance-reinstate-commit-1',
      idempotencyKey: 'attendance-reinstate-commit-1',
      expectedVersion: 8,
      deviceId: 'admin-web-device',
      reasonCode: 'attendance_reinstated',
      previewId,
      inputHash: 'a'.repeat(64),
      confirmRed: true,
      redApprovalId: '44444444-4444-4444-8444-444444444444',
    };

    await expect(adminCommandRequestHash(
      tournamentId,
      '/attendance/reinstate/commit',
      command,
    )).resolves.toBe(digest({
      operation: 'attendance.reinstate.commit',
      entityId: null,
      commandId: 'attendance-reinstate-commit-1',
      deviceId: 'admin-web-device',
      expectedVersion: 8,
      reasonCode: 'attendance_reinstated',
      reasonNote: null,
      previewId,
      inputHash: 'a'.repeat(64),
      confirmRed: true,
      redApprovalId: '44444444-4444-4444-8444-444444444444',
      payload: {},
    }));
  });
});
