import { beforeEach, describe, expect, it, vi } from 'vitest';

const historyRows = new Map();
const actionLog = [];

function keyFor(tournamentId, actorId) {
  return `${tournamentId}::${actorId}`;
}

const queryMock = vi.fn(async (sql, params = []) => {
  if (sql.includes('SELECT revision, session_id, cursor, stack_json')) {
    const [tournamentId, actorId] = params;
    const row = historyRows.get(keyFor(tournamentId, actorId));
    return { rows: row ? [row] : [] };
  }

  if (sql.includes('INSERT INTO roster_editor_history_state')) {
    const [tournamentId, actorId, revision, sessionId, cursor, stackJson] = params;
    historyRows.set(keyFor(tournamentId, actorId), {
      revision,
      session_id: sessionId ?? null,
      cursor,
      stack_json: typeof stackJson === 'string' ? JSON.parse(stackJson) : stackJson,
    });
    return { rows: [], rowCount: 1 };
  }

  if (sql.includes('INSERT INTO roster_editor_action_log')) {
    actionLog.push({ sql, params });
    return { rows: [], rowCount: 1 };
  }

  if (sql.includes('DELETE FROM roster_editor_action_log')) {
    return { rows: [], rowCount: 0 };
  }

  throw new Error(`Unhandled SQL in test mock: ${sql}`);
});

vi.mock('@/lib/db', () => ({
  getPool: () => ({
    query: queryMock,
  }),
}));

import {
  applyRosterEditorAction,
  getRosterEditorHistoryState,
  isRosterEditorConflictError,
  undoRosterEditorAction,
} from '../../web/lib/roster-editor/history.ts';

function buildSnapshot(name) {
  return {
    draftPlayers: [
      {
        playerId: `${name}-id`,
        playerName: name,
        gender: 'M',
      },
    ],
  };
}

describe('roster editor history service', () => {
  beforeEach(() => {
    historyRows.clear();
    actionLog.length = 0;
    queryMock.mockClear();
  });

  it('applies actions with revision/session metadata and logs request ids', async () => {
    const state1 = await applyRosterEditorAction(
      't1',
      'u1',
      { type: 'assign', note: 'first' },
      buildSnapshot('A'),
      { expectedRevision: 0, sessionId: 'session-1', requestId: 'req-1' },
    );

    expect(state1.revision).toBe(1);
    expect(state1.sessionId).toBe('session-1');
    expect(state1.cursor).toBe(0);
    expect(state1.canUndo).toBe(true);
    expect(actionLog).toHaveLength(1);
    expect(actionLog[0].params[2]).toBe('session-1');
    expect(actionLog[0].params[3]).toBe('req-1');
    expect(actionLog[0].params[4]).toBe(0);
    expect(actionLog[0].params[5]).toBe(1);

    const stored = await getRosterEditorHistoryState('t1', 'u1');
    expect(stored.revision).toBe(1);
    expect(stored.stack).toHaveLength(1);
  });

  it('rejects stale writes via expectedRevision conflict', async () => {
    await applyRosterEditorAction('t1', 'u1', { type: 'assign' }, buildSnapshot('A'), {
      expectedRevision: 0,
      sessionId: 's1',
      requestId: 'r1',
    });

    let caught = null;
    try {
      await applyRosterEditorAction('t1', 'u1', { type: 'assign' }, buildSnapshot('B'), {
        expectedRevision: 0,
        sessionId: 's1',
        requestId: 'r2',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeTruthy();
    expect(isRosterEditorConflictError(caught)).toBe(true);

    const stored = await getRosterEditorHistoryState('t1', 'u1');
    expect(stored.revision).toBe(1);
    expect(stored.stack).toHaveLength(1);
  });

  it('supports undo and history branch reset after undo + apply', async () => {
    historyRows.set(keyFor('t1', 'u1'), {
      revision: 2,
      session_id: 's1',
      cursor: 1,
      stack_json: [
        {
          at: new Date().toISOString(),
          action: { type: 'assign', note: 'A' },
          snapshot: buildSnapshot('A'),
        },
        {
          at: new Date().toISOString(),
          action: { type: 'assign', note: 'B' },
          snapshot: buildSnapshot('B'),
        },
      ],
    });

    const undone = await undoRosterEditorAction('t1', 'u1', { expectedRevision: 2, sessionId: 's1' });
    expect(undone.revision).toBe(3);
    expect(undone.cursor).toBe(0);
    expect(undone.canRedo).toBe(true);

    const branched = await applyRosterEditorAction(
      't1',
      'u1',
      { type: 'assign', note: 'C' },
      buildSnapshot('C'),
      { expectedRevision: undone.revision, sessionId: 's1', requestId: 'r3' },
    );

    expect(branched.revision).toBe(undone.revision + 1);
    expect(branched.cursor).toBeGreaterThanOrEqual(0);
    expect(branched.stack).toHaveLength(1);
    expect(branched.stack[branched.cursor]?.action?.note).toBe('C');
    expect(branched.canRedo).toBe(false);
  });
});
