import type { MatchState } from './types';

const KEY_PREFIX = 'lp:judge-scoreboard:v1:court-';

function keyFor(courtId: string): string {
  return `${KEY_PREFIX}${courtId}`;
}

export function loadState(courtId: string): MatchState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(keyFor(courtId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MatchState;
    if (!parsed || typeof parsed !== 'object' || !parsed.core || !parsed.config || !parsed.meta) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(courtId: string, state: MatchState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(keyFor(courtId), JSON.stringify(state));
  } catch {
    // quota / приватный режим — тихо игнорируем, state останется в памяти
  }
}

export function clearState(courtId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(keyFor(courtId));
  } catch {
    // ignore
  }
}
