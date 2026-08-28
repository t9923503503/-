import type { NextRequest } from 'next/server';

import {
  requireApiRole,
  type AdminActor,
} from '../admin-auth';
import {
  GoV2Error,
  type GoV2AdminPermissions,
  type GoV2OperationKind,
} from './contracts';

/**
 * Pilot mapping: the existing global admin role is the only tournament
 * director authority. An operator is never promoted implicitly.
 */
const DIRECTOR_OPERATIONS = new Set<GoV2OperationKind>([
  'match.finish.accept',
  'match.finish.reject',
  'match.paper_import.preview',
  'match.paper_import.commit',
  'match.result.revise',
  'reserve.promotion.preview',
  'reserve.promotion.commit',
  'entry.withdrawal.commit',
  'attendance.reinstate.preview',
  'attendance.reinstate.commit',
  'incident.commit',
  'disruption.resolve.preview',
  'disruption.resolve.commit',
  'match.pause_resolution.preview',
  'match.pause_resolution.commit',
  'schedule.policy.preview',
  'schedule.policy.commit',
  'stage.rules.preview',
  'stage.rules.commit',
  'publication.preview',
  'publication.commit',
]);

export function goV2AdminPermissions(actor: AdminActor): GoV2AdminPermissions {
  const canOperate = actor.role === 'admin' || actor.role === 'operator';
  const canDirect = actor.role === 'admin';
  return {
    canView: true,
    canOperate,
    canDirect,
    canSecondApprove: canDirect,
    directorMapping: 'global_admin',
  };
}

export function requireGoV2Director(req: NextRequest) {
  return requireApiRole(req, 'admin');
}

export function assertGoV2OperationAuthority(
  operation: GoV2OperationKind,
  actor: Pick<AdminActor, 'id' | 'role'>,
): void {
  if (DIRECTOR_OPERATIONS.has(operation) && actor.role !== 'admin') {
    throw new GoV2Error(
      403,
      'TOURNAMENT_DIRECTOR_REQUIRED',
      'This operation requires the tournament director; during the pilot only a global admin is a director',
      { operation, actorId: actor.id, pilotDirectorRole: 'admin' },
    );
  }
}
