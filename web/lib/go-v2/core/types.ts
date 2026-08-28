export type StageType =
  | 'round_robin_pool'
  | 'modified_pool_4'
  | 'tier_split'
  | 'single_elimination'
  | 'double_elimination'
  | 'placement_match';

export type MatchRulePreset = 'single_21' | 'best_of_3_15' | 'best_of_3_21_15';

export interface SetRule {
  targetPoints: number;
  winBy: number;
  pointCap: number | null;
}

export interface MatchRule {
  preset: MatchRulePreset;
  setsToWin: number;
  sets: readonly SetRule[];
}

export interface SeedEntry {
  entryId: string;
  rating: number;
  confirmedAt: string | number | Date;
}

export interface SeededEntry extends SeedEntry {
  initialSeed: number;
}

export interface GroupPartition {
  teamCount: number;
  groupCount: number;
  threes: number;
  fours: number;
  capacities: readonly (3 | 4)[];
}

export interface GroupSlot {
  entry: SeededEntry;
  slot: number;
}

export interface SeededGroup {
  groupId: string;
  capacity: 3 | 4;
  slots: readonly GroupSlot[];
}

export interface GroupDraw {
  groups: readonly SeededGroup[];
  seedSnapshot: readonly SeededEntry[];
}

export type SlotSource =
  | { kind: 'ENTRY'; entryId: string; initialSeed: number }
  | { kind: 'MATCH_WINNER'; matchId: string }
  | { kind: 'MATCH_LOSER'; matchId: string }
  | { kind: 'BYE' };

export interface PoolPairing {
  matchId: string;
  poolId: string;
  round: number;
  position: number;
  sourceA: SlotSource;
  sourceB: SlotSource;
  placementRange?: readonly [number, number];
}

export type IntegerLike = bigint | number;

export interface StandingContribution {
  matchId: string;
  teamId: string;
  opponentId: string;
  matchPoints: IntegerLike;
  setsFor: IntegerLike;
  setsAgainst: IntegerLike;
  pointsFor: IntegerLike;
  pointsAgainst: IntegerLike;
  counted?: boolean;
}

export interface PoolStandingInput {
  entryId: string;
  poolId: string;
  poolSize: 3 | 4;
  poolRank: number;
  initialSeed: number;
  ledger: readonly StandingContribution[];
}

export interface ExactStats {
  matchesPlayed: bigint;
  matchPoints: bigint;
  setsFor: bigint;
  setsAgainst: bigint;
  pointsFor: bigint;
  pointsAgainst: bigint;
}

export interface CrossPoolComparisonRow extends ExactStats {
  entryId: string;
  poolId: string;
  poolSize: 3 | 4;
  poolRank: number;
  initialSeed: number;
  excludedMatchIds: readonly string[];
}

/** JSON boundary representation. Exact integers stay decimal strings. */
export interface CrossPoolComparisonRowDto {
  entryId: string;
  poolId: string;
  poolSize: 3 | 4;
  poolRank: number;
  initialSeed: number;
  excludedMatchIds: readonly string[];
  matchesPlayed: string;
  matchPoints: string;
  setsFor: string;
  setsAgainst: string;
  pointsFor: string;
  pointsAgainst: string;
}

export type ExactRatio =
  | { kind: 'finite'; numerator: bigint; denominator: bigint }
  | { kind: 'infinity' }
  | { kind: 'no_data' };

export type ExactRatioDto =
  | { kind: 'finite'; numerator: string; denominator: string }
  | { kind: 'infinity' }
  | { kind: 'no_data' };

export type TierName = 'hard' | 'medium' | 'light';
export type TierMode = 'auto' | 'two' | 'three';

export interface TierQuotas {
  mode: 'two' | 'three';
  hard: number;
  medium: number;
  light: number;
}

export type ExactTierQuotas = Pick<TierQuotas, 'hard' | 'medium' | 'light'>;

export interface TierAllocation {
  quotas: TierQuotas;
  hard: readonly CrossPoolComparisonRow[];
  medium: readonly CrossPoolComparisonRow[];
  light: readonly CrossPoolComparisonRow[];
}

export interface TierAllocationDto {
  quotas: TierQuotas;
  hard: readonly CrossPoolComparisonRowDto[];
  medium: readonly CrossPoolComparisonRowDto[];
  light: readonly CrossPoolComparisonRowDto[];
}

export interface BracketParticipant {
  entryId: string;
  seed: number;
  poolId?: string;
  poolRank?: number;
}

export type BracketPhase = 'upper' | 'lower' | 'grand_final' | 'bronze';

export interface BracketMatchCondition {
  kind: 'LOWER_BRACKET_WINNER_WON_GF1';
  grandFinalMatchId: string;
}

export type ChampionSource = SlotSource | {
  kind: 'CONDITIONAL_MATCH_WINNER';
  matchId: string;
  fallback: SlotSource;
  condition: BracketMatchCondition;
};

export interface BracketMatch {
  matchId: string;
  phase: BracketPhase;
  round: number;
  position: number;
  sourceA: SlotSource;
  sourceB: SlotSource;
  conditional: boolean;
  condition?: BracketMatchCondition;
  publicLabel?: string;
}

export interface ByeAdvance {
  phase: BracketPhase;
  round: number;
  position: number;
  advancedSource: SlotSource;
}

export interface RematchPreview {
  poolId: string;
  earliestUpperRound: number;
  entryIds: readonly [string, string];
}

export interface BracketTopology {
  kind: 'single_elimination' | 'double_elimination';
  participantCount: number;
  capacity: 2 | 4 | 8 | 16 | 32 | 64;
  templateVersion: 'lpv_se_v1' | 'lpv_de_crossover_v1';
  matches: readonly BracketMatch[];
  byeAdvances: readonly ByeAdvance[];
  championSource: ChampionSource;
  guaranteedMatchCount: number;
  maximumMatchCount: number;
  rematchPreview: readonly RematchPreview[];
  warnings: readonly string[];
  topologyHash: string;
}

export interface SportsEngineConfig {
  teamCount: number;
  groupStage: {
    enabled: boolean;
    format: 'round_robin_pool' | 'modified_pool_4';
    matchRule: MatchRule;
  };
  playoff: {
    format: 'single_elimination' | 'double_elimination';
    matchRule: MatchRule;
    bronzeMatch: boolean;
    resetFinal: boolean;
  };
  tierMode: TierMode;
  hardCap: number;
}

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T; issues: readonly [] }
  | { ok: false; issues: readonly ValidationIssue[] };

export class SportsDomainError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: string, message: string, details: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = 'SportsDomainError';
    this.code = code;
    this.details = details;
  }
}
