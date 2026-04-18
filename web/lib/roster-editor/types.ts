export type RosterEditorScope = 'categories' | 'groups' | 'courts' | 'reserve' | 'all' | 'thai-r1';

export type RosterEditorActionType =
  | 'assign'
  | 'swap'
  | 'move_pair'
  | 'remove'
  | 'clear_scope'
  | 'bulk_auto_fill';

export interface RosterEditorPlayerSlot {
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
  playerLevel?: 'hard' | 'medium' | 'easy';
}

export interface RosterEditorSnapshot {
  draftPlayers: Array<RosterEditorPlayerSlot | null>;
}

export interface RosterEditorAction {
  type: RosterEditorActionType;
  scope?: RosterEditorScope;
  fromIndex?: number;
  toIndex?: number;
  indexes?: number[];
  pair?: {
    fromStart: number;
    toStart: number;
  };
  note?: string;
}

export interface RosterEditorHistoryEntry {
  at: string;
  action: RosterEditorAction;
  snapshot: RosterEditorSnapshot;
}

export interface RosterEditorHistoryState {
  revision: number;
  sessionId: string | null;
  cursor: number;
  stack: RosterEditorHistoryEntry[];
  currentSnapshot: RosterEditorSnapshot | null;
  canUndo: boolean;
  canRedo: boolean;
}

export interface RosterEditorMutationOptions {
  expectedRevision?: number | null;
  sessionId?: string | null;
  requestId?: string | null;
}
