export type IndividualMixGender = 'M' | 'W';
export type IndividualMixSide = 'left' | 'right';
export type IndividualMixResultKind = 'played' | 'walkover' | 'retirement' | 'cancelled' | 'admin_adjusted';
export type IndividualMixGameMode = 'own_pairs' | 'partner_swap' | 'fixed_pairs';

export interface IndividualMixPlayer {
  id: string;
  name: string;
  gender: IndividualMixGender;
  drawSeed?: number;
}

export interface IndividualMixTeam {
  maleId: string;
  femaleId: string;
}

export interface IndividualMixGame {
  id: string;
  poolId: string;
  courtNo: number;
  roundNo: number;
  duelNo: number;
  gameNo: number;
  shortCode: string;
  mode?: IndividualMixGameMode;
  sourcePairNos?: [number, number];
  left: IndividualMixTeam;
  right: IndividualMixTeam;
}

export interface IndividualMixDuel {
  id: string;
  poolId: string;
  courtNo: number;
  roundNo: number;
  duelNo: number;
  mode?: 'thai' | 'standard';
  sourcePairNos?: [number, number];
  maleIds: [string, string];
  femaleIds: [string, string];
  judgePlayerIds: [string, string];
  games: IndividualMixGame[];
}

export interface IndividualMixRound {
  roundNo: number;
  duels: IndividualMixDuel[];
  restingPlayerIds: string[];
}

export type IndividualMixQueueItem =
  | { kind: 'game'; orderNo: number; gameId: string; duelId: string }
  | { kind: 'break'; orderNo: number; reason: 'mandatory_rest'; affectedPlayerIds: string[] };

export interface IndividualMixPoolSchedule {
  poolId: string;
  courtNo: number;
  players: IndividualMixPlayer[];
  rounds: IndividualMixRound[];
  queue: IndividualMixQueueItem[];
}

export type IndividualMixScoreRule =
  | { kind: 'hard_cap'; target: number }
  | { kind: 'win_by_two'; target: number; cap?: number }
  | { kind: 'timed'; maxPoints?: number };

export interface IndividualMixGameResult {
  gameId: string;
  leftScore: number;
  rightScore: number;
  kind: IndividualMixResultKind;
  reason?: string;
}

export interface IndividualMixStandingRow {
  playerId: string;
  gender: IndividualMixGender;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  drawSeed: number;
  position: number;
}

export interface IndividualMixPlayoffPair {
  id: string;
  seedNo: 1 | 2 | 3 | 4;
  maleId: string;
  femaleId: string;
}

export interface IndividualMixDivisionBracket {
  divisionId: string;
  pairs: IndividualMixPlayoffPair[];
  semifinals: Array<{
    id: string;
    pairAId: string;
    pairBId: string;
  }>;
  medalMatches: {
    final: { id: string; sourcePairIds: [string, string] };
    bronze: { id: string; sourcePairIds: [string, string] };
  };
}

export type IndividualMixDivisionName = 'HARD' | 'ADV' | 'MED' | 'LIGHT';

export interface IndividualMixDivisionEntry extends IndividualMixStandingRow {
  poolId: string;
  poolCourtNo: number;
  poolRank: number;
  divisionSeed: 1 | 2 | 3 | 4;
}

export interface IndividualMixSeededDivision {
  id: string;
  name: IndividualMixDivisionName;
  courtNo: number;
  men: [IndividualMixDivisionEntry, IndividualMixDivisionEntry, IndividualMixDivisionEntry, IndividualMixDivisionEntry];
  women: [IndividualMixDivisionEntry, IndividualMixDivisionEntry, IndividualMixDivisionEntry, IndividualMixDivisionEntry];
  bracket: IndividualMixDivisionBracket;
}
