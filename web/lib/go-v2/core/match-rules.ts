import type {
  MatchRule,
  MatchRulePreset,
  SetRule,
  SportsEngineConfig,
  ValidationIssue,
  ValidationResult,
} from './types';
import { partitionGroups, supportsModifiedPool4 } from './groups';

const set = (targetPoints: number, winBy = 2, pointCap: number | null = null): SetRule => ({
  targetPoints,
  winBy,
  pointCap,
});

export const MATCH_RULE_PRESETS: Readonly<Record<MatchRulePreset, MatchRule>> = Object.freeze({
  single_21: Object.freeze({
    preset: 'single_21',
    setsToWin: 1,
    sets: Object.freeze([Object.freeze(set(21))]),
  }),
  best_of_3_15: Object.freeze({
    preset: 'best_of_3_15',
    setsToWin: 2,
    sets: Object.freeze([Object.freeze(set(15)), Object.freeze(set(15)), Object.freeze(set(15))]),
  }),
  best_of_3_21_15: Object.freeze({
    preset: 'best_of_3_21_15',
    setsToWin: 2,
    sets: Object.freeze([Object.freeze(set(21)), Object.freeze(set(21)), Object.freeze(set(15))]),
  }),
});

export function createMatchRule(
  preset: MatchRulePreset,
  overrides: { winBy?: number; pointCap?: number | null } = {},
): MatchRule {
  const source = MATCH_RULE_PRESETS[preset];
  if (!source) throw new Error(`Unknown match rule preset: ${String(preset)}`);

  const rule: MatchRule = {
    preset,
    setsToWin: source.setsToWin,
    sets: source.sets.map((item) => ({
      ...item,
      winBy: overrides.winBy ?? item.winBy,
      pointCap: overrides.pointCap === undefined ? item.pointCap : overrides.pointCap,
    })),
  };
  const result = validateMatchRule(rule);
  if (!result.ok) {
    throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '));
  }
  return result.value;
}

export function validateMatchRule(rule: MatchRule, path = 'matchRule'): ValidationResult<MatchRule> {
  const issues: ValidationIssue[] = [];
  const expectedSetCount = rule.setsToWin * 2 - 1;

  if (!Number.isInteger(rule.setsToWin) || rule.setsToWin < 1) {
    issues.push({ path: `${path}.setsToWin`, code: 'INVALID_SETS_TO_WIN', message: 'setsToWin must be a positive integer.' });
  }
  if (!Array.isArray(rule.sets) || rule.sets.length !== expectedSetCount) {
    issues.push({
      path: `${path}.sets`,
      code: 'INVALID_SET_COUNT',
      message: `A best-of-${expectedSetCount} rule must define exactly ${expectedSetCount} set rules.`,
    });
  }

  rule.sets.forEach((item, index) => {
    const itemPath = `${path}.sets[${index}]`;
    if (!Number.isInteger(item.targetPoints) || item.targetPoints < 1) {
      issues.push({ path: `${itemPath}.targetPoints`, code: 'INVALID_TARGET', message: 'targetPoints must be a positive integer.' });
    }
    if (!Number.isInteger(item.winBy) || item.winBy < 1) {
      issues.push({ path: `${itemPath}.winBy`, code: 'INVALID_WIN_BY', message: 'winBy must be a positive integer.' });
    }
    if (item.pointCap !== null && (!Number.isInteger(item.pointCap) || item.pointCap < item.targetPoints)) {
      issues.push({
        path: `${itemPath}.pointCap`,
        code: 'INVALID_POINT_CAP',
        message: 'pointCap must be null or an integer greater than or equal to targetPoints.',
      });
    }
  });

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      preset: rule.preset,
      setsToWin: rule.setsToWin,
      sets: rule.sets.map((item) => ({ ...item })),
    },
    issues: [],
  };
}

export function getSetRule(rule: MatchRule, setIndex: number): SetRule {
  if (!Number.isInteger(setIndex) || setIndex < 0 || setIndex >= rule.sets.length) {
    throw new RangeError(`Set index ${setIndex} is outside match rule ${rule.preset}.`);
  }
  return { ...rule.sets[setIndex] };
}

export function validateSportsEngineConfig(config: SportsEngineConfig): ValidationResult<SportsEngineConfig> {
  const issues: ValidationIssue[] = [];
  if (!Number.isInteger(config.teamCount) || config.teamCount < 2 || config.teamCount > 48) {
    issues.push({ path: 'teamCount', code: 'INVALID_TEAM_COUNT', message: 'teamCount must be an integer from 2 to 48.' });
  }
  if (config.groupStage.enabled && config.teamCount === 5) {
    issues.push({
      path: 'teamCount',
      code: 'GROUPS_UNAVAILABLE_FOR_FIVE',
      message: 'Five teams cannot be partitioned into groups of three or four; use a standalone bracket or add a sixth team.',
    });
  }
  if (config.groupStage.enabled && config.teamCount < 3) {
    issues.push({ path: 'teamCount', code: 'TOO_FEW_FOR_GROUPS', message: 'A group stage requires at least three teams.' });
  }
  if (
    config.groupStage.enabled &&
    config.groupStage.format === 'modified_pool_4' &&
    config.teamCount >= 3 &&
    config.teamCount <= 48 &&
    config.teamCount !== 5 &&
    !supportsModifiedPool4(partitionGroups(config.teamCount))
  ) {
    issues.push({
      path: 'groupStage.format',
      code: 'MODIFIED_POOL_REQUIRES_ALL_FOURS',
      message: 'Modified Pool 4 is available only when every pool has four teams; mixed 3/4 pools must use full round robin.',
    });
  }
  if (!Number.isInteger(config.hardCap) || config.hardCap < 2 || config.hardCap > 16) {
    issues.push({ path: 'hardCap', code: 'INVALID_HARD_CAP', message: 'hardCap must be an integer from 2 to 16.' });
  }
  if (config.playoff.format === 'double_elimination' && config.teamCount < 3) {
    issues.push({
      path: 'playoff.format',
      code: 'TOO_FEW_FOR_DOUBLE_ELIMINATION',
      message: 'True double elimination requires at least three teams.',
    });
  }
  if (config.playoff.format === 'double_elimination' && config.playoff.bronzeMatch) {
    issues.push({
      path: 'playoff.bronzeMatch',
      code: 'BRONZE_NOT_SUPPORTED_IN_DOUBLE_ELIMINATION',
      message: 'Double elimination does not use a separate bronze match.',
    });
  }
  if (config.playoff.format === 'single_elimination' && config.playoff.resetFinal) {
    issues.push({
      path: 'playoff.resetFinal',
      code: 'RESET_ONLY_FOR_DOUBLE_ELIMINATION',
      message: 'A reset final is only valid for double elimination.',
    });
  }

  const groupRule = validateMatchRule(config.groupStage.matchRule, 'groupStage.matchRule');
  if (!groupRule.ok) issues.push(...groupRule.issues);
  const playoffRule = validateMatchRule(config.playoff.matchRule, 'playoff.matchRule');
  if (!playoffRule.ok) issues.push(...playoffRule.issues);

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      ...config,
      groupStage: { ...config.groupStage, matchRule: groupRule.ok ? groupRule.value : config.groupStage.matchRule },
      playoff: { ...config.playoff, matchRule: playoffRule.ok ? playoffRule.value : config.playoff.matchRule },
    },
    issues: [],
  };
}
