import type { MatchConfig, MatchCore, TeamId } from './types';

export function getCurrentTarget(config: MatchConfig, currentSet: number): number {
  if (config.setsToWin === 2 && currentSet >= 3) {
    return config.targetDecider;
  }
  return config.targetMain;
}

export function getSideSwapInterval(config: MatchConfig, currentSet: number): number {
  if (config.setsToWin === 2 && currentSet >= 3) {
    return 5;
  }
  return 7;
}

export function isSetWon(
  a: number,
  b: number,
  target: number,
  winByTwo = true,
): TeamId | null {
  if (a >= target && (!winByTwo || a - b >= 2)) return 'A';
  if (b >= target && (!winByTwo || b - a >= 2)) return 'B';
  return null;
}

export function isMatchWon(
  setsA: number,
  setsB: number,
  setsToWin: 1 | 2,
): TeamId | null {
  if (setsA >= setsToWin) return 'A';
  if (setsB >= setsToWin) return 'B';
  return null;
}

export function isDeuce(a: number, b: number, target: number): boolean {
  return a >= target - 1 && b >= target - 1 && a === b;
}

export function getAdvantage(a: number, b: number, target: number): TeamId | null {
  if (a < target - 1 && b < target - 1) return null;
  if (a === b) return null;
  if (a >= target - 1 && a > b) return 'A';
  if (b >= target - 1 && b > a) return 'B';
  return null;
}

/**
 * Set point: команда в одном очке от выигрыша сета (с учётом win by 2).
 * При a = target - 1 и b <= a - 1 (например 20:18) — set point A.
 * При deuce (20:20) — set point никому (после deuce даёт advantage).
 */
export function isSetPoint(a: number, b: number, target: number): TeamId | null {
  const needA = Math.max(target - a, 0);
  const needB = Math.max(target - b, 0);
  const aCanWinNextPoint = a + 1 >= target && a + 1 - b >= 2;
  const bCanWinNextPoint = b + 1 >= target && b + 1 - a >= 2;
  if (aCanWinNextPoint && !bCanWinNextPoint) return 'A';
  if (bCanWinNextPoint && !aCanWinNextPoint) return 'B';
  if (aCanWinNextPoint && bCanWinNextPoint) {
    // Оба в одном очке (невозможно при корректной игре, но на всякий случай).
    return a > b ? 'A' : b > a ? 'B' : null;
  }
  // «A ведёт и ему остался 1, а B ещё 2+» — тоже set point A.
  if (needA === 1 && needB >= 2 && a - b >= 1) return 'A';
  if (needB === 1 && needA >= 2 && b - a >= 1) return 'B';
  return null;
}

export function isMatchPoint(core: MatchCore, config: MatchConfig): TeamId | null {
  const target = getCurrentTarget(config, core.currentSet);
  const setPoint = isSetPoint(core.scoreA, core.scoreB, target);
  if (!setPoint) return null;
  const setsNeededA = config.setsToWin - core.setsA;
  const setsNeededB = config.setsToWin - core.setsB;
  if (setPoint === 'A' && setsNeededA === 1) return 'A';
  if (setPoint === 'B' && setsNeededB === 1) return 'B';
  return null;
}

export function canEndSetNow(
  scoreA: number,
  scoreB: number,
  target: number,
  winByTwo: boolean,
): { ok: boolean; reason: string } {
  const maxScore = Math.max(scoreA, scoreB);
  const lead = Math.abs(scoreA - scoreB);
  if (maxScore < target) {
    return { ok: false, reason: `Нельзя завершить сет: не достигнут лимит ${target}.` };
  }
  if (winByTwo && lead < 2) {
    return { ok: false, reason: 'Нельзя завершить сет: нужна разница минимум 2 очка.' };
  }
  return { ok: true, reason: '' };
}

/**
 * Смена сторон: каждые `interval` суммарных очков в сете.
 * Триггер — достигнут новый порог (scoreA + scoreB >= lastSwap + interval).
 */
export function shouldSwapSides(
  scoreA: number,
  scoreB: number,
  lastSideSwapTotal: number,
  interval: number,
): boolean {
  const total = scoreA + scoreB;
  if (total <= 0) return false;
  return total >= lastSideSwapTotal + interval;
}
