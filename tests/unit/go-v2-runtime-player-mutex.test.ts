import { describe, expect, it } from 'vitest';

import { assertGoV2RuntimePlayerMutex } from '../../web/lib/go-v2/live-operations';

const entryA = '11111111-1111-4111-8111-111111111111';
const entryB = '22222222-2222-4222-8222-222222222222';
const playerA = '33333333-3333-4333-8333-333333333333';
const playerB = '44444444-4444-4444-8444-444444444444';
const playerC = '99999999-9999-4999-8999-999999999999';
const playerD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function fakeClient(options: { shared?: boolean; missingIdentity?: boolean; conflict?: boolean } = {}) {
  const queries: string[] = [];
  return {
    queries,
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      queries.push(normalized);
      if (normalized.includes('FROM go_v2_entries') && normalized.includes('FOR UPDATE')) {
        return { rowCount: 2, rows: [{ id: entryA }, { id: entryB }] };
      }
      if (normalized.includes('count(*)::int AS tournament_count')) {
        return { rowCount: 1, rows: [{ tournament_count: options.shared === false ? 1 : 2 }] };
      }
      if (normalized.includes('LEFT JOIN go_v2_roster_revision_members member')) {
        return {
          rowCount: 4,
          rows: [
            { entry_id: entryA, member_order: 1, player_id: playerA },
            { entry_id: entryA, member_order: 2, player_id: playerB },
            { entry_id: entryB, member_order: 1, player_id: playerC },
            { entry_id: entryB, member_order: 2, player_id: options.missingIdentity ? null : playerD },
          ],
        };
      }
      if (normalized.includes('FROM players')) {
        return { rowCount: 4, rows: [{ id: playerA }, { id: playerB }, { id: playerC }, { id: playerD }] };
      }
      if (normalized.includes('FROM go_v2_schedule_versions version')) {
        return options.conflict
          ? {
              rowCount: 1,
              rows: [{
                match_id: '55555555-5555-4555-8555-555555555555',
                match_key: 'OTHER',
                play_state: 'paused',
                tournament_id: '66666666-6666-4666-8666-666666666666',
              }],
            }
          : { rowCount: 0, rows: [] };
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    },
  };
}

const input = {
  scheduleSessionId: '77777777-7777-4777-8777-777777777777',
  matchId: '88888888-8888-4888-8888-888888888888',
  participants: [{ entryId: entryA }, { entryId: entryB }],
};

describe('GO V2 runtime player mutex', () => {
  it('fails closed when a shared-session roster has no stable player identity', async () => {
    const client = fakeClient({ missingIdentity: true });
    await expect(assertGoV2RuntimePlayerMutex(client as never, input))
      .rejects.toMatchObject({ code: 'PLAYER_IDENTITY_REQUIRED_FOR_SHARED_SESSION' });
  });

  it('rejects a player already present in another live/paused match', async () => {
    const client = fakeClient({ conflict: true });
    await expect(assertGoV2RuntimePlayerMutex(client as never, input))
      .rejects.toMatchObject({ code: 'PLAYER_LANE_OCCUPIED' });
  });

  it('locks entries and players before accepting a free runtime lane', async () => {
    const client = fakeClient();
    await expect(assertGoV2RuntimePlayerMutex(client as never, input)).resolves.toBeUndefined();
    const entryLock = client.queries.findIndex((query) => query.includes('FROM go_v2_entries') && query.includes('FOR UPDATE'));
    const playerLock = client.queries.findIndex((query) => query.includes('FROM players') && query.includes('FOR UPDATE'));
    const conflictRead = client.queries.findIndex((query) => query.includes('FROM go_v2_schedule_versions version'));
    expect(entryLock).toBeGreaterThanOrEqual(0);
    expect(playerLock).toBeGreaterThan(entryLock);
    expect(conflictRead).toBeGreaterThan(playerLock);
  });
});
