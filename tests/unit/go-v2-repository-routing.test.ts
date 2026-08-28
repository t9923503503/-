import { describe, expect, it } from 'vitest';

import { resolveDownstreamSlots, resolveNoWinnerDownstreamSlots } from '../../web/lib/go-v2/repository';

interface FakeSlot {
  matchId: string;
  routeSourceType: 'MATCH_WINNER' | 'MATCH_LOSER';
  routeSourceMatchId: string;
  sourceType: 'MATCH_WINNER' | 'MATCH_LOSER' | 'BYE';
  sourceMatchId: string | null;
  resolvedEntryId: string | null;
}

function fakeRoutingClient(slots: FakeSlot[]) {
  return {
    async query(sql: string, params: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (
        normalized.startsWith('UPDATE go_v2_match_slot_sources')
        && normalized.includes("SET source_type = 'BYE'")
        && normalized.includes('WHERE route_source_match_id = $1')
        && normalized.includes("route_source_type IN ('MATCH_WINNER', 'MATCH_LOSER')")
      ) {
        const sourceMatchId = String(params[0]);
        const changed = slots.filter((slot) => slot.routeSourceMatchId === sourceMatchId);
        for (const slot of changed) {
          slot.sourceType = 'BYE';
          slot.sourceMatchId = null;
          slot.resolvedEntryId = null;
        }
        return { rowCount: changed.length, rows: changed.map((slot) => ({ match_id: slot.matchId })) };
      }

      if (
        normalized.startsWith('UPDATE go_v2_match_slot_sources')
        && normalized.includes('SET source_type = route_source_type')
        && normalized.includes('resolved_entry_id = CASE route_source_type')
      ) {
        const sourceMatchId = String(params[0]);
        const winnerEntryId = String(params[1]);
        const loserEntryId = String(params[2]);
        const changed = slots.filter((slot) => slot.routeSourceMatchId === sourceMatchId);
        for (const slot of changed) {
          slot.sourceType = slot.routeSourceType;
          slot.sourceMatchId = slot.routeSourceMatchId;
          slot.resolvedEntryId = slot.routeSourceType === 'MATCH_WINNER' ? winnerEntryId : loserEntryId;
        }
        return { rowCount: changed.length, rows: changed.map((slot) => ({ match_id: slot.matchId })) };
      }

      // Runtime-BYE propagation and withdrawn-team settlement are intentionally
      // empty in this focused fixture. The routed consumer ids are still
      // returned by the two UPDATE statements above.
      if (
        normalized.startsWith('SELECT match.play_state')
        || normalized.startsWith('SELECT match.id::text AS match_id')
        || normalized.startsWith('SELECT resolved_entry_id::text AS entry_id')
        || normalized.startsWith('UPDATE go_v2_matches conditional_match')
      ) {
        return { rowCount: 0, rows: [] };
      }

      throw new Error(`Unexpected routing query: ${normalized}`);
    },
  };
}

describe('GO V2 immutable route lineage', () => {
  it('rebinds MATCH_WINNER/MATCH_LOSER consumers after no-winner runtime BYEs', async () => {
    const slots: FakeSlot[] = [
      {
        matchId: 'winner-consumer',
        routeSourceType: 'MATCH_WINNER',
        routeSourceMatchId: 'trigger',
        sourceType: 'MATCH_WINNER',
        sourceMatchId: 'trigger',
        resolvedEntryId: 'old-winner',
      },
      {
        matchId: 'loser-consumer',
        routeSourceType: 'MATCH_LOSER',
        routeSourceMatchId: 'trigger',
        sourceType: 'MATCH_LOSER',
        sourceMatchId: 'trigger',
        resolvedEntryId: 'old-loser',
      },
    ];
    const client = fakeRoutingClient(slots);

    await resolveNoWinnerDownstreamSlots(client as never, 'trigger');
    expect(slots).toEqual([
      expect.objectContaining({ sourceType: 'BYE', sourceMatchId: null, resolvedEntryId: null }),
      expect.objectContaining({ sourceType: 'BYE', sourceMatchId: null, resolvedEntryId: null }),
    ]);

    const rebound = await resolveDownstreamSlots(client as never, 'trigger', 'new-winner', 'new-loser');
    expect(rebound).toEqual(['loser-consumer', 'winner-consumer']);
    expect(slots).toEqual([
      expect.objectContaining({
        sourceType: 'MATCH_WINNER',
        sourceMatchId: 'trigger',
        resolvedEntryId: 'new-winner',
      }),
      expect.objectContaining({
        sourceType: 'MATCH_LOSER',
        sourceMatchId: 'trigger',
        resolvedEntryId: 'new-loser',
      }),
    ]);
  });
});

