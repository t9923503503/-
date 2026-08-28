import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { materializeLoserRefereeDuties } from '../../web/lib/go-v2/repository';

function dutyClient(candidateEntryIds: string[]) {
  const updates: Array<{ sql: string; params: unknown[] }> = [];
  return {
    updates,
    async query(sql: string, params: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT duty.id::text AS duty_id')) {
        return {
          rowCount: 1,
          rows: [{ duty_id: 'duty-1', candidate_entry_ids: candidateEntryIds }],
        };
      }
      if (normalized.startsWith('UPDATE go_v2_referee_duties')) {
        updates.push({ sql: normalized, params });
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected referee materialization query: ${normalized}`);
    },
  };
}

describe('GO V2 loser-referee result materialization', () => {
  it('binds the actual loser as a concrete entry duty while retaining source lineage', async () => {
    const client = dutyClient(['entry-a', 'entry-b']);
    const ids = await materializeLoserRefereeDuties(client as never, {
      sourceMatchId: 'source-match',
      loserEntryId: 'entry-b',
      resultRevisionNo: 3,
    });

    expect(ids).toEqual(['duty-1']);
    expect(client.updates).toHaveLength(1);
    expect(client.updates[0].sql).toContain("SET duty_kind = 'entry'");
    expect(client.updates[0].sql).toContain('referee_entry_id = $2');
    expect(client.updates[0].sql).toContain("'sourceDutyKind', 'loser_previous_same_court'");
    expect(client.updates[0].params).toEqual([
      'source-match',
      'entry-b',
      3,
      ['duty-1'],
    ]);
  });

  it('fails closed when the actual loser was not one of the solver-reserved candidates', async () => {
    const client = dutyClient(['entry-a', 'entry-b']);
    await expect(materializeLoserRefereeDuties(client as never, {
      sourceMatchId: 'source-match',
      loserEntryId: 'entry-c',
      resultRevisionNo: 2,
    })).rejects.toMatchObject({ code: 'LOSER_REFEREE_CANDIDATE_MISMATCH' });
    expect(client.updates).toEqual([]);
  });

  it('releases the duty and requires replan when a result has no loser', async () => {
    const client = dutyClient(['entry-a', 'entry-b']);
    await materializeLoserRefereeDuties(client as never, {
      sourceMatchId: 'source-match',
      loserEntryId: null,
      resultRevisionNo: 4,
    });

    expect(client.updates[0].sql).toContain("SET duty_kind = 'loser_previous_same_court'");
    expect(client.updates[0].sql).toContain("status = 'released'");
    expect(client.updates[0].sql).toContain("'resolutionState', 'no_loser_requires_replan'");
  });

  it('runs binding after the result pointer update and also binds completed sources on schedule publish', () => {
    const repository = readFileSync(
      path.join(process.cwd(), 'web/lib/go-v2/repository.ts'),
      'utf8',
    );
    const resultUpdate = repository.indexOf('SET current_result_revision_no = $2');
    const resultBinding = repository.indexOf('const resolvedRefereeDutyIds = await materializeLoserRefereeDuties', resultUpdate);
    const scheduleBinding = repository.indexOf('if (loserDutySourceMatchIds.size)');

    expect(resultUpdate).toBeGreaterThan(-1);
    expect(resultBinding).toBeGreaterThan(resultUpdate);
    expect(scheduleBinding).toBeGreaterThan(resultBinding);
    expect(repository.slice(scheduleBinding, scheduleBinding + 1200)).toContain(
      'await materializeLoserRefereeDuties',
    );
  });
});
