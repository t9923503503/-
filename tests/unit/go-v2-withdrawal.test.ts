import { describe, expect, it } from 'vitest';

import {
  GO_V2_WITHDRAWAL_CAUSES,
  deriveGoV2PairRating,
  prepareEntryWithdrawal,
  resolveGoV2WithdrawalCauseRule,
  sharesGoV2OriginalPairMember,
} from '../../web/lib/go-v2/repository';

function withdrawalClient(input: {
  matches: Array<Record<string, unknown>>;
  qualification?: Array<Record<string, unknown>>;
}) {
  return {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT id::text, registration_state, display_name')) {
        return { rowCount: 1, rows: [{ id: 'entry-a', registration_state: 'confirmed', display_name: 'A' }] };
      }
      if (normalized.startsWith('SELECT match.id::text AS match_id')) {
        return { rowCount: input.matches.length, rows: input.matches };
      }
      if (normalized.startsWith('SELECT qualification.id::text AS qualification_snapshot_id')) {
        const rows = input.qualification ?? [];
        return { rowCount: rows.length, rows };
      }
      if (normalized.startsWith('SELECT source_stage.id::text AS group_stage_id')) {
        return { rowCount: 0, rows: [] };
      }
      if (normalized.startsWith('WITH RECURSIVE affected AS')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'pool-match',
            play_state: 'pending',
            schedule_state: 'unscheduled',
            current_result_revision_no: 0,
            depth: 0,
          }],
        };
      }
      throw new Error(`Unexpected withdrawal query: ${normalized}`);
    },
  };
}

function poolMatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    match_id: 'pool-match',
    play_state: 'pending',
    schedule_state: 'unscheduled',
    current_result_revision_no: 0,
    stage_id: 'pool-stage',
    stage_type: 'round_robin_pool',
    stage_status: 'live',
    pool_id: 'pool-a',
    pool_capacity: 4,
    opponent_entry_id: 'entry-b',
    ...overrides,
  };
}

describe('GO V2 withdrawal cause rules', () => {
  it('derives the pair rating from exactly two members and ignores a supplied aggregate', () => {
    expect(deriveGoV2PairRating({
      ratingSnapshotValue: 9_999,
      members: [{ ratingValue: 100 }, { ratingValue: 100 }],
    })).toBe(200);
    expect(() => deriveGoV2PairRating({
      members: [{ ratingValue: 100 }],
    })).toThrowError(expect.objectContaining({ code: 'INVALID_PAIR_ROSTER' }));
  });

  it('prevents two sequential replacements from becoming a full team replacement', () => {
    const original = [
      { playerId: 'player-a', displayName: 'A' },
      { playerId: 'player-b', displayName: 'B' },
    ];
    const afterFirstReplacement = [
      { playerId: 'player-c', displayName: 'C' },
      { playerId: 'player-b', displayName: 'B' },
    ];
    const afterSecondReplacement = [
      { playerId: 'player-c', displayName: 'C' },
      { playerId: 'player-d', displayName: 'D' },
    ];

    expect(sharesGoV2OriginalPairMember(original, afterFirstReplacement)).toBe(true);
    expect(sharesGoV2OriginalPairMember(original, afterSecondReplacement)).toBe(false);
  });

  it('awards one FIVB match point only to medical future forfeits', () => {
    expect(resolveGoV2WithdrawalCauseRule('injury_before_match')).toMatchObject({
      registrationState: 'withdrawn',
      fivbLoserMatchPoints: 1,
      resultKind: 'forfeit',
    });
    expect(resolveGoV2WithdrawalCauseRule('medical_withdrawal')).toMatchObject({
      registrationState: 'withdrawn',
      fivbLoserMatchPoints: 1,
      resultKind: 'forfeit',
    });
  });

  it('keeps no-show, refusal and future game disqualification at zero match points', () => {
    expect(resolveGoV2WithdrawalCauseRule('no_show')).toMatchObject({
      fivbLoserMatchPoints: 0,
      resultKind: 'walkover',
    });
    expect(resolveGoV2WithdrawalCauseRule('refusal_to_play')).toMatchObject({
      fivbLoserMatchPoints: 0,
      resultKind: 'forfeit',
    });
    expect(resolveGoV2WithdrawalCauseRule('game_disqualification_future')).toMatchObject({
      registrationState: 'disqualified',
      fivbLoserMatchPoints: 0,
      resultKind: 'forfeit',
    });
  });

  it('marks anti-doping as a disqualification and rejects arbitrary or ambiguous causes', () => {
    expect(resolveGoV2WithdrawalCauseRule('anti_doping_disqualification')).toMatchObject({
      registrationState: 'disqualified',
      fivbLoserMatchPoints: 0,
    });
    expect(GO_V2_WITHDRAWAL_CAUSES).not.toContain('game_disqualification');
    expect(() => resolveGoV2WithdrawalCauseRule('game_disqualification')).toThrowError(
      expect.objectContaining({ code: 'INVALID_WITHDRAWAL_CAUSE' }),
    );
    expect(() => resolveGoV2WithdrawalCauseRule('free text')).toThrowError(
      expect.objectContaining({ code: 'INVALID_WITHDRAWAL_CAUSE' }),
    );
  });

  it('requires a dedicated cascade when an anti-doping pool rewrite reaches qualification', async () => {
    const client = withdrawalClient({
      matches: [poolMatch()],
      qualification: [{
        qualification_snapshot_id: 'qualification-1',
        source_stage_id: 'pool-stage',
      }],
    });

    await expect(prepareEntryWithdrawal(client as never, {
      tournamentId: 'tournament',
      entryId: 'entry-a',
      payload: {
        withdrawalStandingsPolicy: 'FIVB_2026_MATCH_LEDGER',
        withdrawalCause: 'anti_doping_disqualification',
      },
    })).rejects.toMatchObject({
      code: 'FIVB_ANTIDOPING_POOL_CASCADE_REQUIRED',
      details: expect.objectContaining({ requiredOperation: 'anti_doping_pool_cascade' }),
    });
  });

  it('rewrites an unfinished anti-doping pool but preserves the rank after the pool is finished', async () => {
    const unfinished = await prepareEntryWithdrawal(withdrawalClient({
      matches: [poolMatch()],
    }) as never, {
      tournamentId: 'tournament',
      entryId: 'entry-a',
      payload: {
        withdrawalStandingsPolicy: 'FIVB_2026_MATCH_LEDGER',
        withdrawalCause: 'anti_doping_disqualification',
      },
    });
    expect(unfinished.candidate).toMatchObject({
      registrationState: 'disqualified',
      preserveCompletedPoolRank: false,
      impact: {
        fivbAntiDopingPoolRewrite: true,
        affectedMatches: [expect.objectContaining({ action: 'fivb_anti_doping_forfeit' })],
      },
    });

    const finished = await prepareEntryWithdrawal(withdrawalClient({
      matches: [poolMatch({ play_state: 'final', stage_status: 'finished', current_result_revision_no: 1 })],
    }) as never, {
      tournamentId: 'tournament',
      entryId: 'entry-a',
      payload: {
        withdrawalStandingsPolicy: 'FIVB_2026_MATCH_LEDGER',
        withdrawalCause: 'anti_doping_disqualification',
      },
    });
    expect(finished.candidate).toMatchObject({
      registrationState: 'disqualified',
      preserveCompletedPoolRank: true,
      impact: {
        fivbAntiDopingPoolRewrite: false,
        playedResultsPreserved: true,
        affectedMatches: [expect.objectContaining({ action: 'preserve' })],
      },
    });
  });
});
