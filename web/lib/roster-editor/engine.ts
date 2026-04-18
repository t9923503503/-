import type { RosterEditorAction, RosterEditorPlayerSlot, RosterEditorSnapshot } from './types';

type Slot = RosterEditorPlayerSlot | null;

export function draftPlayersToSnapshot(
  draftPlayers: Array<
    | {
        playerId: string;
        playerName: string;
        gender: 'M' | 'W';
        playerLevel?: 'hard' | 'medium' | 'easy';
      }
    | null
    | undefined
  >,
): RosterEditorSnapshot {
  return {
    draftPlayers: draftPlayers.map((slot) => (slot ? { ...slot } : null)),
  };
}

export function snapshotToDraftPlayers(snapshot: RosterEditorSnapshot | null): Array<Slot | undefined> {
  if (!snapshot || !Array.isArray(snapshot.draftPlayers)) return [];
  const next = snapshot.draftPlayers.map((slot) => (slot ? { ...slot } : undefined));
  while (next.length > 0 && !next[next.length - 1]) next.pop();
  return next;
}

function cloneSlots(current: Array<Slot | undefined>): Slot[] {
  return current.map((slot) => (slot ? { ...slot } : null));
}

export function applyRosterEditorAction(
  current: Array<Slot | undefined>,
  action: RosterEditorAction,
): Array<Slot | undefined> {
  const next = cloneSlots(current);
  switch (action.type) {
    case 'swap': {
      if (!Number.isFinite(action.fromIndex) || !Number.isFinite(action.toIndex)) return current;
      const from = Math.trunc(action.fromIndex as number);
      const to = Math.trunc(action.toIndex as number);
      if (from < 0 || to < 0) return current;
      while (next.length <= Math.max(from, to)) next.push(null);
      [next[from], next[to]] = [next[to], next[from]];
      break;
    }
    case 'move_pair': {
      if (!action.pair) return current;
      const from = Math.max(0, Math.trunc(action.pair.fromStart));
      const to = Math.max(0, Math.trunc(action.pair.toStart));
      while (next.length <= Math.max(from + 1, to + 1)) next.push(null);
      const a = next[from];
      const b = next[from + 1];
      next[from] = next[to];
      next[from + 1] = next[to + 1];
      next[to] = a;
      next[to + 1] = b;
      break;
    }
    case 'remove': {
      if (!Number.isFinite(action.fromIndex)) return current;
      const index = Math.max(0, Math.trunc(action.fromIndex as number));
      if (index < next.length) next[index] = null;
      break;
    }
    case 'clear_scope': {
      if (!Array.isArray(action.indexes)) return current;
      for (const value of action.indexes) {
        const index = Math.max(0, Math.trunc(value));
        if (index < next.length) next[index] = null;
      }
      break;
    }
    default:
      return current;
  }
  while (next.length > 0 && !next[next.length - 1]) next.pop();
  return next.map((slot) => (slot ? { ...slot } : undefined));
}
