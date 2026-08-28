import { describe, expect, it } from 'vitest';

import { appendResultRevision } from '../../web/lib/go-v2/repository';

function resultClient(currentRevisionNo: number) {
  const lineupWrites: Array<{ mode: 'copy' | 'current'; params: unknown[] }> = [];
  return {
    lineupWrites,
    async query(sql: string, params: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT id, current_result_revision_no')) {
        return { rowCount: 1, rows: [{ id: 'match-1', current_result_revision_no: currentRevisionNo }] };
      }
      if (normalized.startsWith('SELECT id, revision_no FROM go_v2_match_result_revisions')) {
        return currentRevisionNo > 0
          ? { rowCount: 1, rows: [{ id: `result-${currentRevisionNo}`, revision_no: currentRevisionNo }] }
          : { rowCount: 0, rows: [] };
      }
      if (
        normalized.startsWith('INSERT INTO go_v2_match_lineup_snapshots')
        && normalized.includes('FROM go_v2_match_lineup_snapshots')
      ) {
        lineupWrites.push({ mode: 'copy', params });
        return { rowCount: 2, rows: [] };
      }
      if (
        normalized.startsWith('INSERT INTO go_v2_match_lineup_snapshots')
        && normalized.includes('FROM go_v2_match_slot_sources')
      ) {
        lineupWrites.push({ mode: 'current', params });
        return { rowCount: 2, rows: [] };
      }
      if (normalized.startsWith('SELECT count(*)::int AS count')) {
        return { rowCount: 1, rows: [{ count: 2, matches_current_slots: true }] };
      }
      if (normalized.startsWith('INSERT INTO go_v2_match_result_revisions')) {
        return { rowCount: 1, rows: [{ id: `result-${currentRevisionNo + 1}` }] };
      }
      if (normalized.startsWith('UPDATE go_v2_matches SET current_result_revision_no')) {
        return { rowCount: 1, rows: [] };
      }
      if (normalized.startsWith('SELECT duty.id::text AS duty_id')) {
        return { rowCount: 0, rows: [] };
      }
      throw new Error(`Unexpected result revision query: ${normalized}`);
    },
  };
}

describe('GO V2 immutable result lineups', () => {
  it('copies the played lineup when a later roster exists and the score is corrected', async () => {
    const client = resultClient(1);
    const result = await appendResultRevision(client as never, {
      tournamentId: 'tournament',
      matchId: 'match-1',
      actorId: 'actor',
      reasonCode: 'referee_typo',
      payload: {
        resultKind: 'played',
        previousResultRevisionNo: 1,
        winnerEntryId: 'entry-a',
        loserEntryId: 'entry-b',
      },
    });

    expect(result.revisionNo).toBe(2);
    expect(client.lineupWrites).toEqual([{
      mode: 'copy',
      params: ['match-1', 2, 1],
    }]);
  });

  it('uses the current roster only for the first result or a replay without an active result pointer', async () => {
    const client = resultClient(0);
    await appendResultRevision(client as never, {
      tournamentId: 'tournament',
      matchId: 'match-1',
      actorId: 'actor',
      reasonCode: 'incident_recorded',
      payload: {
        resultKind: 'played',
        winnerEntryId: 'entry-a',
        loserEntryId: 'entry-b',
      },
    });

    expect(client.lineupWrites).toEqual([{
      mode: 'current',
      params: ['match-1', 1],
    }]);
  });

  it('lets compensating undo copy an older immutable lineup without accepting a client payload override', async () => {
    const client = resultClient(2);
    const result = await appendResultRevision(client as never, {
      tournamentId: 'tournament',
      matchId: 'match-1',
      actorId: 'actor',
      reasonCode: 'undo_mutation',
      lineupSourceRevisionNo: 1,
      payload: {
        resultKind: 'played',
        winnerEntryId: 'entry-a',
        loserEntryId: 'entry-b',
      },
    });

    expect(result.revisionNo).toBe(3);
    expect(client.lineupWrites).toEqual([{
      mode: 'copy',
      params: ['match-1', 3, 1],
    }]);
  });

  it('rejects a stale correction instead of copying the wrong revision lineup', async () => {
    const client = resultClient(2);
    await expect(appendResultRevision(client as never, {
      tournamentId: 'tournament',
      matchId: 'match-1',
      actorId: 'actor',
      reasonCode: 'referee_typo',
      payload: {
        resultKind: 'played',
        previousResultRevisionNo: 1,
      },
    })).rejects.toMatchObject({ code: 'RESULT_REVISION_STALE' });
    expect(client.lineupWrites).toEqual([]);
  });
});
