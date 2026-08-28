import type { MatchRule } from './core';
import { GoV2Error } from './contracts';

export interface GoV2StageRuleMatchState {
  id: string;
  roundNo: number;
  playState: string;
  scheduleState: string;
  currentResultRevisionNo: number;
  actualStart: string | null;
}

export interface GoV2StageRuleScope {
  effectiveFromRoundNo: number;
  affectedMatchIds: string[];
  unaffectedMatchIds: string[];
}

export function parseGoV2EffectiveFromRoundNo(value: unknown): number {
  const roundNo = Number(value);
  if (!Number.isSafeInteger(roundNo) || roundNo < 1) {
    throw new GoV2Error(
      422,
      'INVALID_EFFECTIVE_ROUND',
      'effectiveFromRoundNo must be a positive integer',
    );
  }
  return roundNo;
}

export function goV2MatchRuleDurationMinutes(rule: MatchRule): number {
  if (rule.preset === 'best_of_3_15') return 40;
  if (rule.preset === 'best_of_3_21_15') return 50;
  return 20;
}

function hasStarted(match: GoV2StageRuleMatchState): boolean {
  return ['live', 'paused', 'final', 'voided'].includes(match.playState)
    || match.currentResultRevisionNo > 0
    || match.actualStart !== null;
}

function fullRoundIsUnstarted(matches: readonly GoV2StageRuleMatchState[]): boolean {
  return matches.length > 0 && matches.every((match) => (
    match.playState === 'pending'
    && match.currentResultRevisionNo === 0
    && match.actualStart === null
  ));
}

/**
 * Resolves the only legal immutable scope for a stage rule change.
 * Pool stages are all-or-nothing before their first start. Bracket stages use
 * the nearest whole pending round; a director cannot skip ahead to cherry-pick
 * a later round or shorten a round that is already ready/started/resulted.
 */
export function resolveGoV2StageRuleScope(input: {
  stageType: string;
  requestedRoundNo: number;
  matches: readonly GoV2StageRuleMatchState[];
}): GoV2StageRuleScope {
  if (input.matches.length === 0) {
    throw new GoV2Error(409, 'STAGE_RULE_SCOPE_EMPTY', 'The stage has no materialized matches');
  }
  const isPool = input.stageType === 'round_robin_pool' || input.stageType === 'modified_pool_4';
  if (isPool) {
    const started = input.matches.filter(hasStarted);
    if (started.length > 0) {
      throw new GoV2Error(
        409,
        'POOL_RULES_ALREADY_STARTED',
        'Pool rules are immutable after the first match starts or receives a result',
        { matchIds: started.map((match) => match.id).sort() },
      );
    }
    if (input.requestedRoundNo !== 1) {
      throw new GoV2Error(
        422,
        'POOL_RULES_REQUIRE_ROUND_ONE',
        'A pool rule change must apply to the complete stage from round 1',
      );
    }
    return {
      effectiveFromRoundNo: 1,
      affectedMatchIds: input.matches.map((match) => match.id).sort(),
      unaffectedMatchIds: [],
    };
  }

  if (!['single_elimination', 'double_elimination', 'placement_match'].includes(input.stageType)) {
    throw new GoV2Error(
      422,
      'STAGE_RULE_TYPE_UNSUPPORTED',
      `Rules cannot be revised for stage type ${input.stageType}`,
    );
  }
  const byRound = new Map<number, GoV2StageRuleMatchState[]>();
  for (const match of input.matches) {
    byRound.set(match.roundNo, [...(byRound.get(match.roundNo) ?? []), match]);
  }
  const nearestFullUnstartedRound = [...byRound.entries()]
    .sort(([left], [right]) => left - right)
    .find(([, matches]) => fullRoundIsUnstarted(matches))?.[0];
  if (nearestFullUnstartedRound === undefined) {
    throw new GoV2Error(
      409,
      'NO_FULL_UNSTARTED_ROUND',
      'No complete unstarted round remains in this stage',
    );
  }
  if (input.requestedRoundNo !== nearestFullUnstartedRound) {
    throw new GoV2Error(
      409,
      'EFFECTIVE_ROUND_NOT_NEAREST',
      'The new rule must start with the nearest complete unstarted round',
      {
        requestedRoundNo: input.requestedRoundNo,
        nearestFullUnstartedRound,
      },
    );
  }
  const affected = input.matches.filter((match) => match.roundNo >= nearestFullUnstartedRound);
  const blocked = affected.filter((match) => !fullRoundIsUnstarted([match]));
  if (blocked.length > 0) {
    throw new GoV2Error(
      409,
      'STAGE_RULE_FUTURE_ROUND_STARTED',
      'Every match in the effective round and later rounds must still be pending and unstarted',
      {
        matchIds: blocked.map((match) => match.id).sort(),
        states: blocked.map((match) => ({
          matchId: match.id,
          playState: match.playState,
          scheduleState: match.scheduleState,
          currentResultRevisionNo: match.currentResultRevisionNo,
          actualStart: match.actualStart,
        })),
      },
    );
  }
  const affectedIds = new Set(affected.map((match) => match.id));
  return {
    effectiveFromRoundNo: nearestFullUnstartedRound,
    affectedMatchIds: [...affectedIds].sort(),
    unaffectedMatchIds: input.matches
      .map((match) => match.id)
      .filter((matchId) => !affectedIds.has(matchId))
      .sort(),
  };
}
