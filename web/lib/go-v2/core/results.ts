import type { SetRule } from './types';
import { SportsDomainError } from './types';

export interface IncidentScoreSet {
  setNo?: number;
  teamA: number;
  teamB: number;
}

export interface IncompleteScoreCompletion {
  actualSets: Array<Required<IncidentScoreSet>>;
  declaredSets: Array<Required<IncidentScoreSet>>;
  actualRalliesA: number;
  actualRalliesB: number;
  setsA: number;
  setsB: number;
  ralliesA: number;
  ralliesB: number;
}

function assertPoints(value: number, setNo: number, side: 'A' | 'B'): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SportsDomainError(
      'INVALID_INCOMPLETE_SCORE',
      `Set ${setNo} has invalid points for team ${side}.`,
    );
  }
}

export function isTerminalSetScore(teamA: number, teamB: number, rule: SetRule): boolean {
  if (teamA === teamB) return false;
  const winner = Math.max(teamA, teamB);
  const loser = Math.min(teamA, teamB);
  if (rule.pointCap !== null && winner > rule.pointCap) return false;
  if (loser <= rule.targetPoints - rule.winBy) return winner === rule.targetPoints;
  if (winner === loser + rule.winBy) return true;
  return rule.pointCap !== null && winner === rule.pointCap && loser === rule.pointCap - 1;
}

function assertReachableSetState(teamA: number, teamB: number, rule: SetRule, setNo: number): void {
  const leader = Math.max(teamA, teamB);
  const trailer = Math.min(teamA, teamB);
  if (rule.pointCap !== null && leader > rule.pointCap) {
    throw new SportsDomainError('SCORE_EXCEEDS_POINT_CAP', `Set ${setNo} exceeds the configured point cap.`);
  }
  if (rule.pointCap !== null && leader === rule.pointCap && trailer === rule.pointCap) {
    throw new SportsDomainError(
      'INCOMPLETE_SCORE_AFTER_POINT_CAP',
      'A partial set cannot continue after both sides reached the point cap.',
    );
  }
  const normalTerminal = trailer <= rule.targetPoints - rule.winBy
    ? rule.targetPoints
    : trailer + rule.winBy;
  const terminal = rule.pointCap === null ? normalTerminal : Math.min(normalTerminal, rule.pointCap);
  if (leader > terminal) {
    throw new SportsDomainError(
      'INCOMPLETE_SCORE_PAST_SET_END',
      `Set ${setNo} contains points played after the set should have ended.`,
    );
  }
}

function awardedWinnerPoints(loserPoints: number, currentWinnerPoints: number, rule: SetRule): number {
  let required = loserPoints <= rule.targetPoints - rule.winBy
    ? rule.targetPoints
    : loserPoints + rule.winBy;
  if (rule.pointCap !== null) {
    if (loserPoints >= rule.pointCap) {
      throw new SportsDomainError(
        'INCOMPLETE_SCORE_AFTER_POINT_CAP',
        'A partial set cannot continue after both sides reached the point cap.',
      );
    }
    required = Math.min(required, rule.pointCap);
  }
  if (currentWinnerPoints > required) {
    throw new SportsDomainError(
      'INCOMPLETE_SCORE_PAST_SET_END',
      'A partial set contains points played after the set should have ended.',
    );
  }
  return required;
}

/**
 * Completes an injury-retirement score without rewriting the points that were
 * actually played. Every earlier set must be complete; only the final supplied
 * set may be partial. Remaining sets are awarded at target:0 until the declared
 * winner reaches the match rule's sets-to-win threshold.
 */
export function completeIncompleteMatchScore(
  rule: { setsToWin: number; sets: readonly SetRule[] },
  rawSets: readonly IncidentScoreSet[],
  winnerSide: 'A' | 'B',
): IncompleteScoreCompletion {
  if (!rawSets.length || rawSets.length > rule.sets.length) {
    throw new SportsDomainError(
      'INVALID_INCOMPLETE_SET_COUNT',
      'An incomplete result requires at least one set and cannot exceed the match rule.',
    );
  }
  const actualSets = rawSets.map((raw, index) => {
    const setNo = index + 1;
    assertPoints(raw.teamA, setNo, 'A');
    assertPoints(raw.teamB, setNo, 'B');
    return { setNo, teamA: raw.teamA, teamB: raw.teamB };
  });

  let setsA = 0;
  let setsB = 0;
  let retirementApplied = false;
  const declaredSets: Array<Required<IncidentScoreSet>> = [];
  for (let index = 0; index < actualSets.length; index += 1) {
    const score = actualSets[index];
    const setRule = rule.sets[index];
    if (!setRule) {
      throw new SportsDomainError('INVALID_INCOMPLETE_SET_COUNT', 'Score contains an unsupported set.');
    }
    assertReachableSetState(score.teamA, score.teamB, setRule, index + 1);
    const complete = isTerminalSetScore(score.teamA, score.teamB, setRule);
    if (!complete && index !== actualSets.length - 1) {
      throw new SportsDomainError(
        'PARTIAL_SET_NOT_LAST',
        'Only the final supplied set may be incomplete.',
        { setNo: index + 1 },
      );
    }
    if (complete) {
      declaredSets.push({ ...score });
      if (score.teamA > score.teamB) setsA += 1;
      else setsB += 1;
    } else if (winnerSide === 'A') {
      retirementApplied = true;
      declaredSets.push({
        ...score,
        teamA: awardedWinnerPoints(score.teamB, score.teamA, setRule),
      });
      setsA += 1;
    } else {
      retirementApplied = true;
      declaredSets.push({
        ...score,
        teamB: awardedWinnerPoints(score.teamA, score.teamB, setRule),
      });
      setsB += 1;
    }
    if (setsA >= rule.setsToWin || setsB >= rule.setsToWin) {
      if (index !== actualSets.length - 1) {
        throw new SportsDomainError(
          'SETS_AFTER_MATCH_FINISHED',
          'Score contains a set after the match was already decided.',
        );
      }
    }
  }

  if ((setsA >= rule.setsToWin || setsB >= rule.setsToWin) && !retirementApplied) {
    throw new SportsDomainError(
      'MATCH_ALREADY_COMPLETE',
      'Use a played result when the supplied score already decides the match.',
    );
  }

  while ((winnerSide === 'A' ? setsA : setsB) < rule.setsToWin) {
    const index = declaredSets.length;
    const setRule = rule.sets[index];
    if (!setRule) {
      throw new SportsDomainError('INVALID_MATCH_RULE', 'Match rule has too few sets to award the retirement.');
    }
    declaredSets.push({
      setNo: index + 1,
      teamA: winnerSide === 'A' ? setRule.targetPoints : 0,
      teamB: winnerSide === 'B' ? setRule.targetPoints : 0,
    });
    if (winnerSide === 'A') setsA += 1;
    else setsB += 1;
  }

  const rallies = declaredSets.reduce(
    (sum, score) => ({ a: sum.a + score.teamA, b: sum.b + score.teamB }),
    { a: 0, b: 0 },
  );
  const actualRallies = actualSets.reduce(
    (sum, score) => ({ a: sum.a + score.teamA, b: sum.b + score.teamB }),
    { a: 0, b: 0 },
  );
  return {
    actualSets,
    declaredSets,
    actualRalliesA: actualRallies.a,
    actualRalliesB: actualRallies.b,
    setsA,
    setsB,
    ralliesA: rallies.a,
    ralliesB: rallies.b,
  };
}
