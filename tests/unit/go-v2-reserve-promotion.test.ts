import { describe, expect, it } from 'vitest';

import {
  planGoV2ReservePromotionSeeds,
  prepareReservePromotion,
} from '../../web/lib/go-v2/repository';

const reserveId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const tournamentId = '33333333-3333-4333-8333-333333333333';

function promotionClient(input: {
  lifecycleState: string;
  activeScheduleVersionId?: string | null;
  hasMatchActivity?: boolean;
  lockedCapacity?: number;
  target?: Record<string, unknown>;
  allEntries?: Array<Record<string, unknown>>;
  poolSlots?: Array<Record<string, unknown>>;
  matchSlots?: Array<Record<string, unknown>>;
}) {
  return {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT reserve.id::text')) {
        return {
          rowCount: 1,
          rows: [{
            id: reserveId,
            entry_no: 99,
            display_name: 'Reserve',
            registration_state: 'waitlist',
            attendance_state: 'unknown',
            rating_snapshot_value: 350,
            initial_seed: null,
            confirmed_at: new Date('2026-08-01T08:00:00.000Z'),
            current_roster_revision_id: 'reserve-roster',
            lifecycle_state: input.lifecycleState,
            active_schedule_version_id: input.activeScheduleVersionId ?? null,
            tournament_metadata: {
              formatTemplateId: 'lpv_groups_hl_se_v1',
              formatTemplateSnapshot: {
                schemaVersion: 2,
                templateVersion: 1,
                templateId: 'lpv_groups_hl_se_v1',
                teamCount: input.lockedCapacity ?? 7,
                snapshotHash: 'locked-format-hash',
              },
            },
          }],
        };
      }
      if (normalized.startsWith('SELECT member_order, player_id::text')) {
        return {
          rowCount: 2,
          rows: [
            { member_order: 1, player_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', display_name: 'R1', rating_value: 180 },
            { member_order: 2, player_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', display_name: 'R2', rating_value: 170 },
          ],
        };
      }
      if (normalized.startsWith('SELECT bool_or(match.play_state')) {
        return {
          rowCount: 1,
          rows: [{
            has_match_activity: input.hasMatchActivity === true,
            active_match_ids: input.hasMatchActivity ? ['match-live'] : [],
          }],
        };
      }
      if (normalized.startsWith('SELECT target.id::text')) {
        const target = input.target ?? {
          id: targetId,
          entry_no: 3,
          display_name: 'Target',
          registration_state: 'confirmed',
          attendance_state: 'no_show',
          rating_snapshot_value: 300,
          initial_seed: 3,
          current_roster_revision_id: 'target-roster',
        };
        return { rowCount: 1, rows: [target] };
      }
      if (normalized.startsWith('SELECT player_id::text')) {
        return {
          rowCount: 2,
          rows: [
            { player_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
            { player_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
          ],
        };
      }
      if (normalized.startsWith('SELECT assignment.pool_id::text')) {
        const rows = input.poolSlots ?? [];
        return { rowCount: rows.length, rows };
      }
      if (normalized.startsWith('SELECT source.match_id::text')) {
        const rows = input.matchSlots ?? [];
        return { rowCount: rows.length, rows };
      }
      if (normalized.startsWith('SELECT EXISTS ( SELECT 1 FROM go_v2_pool_assignments')) {
        return { rowCount: 1, rows: [{ already_slotted: false }] };
      }
      if (normalized.startsWith('SELECT DISTINCT entry.id::text')) {
        return { rowCount: 0, rows: [] };
      }
      if (normalized.startsWith('SELECT id::text, registration_state, rating_snapshot_value')) {
        const rows = input.allEntries ?? [
          { id: '00000000-0000-4000-8000-000000000001', registration_state: 'confirmed', rating_snapshot_value: 500, initial_seed: 1, confirmed_at: new Date('2026-08-01T07:00:00.000Z') },
          { id: '00000000-0000-4000-8000-000000000002', registration_state: 'confirmed', rating_snapshot_value: 400, initial_seed: 2, confirmed_at: new Date('2026-08-01T07:30:00.000Z') },
          { id: targetId, registration_state: 'confirmed', rating_snapshot_value: 300, initial_seed: 3, confirmed_at: new Date('2026-08-01T07:45:00.000Z') },
          { id: reserveId, registration_state: 'waitlist', rating_snapshot_value: 350, initial_seed: null, confirmed_at: new Date('2026-08-01T08:00:00.000Z') },
        ];
        return { rowCount: rows.length, rows };
      }
      if (normalized.startsWith('SELECT EXISTS ( SELECT 1 FROM go_v2_stages')) {
        return { rowCount: 1, rows: [{ has_structure: false }] };
      }
      throw new Error(`Unexpected reserve-promotion query: ${normalized}`);
    },
  };
}

describe('GO V2 reserve promotion', () => {
  it('deterministically reseeds a waitlisted entry by rating, confirmation time and stable id', () => {
    const result = planGoV2ReservePromotionSeeds([
      { entryId: 'b', registrationState: 'confirmed', ratingSnapshotValue: 100, initialSeed: 2, confirmedAt: '2026-08-01T08:00:00.000Z' },
      { entryId: 'a', registrationState: 'confirmed', ratingSnapshotValue: 100, initialSeed: 1, confirmedAt: '2026-08-01T08:00:00.000Z' },
      { entryId: 'reserve', registrationState: 'waitlist', ratingSnapshotValue: 200, initialSeed: null, confirmedAt: '2026-08-01T09:00:00.000Z' },
    ], 'reserve');
    expect(result.resultingSeeds).toEqual([
      { entryId: 'reserve', seed: 1 },
      { entryId: 'a', seed: 2 },
      { entryId: 'b', seed: 3 },
    ]);
  });

  it('fills a locked pre-draw vacancy without changing capacity and performs a full reseed', async () => {
    const allEntries = Array.from({ length: 6 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      registration_state: 'confirmed',
      rating_snapshot_value: 600 - index * 50,
      initial_seed: index + 1,
      confirmed_at: new Date(`2026-08-01T0${index}:00:00.000Z`),
    }));
    allEntries.push({
      id: reserveId,
      registration_state: 'waitlist',
      rating_snapshot_value: 350,
      initial_seed: null,
      confirmed_at: new Date('2026-08-01T08:00:00.000Z'),
    });
    const prepared = await prepareReservePromotion(promotionClient({
      lifecycleState: 'registration_locked',
      allEntries,
    }) as never, {
      tournamentId,
      reserveEntryId: reserveId,
      payload: {},
    });
    expect(prepared.risk).toBe('green');
    expect(prepared.candidate).toMatchObject({
      promotionMode: 'pre_draw_reseed',
      targetEntryId: null,
      requiresSuccessorSchedule: false,
      resultingFormatSnapshot: { teamCount: 7 },
      lockedCapacity: 7,
    });
    expect((prepared.impact.resultingEntriesSnapshot as { seeds: unknown[] }).seeds).toHaveLength(7);
    expect(prepared.impact).toMatchObject({
      lockedCapacity: 7,
      vacanciesBeforePromotion: 1,
      vacanciesAfterPromotion: 0,
    });
  });

  it('rejects a pre-draw promotion when the immutable registration quota is full', async () => {
    const allEntries = Array.from({ length: 7 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      registration_state: 'confirmed',
      rating_snapshot_value: 700 - index * 50,
      initial_seed: index + 1,
      confirmed_at: new Date(`2026-08-01T0${index}:00:00.000Z`),
    }));
    allEntries.push({
      id: reserveId,
      registration_state: 'waitlist',
      rating_snapshot_value: 350,
      initial_seed: null,
      confirmed_at: new Date('2026-08-01T08:00:00.000Z'),
    });

    await expect(prepareReservePromotion(promotionClient({
      lifecycleState: 'registration_locked',
      lockedCapacity: 7,
      allEntries,
    }) as never, {
      tournamentId,
      reserveEntryId: reserveId,
      payload: {},
    })).rejects.toMatchObject({
      code: 'NO_RESERVE_VACANCY',
      details: {
        lockedCapacity: 7,
        confirmedEntryCount: 7,
        requestedEntryCount: 8,
      },
    });
  });

  it('requires an explicit target after draw lock and rejects every promotion after match activity', async () => {
    await expect(prepareReservePromotion(promotionClient({
      lifecycleState: 'draw_locked',
    }) as never, {
      tournamentId,
      reserveEntryId: reserveId,
      payload: {},
    })).rejects.toMatchObject({ code: 'RESERVE_TARGET_REQUIRED_AFTER_DRAW' });

    await expect(prepareReservePromotion(promotionClient({
      lifecycleState: 'draw_locked',
      hasMatchActivity: true,
    }) as never, {
      tournamentId,
      reserveEntryId: reserveId,
      payload: { targetEntryId: targetId },
    })).rejects.toMatchObject({
      code: 'FULL_TEAM_PROMOTION_AFTER_START_FORBIDDEN',
      details: { activeMatchIds: ['match-live'] },
    });
  });

  it('preserves a no-show target seed and projects every exact pool/match slot replacement', async () => {
    const prepared = await prepareReservePromotion(promotionClient({
      lifecycleState: 'schedule_published',
      activeScheduleVersionId: '44444444-4444-4444-8444-444444444444',
      poolSlots: [{ pool_id: 'pool-a', slot_no: 3, source_seed: 3, stage_id: 'stage-a' }],
      matchSlots: [{
        match_id: 'match-a',
        slot_no: 1,
        source_type: 'ENTRY',
        source_entry_id: targetId,
        resolved_entry_id: targetId,
        resolution_version: 0,
      }],
    }) as never, {
      tournamentId,
      reserveEntryId: reserveId,
      payload: { targetEntryId: targetId },
    });
    expect(prepared.risk).toBe('amber');
    expect(prepared.candidate).toMatchObject({
      promotionMode: 'post_draw_slot_replace',
      targetEntryId: targetId,
      priorScheduleVersionId: '44444444-4444-4444-8444-444444444444',
      requiresSuccessorSchedule: true,
      resultingEntriesSnapshot: {
        reserve: { entryId: reserveId, registrationState: 'confirmed', initialSeed: 3 },
        target: { entryId: targetId, registrationState: 'withdrawn', initialSeed: null },
      },
    });
    expect(prepared.impact.slotDiff).toEqual([
      expect.objectContaining({ slotKind: 'POOL_ASSIGNMENT', slotNo: 3, toEntryId: reserveId }),
      expect.objectContaining({ slotKind: 'MATCH_SLOT', matchId: 'match-a', toEntryId: reserveId }),
    ]);
  });
});
