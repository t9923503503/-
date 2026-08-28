import { describe, expect, it } from 'vitest';

import {
  analyzeMinimumGamesGuarantee,
  assertMinimumGamesTarget,
  LPV_CLASSIFICATION_STRATEGY_V1,
} from '@/lib/go-v2/core';

describe('LPVolley V2 minimum-games guarantees', () => {
  it('proves the default three-game floor for mixed RR groups followed by SE', () => {
    const result = assertMinimumGamesTarget({
      teamCount: 22,
      groupStage: { format: 'round_robin_pool', groupSizes: [4, 4, 4, 4, 3, 3] },
      playoff: { format: 'single_elimination', bracketSizes: [12, 10] },
      minimumGamesTarget: 3,
    });
    expect(result).toMatchObject({
      groupStageMinimum: 2,
      playoffMinimum: 1,
      totalMinimum: 3,
      meetsTarget: true,
    });
  });

  it('counts Modified Pool and reset-enabled DE as two games each', () => {
    expect(analyzeMinimumGamesGuarantee({
      teamCount: 8,
      groupStage: { format: 'modified_pool_4', groupSizes: [4, 4] },
      playoff: { format: 'double_elimination', bracketSizes: [4, 4], resetFinal: true },
      minimumGamesTarget: 4,
    })).toMatchObject({ totalMinimum: 4, meetsTarget: true, diagnostics: [] });
  });

  it('separates the DE two-game floor from the no-reset two-loss integrity warning', () => {
    expect(() => assertMinimumGamesTarget({
      teamCount: 5,
      playoff: { format: 'single_elimination' },
      minimumGamesTarget: 2,
    })).toThrowError(expect.objectContaining({ code: 'MINIMUM_GAMES_TARGET_UNSATISFIED' }));

    const noReset = analyzeMinimumGamesGuarantee({
      teamCount: 8,
      playoff: { format: 'double_elimination', resetFinal: false },
      minimumGamesTarget: 2,
    });
    expect(noReset).toMatchObject({ totalMinimum: 2, meetsTarget: true });
    expect(noReset.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'NOT_TRUE_TWO_LOSS_ELIMINATION' }),
    ]));
  });

  it('uses only the group floor when not every team advances', () => {
    expect(analyzeMinimumGamesGuarantee({
      teamCount: 8,
      groupStage: { format: 'round_robin_pool', groupSizes: [4, 4] },
      playoff: { format: 'single_elimination', bracketSizes: [4] },
      allTeamsAdvance: false,
    })).toMatchObject({ groupStageMinimum: 3, playoffMinimum: 0, totalMinimum: 3 });
  });

  it('proves the classification floor and reports the honest three-team exception', () => {
    expect(analyzeMinimumGamesGuarantee({
      teamCount: 8,
      playoff: { format: 'classification', strategy: LPV_CLASSIFICATION_STRATEGY_V1 },
      minimumGamesTarget: 3,
    })).toMatchObject({ playoffMinimum: 3, totalMinimum: 3, meetsTarget: true });

    expect(analyzeMinimumGamesGuarantee({
      teamCount: 3,
      playoff: { format: 'classification', strategy: LPV_CLASSIFICATION_STRATEGY_V1 },
      minimumGamesTarget: 4,
    })).toMatchObject({ playoffMinimum: 4, totalMinimum: 4, meetsTarget: true });

    expect(() => analyzeMinimumGamesGuarantee({
      teamCount: 2,
      playoff: { format: 'classification', strategy: LPV_CLASSIFICATION_STRATEGY_V1 },
      minimumGamesTarget: 3,
    })).toThrowError(expect.objectContaining({ code: 'CLASSIFICATION_REQUIRES_THREE' }));
  });

  it('keeps unknown future placement/consolation strategies explicit and unsupported', () => {
    expect(() => analyzeMinimumGamesGuarantee({
      teamCount: 8,
      playoff: {
        format: 'extension',
        strategy: { strategyId: 'lpv_consolation_future', version: 'v1', kind: 'consolation' },
      },
    })).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_FORMAT_STRATEGY' }));
  });
});
