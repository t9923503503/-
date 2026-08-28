import { describe, expect, it } from 'vitest';

import {
  goV2MatchRuleDurationMinutes,
  parseGoV2EffectiveFromRoundNo,
  resolveGoV2StageRuleScope,
} from '../../web/lib/go-v2/stage-rules';

const pending = (id: string, roundNo: number) => ({
  id,
  roundNo,
  playState: 'pending',
  scheduleState: 'scheduled',
  currentResultRevisionNo: 0,
  actualStart: null,
});

describe('GO V2 stage-rule scope', () => {
  it('keeps pool changes all-or-nothing before the first start', () => {
    expect(resolveGoV2StageRuleScope({
      stageType: 'round_robin_pool',
      requestedRoundNo: 1,
      matches: [pending('p1', 1), { ...pending('p2', 2), playState: 'ready' }],
    }).affectedMatchIds).toEqual(['p1', 'p2']);
    expect(() => resolveGoV2StageRuleScope({
      stageType: 'round_robin_pool',
      requestedRoundNo: 1,
      matches: [{ ...pending('p1', 1), playState: 'live' }],
    })).toThrow('immutable after the first match');
    expect(() => resolveGoV2StageRuleScope({
      stageType: 'modified_pool_4',
      requestedRoundNo: 2,
      matches: [pending('p1', 1)],
    })).toThrow('complete stage from round 1');
  });

  it('selects the nearest whole pending bracket round and every later round', () => {
    const matches = [
      { ...pending('r1a', 1), playState: 'final', currentResultRevisionNo: 1 },
      { ...pending('r2a', 2), playState: 'final', currentResultRevisionNo: 1 },
      { ...pending('r2b', 2), playState: 'pending' },
      pending('r3a', 3),
      pending('r4a', 4),
    ];
    const scope = resolveGoV2StageRuleScope({
      stageType: 'double_elimination',
      requestedRoundNo: 3,
      matches,
    });
    expect(scope).toEqual({
      effectiveFromRoundNo: 3,
      affectedMatchIds: ['r3a', 'r4a'],
      unaffectedMatchIds: ['r1a', 'r2a', 'r2b'],
    });
    expect(() => resolveGoV2StageRuleScope({
      stageType: 'double_elimination',
      requestedRoundNo: 4,
      matches,
    })).toThrow('nearest complete unstarted round');
  });

  it('rejects a later affected round that is already ready or started', () => {
    expect(() => resolveGoV2StageRuleScope({
      stageType: 'single_elimination',
      requestedRoundNo: 2,
      matches: [
        { ...pending('r1', 1), playState: 'final', currentResultRevisionNo: 1 },
        pending('r2', 2),
        { ...pending('r3', 3), playState: 'ready' },
      ],
    })).toThrow('later rounds must still be pending');
  });

  it('normalizes the round and maps rule presets to scheduler durations', () => {
    expect(parseGoV2EffectiveFromRoundNo('2')).toBe(2);
    expect(() => parseGoV2EffectiveFromRoundNo(0)).toThrow('positive integer');
    expect(goV2MatchRuleDurationMinutes({
      preset: 'single_21', setsToWin: 1, sets: [{ targetPoints: 21, winBy: 2, pointCap: null }],
    })).toBe(20);
    expect(goV2MatchRuleDurationMinutes({
      preset: 'best_of_3_15', setsToWin: 2, sets: [],
    })).toBe(40);
    expect(goV2MatchRuleDurationMinutes({
      preset: 'best_of_3_21_15', setsToWin: 2, sets: [],
    })).toBe(50);
  });
});
