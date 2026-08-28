import { describe, expect, it } from 'vitest';

import {
  assertGoV2OperationAuthority,
  goV2AdminPermissions,
} from '../../web/lib/go-v2/authorization';

describe('GO V2 pilot director authority', () => {
  it('maps only global admin to director and second approver', () => {
    expect(goV2AdminPermissions({ id: 'admin', role: 'admin' })).toMatchObject({
      canOperate: true,
      canDirect: true,
      canSecondApprove: true,
      directorMapping: 'global_admin',
    });
    expect(goV2AdminPermissions({ id: 'operator', role: 'operator' })).toMatchObject({
      canOperate: true,
      canDirect: false,
      canSecondApprove: false,
    });
  });

  it('allows operator hold creation but rejects director-only resolution/result commands', () => {
    const operator = { id: 'operator', role: 'operator' as const };
    expect(() => assertGoV2OperationAuthority('disruption.commit', operator)).not.toThrow();
    for (const operation of [
      'disruption.resolve.commit',
      'match.pause_resolution.commit',
      'match.paper_import.preview',
      'match.paper_import.commit',
      'match.result.revise',
      'match.finish.accept',
      'entry.withdrawal.commit',
      'incident.commit',
      'schedule.policy.preview',
      'schedule.policy.commit',
      'stage.rules.preview',
      'stage.rules.commit',
    ] as const) {
      expect(() => assertGoV2OperationAuthority(operation, operator))
        .toThrowError(expect.objectContaining({ code: 'TOURNAMENT_DIRECTOR_REQUIRED' }));
    }
  });
});
