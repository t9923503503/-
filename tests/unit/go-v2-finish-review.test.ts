import { describe, expect, it, vi } from 'vitest';

import { persistGoV2FinishReviewDecision } from '../../web/lib/go-v2/live-operations';

const TOURNAMENT_ID = '11111111-1111-4111-8111-111111111111';
const MATCH_ID = '22222222-2222-4222-8222-222222222222';
const TEAM_A = '33333333-3333-4333-8333-333333333333';
const TEAM_B = '44444444-4444-4444-8444-444444444444';

function finishClient(input: {
  playState?: string;
  commandVersion?: number;
  finishRequested?: boolean;
  liveScore?: Record<string, unknown>;
  teamBTournamentId?: string;
} = {}) {
  const state = {
    playState: input.playState ?? 'live',
    commandVersion: input.commandVersion ?? 5,
    finishRequested: input.finishRequested ?? true,
    liveScore: input.liveScore ?? {
      currentSet: 2,
      points: { a: 0, b: 0 },
      sets: [{ a: 21, b: 17 }],
    },
  };
  const writes: string[] = [];
  return {
    state,
    writes,
    async query(sql: string, params: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT match.id::text, match.play_state')) {
        return {
          rowCount: 1,
          rows: [{
            id: MATCH_ID,
            play_state: state.playState,
            schedule_state: 'locked',
            current_result_revision_no: 0,
            match_rule: 'single_21',
            assignment_id: '55555555-5555-4555-8555-555555555555',
          }],
        };
      }
      if (normalized.startsWith('SELECT command_version, live_score, finish_requested')) {
        return {
          rowCount: 1,
          rows: [{
            command_version: state.commandVersion,
            live_score: state.liveScore,
            finish_requested: state.finishRequested,
          }],
        };
      }
      if (normalized.startsWith('SELECT source.slot_no, source.source_type')) {
        return {
          rowCount: 2,
          rows: [
            {
              slot_no: 1,
              source_type: 'ENTRY',
              route_source_type: 'ENTRY',
              route_source_match_id: null,
              entry_id: TEAM_A,
              display_name: 'A',
              entry_tournament_id: TOURNAMENT_ID,
              registration_state: 'confirmed',
              attendance_state: 'checked_in',
              predecessor_play_state: null,
            },
            {
              slot_no: 2,
              source_type: 'ENTRY',
              route_source_type: 'ENTRY',
              route_source_match_id: null,
              entry_id: TEAM_B,
              display_name: 'B',
              entry_tournament_id: input.teamBTournamentId ?? TOURNAMENT_ID,
              registration_state: 'confirmed',
              attendance_state: 'checked_in',
              predecessor_play_state: null,
            },
          ],
        };
      }
      if (normalized.startsWith('UPDATE go_v2_schedule_assignments')) {
        writes.push('actual_end');
        expect(params).toEqual(['55555555-5555-4555-8555-555555555555', MATCH_ID]);
        return { rowCount: 1, rows: [{ actual_end: new Date('2026-08-27T12:00:00.000Z') }] };
      }
      if (normalized.startsWith('UPDATE go_v2_live_match_state')) {
        if (state.commandVersion !== Number(params[1]) || !state.finishRequested) {
          return { rowCount: 0, rows: [] };
        }
        writes.push('finish_request_cleared');
        state.commandVersion += 1;
        state.finishRequested = false;
        return {
          rowCount: 1,
          rows: [{ command_version: state.commandVersion, live_score: state.liveScore }],
        };
      }
      if (normalized.startsWith('UPDATE go_v2_match_court_segments')) {
        writes.push('court_segment_closed');
        expect(params[0]).toBe(MATCH_ID);
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected finish review query: ${normalized}`);
    },
  };
}

function acceptDependencies() {
  const prepare = vi.fn(async (_client, input: { payload: Record<string, unknown> }) => ({
    payload: {
      ...input.payload,
      resultKind: 'played',
      declaredResult: input.payload.actualScore,
      winnerEntryId: TEAM_A,
      loserEntryId: TEAM_B,
      previousResultRevisionNo: 0,
      standingContributions: [],
    },
    impact: { triggerMatchId: MATCH_ID, risk: 'green', affectedMatches: [] },
  }));
  const append = vi.fn(async () => ({
    resultRevisionId: '66666666-6666-4666-8666-666666666666',
    revisionNo: 1,
    previousResultRevisionId: null,
    resolvedRefereeDutyIds: ['77777777-7777-4777-8777-777777777777'],
  }));
  const route = vi.fn(async () => ['88888888-8888-4888-8888-888888888888']);
  return { prepare, append, route };
}

describe('GO V2 director finish review', () => {
  it('accepts only the locked server score and derives winner, result revision and routes', async () => {
    const client = finishClient();
    const dependencies = acceptDependencies();
    const result = await persistGoV2FinishReviewDecision(client as never, {
      tournamentId: TOURNAMENT_ID,
      matchId: MATCH_ID,
      decision: 'accept',
      finishRequestVersion: 5,
      actorId: 'director-user',
      reasonCode: 'admin_override',
      reasonNote: 'Score checked on court',
    }, {
      preparePlayedResultPayload: dependencies.prepare as never,
      appendResultRevision: dependencies.append as never,
      resolveDownstreamSlots: dependencies.route as never,
    });

    expect(dependencies.prepare).toHaveBeenCalledWith(client, expect.objectContaining({
      tournamentId: TOURNAMENT_ID,
      matchId: MATCH_ID,
      payload: expect.objectContaining({
        actualScore: { sets: [{ setNo: 1, teamA: 21, teamB: 17 }] },
        evidence: expect.objectContaining({ source: 'judge_finish_request', judgeCommandVersion: 5 }),
      }),
    }));
    expect(dependencies.append).toHaveBeenCalledOnce();
    expect(dependencies.route).toHaveBeenCalledWith(
      client,
      MATCH_ID,
      TEAM_A,
      TEAM_B,
      expect.objectContaining({ actorId: 'director-user' }),
    );
    expect(result).toMatchObject({
      decision: 'accept',
      resultKind: 'played',
      winnerEntryId: TEAM_A,
      loserEntryId: TEAM_B,
      playState: 'final',
      actualEnd: '2026-08-27T12:00:00.000Z',
      resultingJudgeCommandVersion: 6,
      finishReviewRequired: false,
    });
    expect(client.writes).toEqual(['actual_end', 'finish_request_cleared', 'court_segment_closed']);
  });

  it('rejects without changing the score or match play state and invalidates stale offline judge edits', async () => {
    const client = finishClient({ playState: 'paused' });
    const dependencies = acceptDependencies();
    const result = await persistGoV2FinishReviewDecision(client as never, {
      tournamentId: TOURNAMENT_ID,
      matchId: MATCH_ID,
      decision: 'reject',
      finishRequestVersion: 5,
      actorId: 'director-user',
      reasonCode: 'admin_override',
      reasonNote: 'Wrong side entered',
    }, {
      preparePlayedResultPayload: dependencies.prepare as never,
      appendResultRevision: dependencies.append as never,
      resolveDownstreamSlots: dependencies.route as never,
    });

    expect(result).toMatchObject({
      decision: 'reject',
      playState: 'paused',
      scorePreserved: true,
      liveScore: client.state.liveScore,
      resultingJudgeCommandVersion: 6,
    });
    expect(dependencies.prepare).not.toHaveBeenCalled();
    expect(client.writes).toEqual(['finish_request_cleared']);

    await expect(persistGoV2FinishReviewDecision(client as never, {
      tournamentId: TOURNAMENT_ID,
      matchId: MATCH_ID,
      decision: 'reject',
      finishRequestVersion: 5,
      actorId: 'director-user',
      reasonCode: 'admin_override',
    })).rejects.toMatchObject({ code: 'FINISH_REVIEW_VERSION_CONFLICT' });
  });

  it('rejects a stale review CAS before applying either director decision', async () => {
    const client = finishClient({ commandVersion: 9 });
    await expect(persistGoV2FinishReviewDecision(client as never, {
      tournamentId: TOURNAMENT_ID,
      matchId: MATCH_ID,
      decision: 'accept',
      finishRequestVersion: 8,
      actorId: 'director-user',
      reasonCode: 'admin_override',
    })).rejects.toMatchObject({
      code: 'FINISH_REVIEW_VERSION_CONFLICT',
      details: { expectedVersion: 8, actualVersion: 9 },
    });
    expect(client.writes).toEqual([]);
  });

  it('refuses acceptance when the authoritative server score is not finished', async () => {
    const client = finishClient({
      liveScore: {
        currentSet: 1,
        points: { a: 20, b: 19 },
        sets: [],
      },
    });
    await expect(persistGoV2FinishReviewDecision(client as never, {
      tournamentId: TOURNAMENT_ID,
      matchId: MATCH_ID,
      decision: 'accept',
      finishRequestVersion: 5,
      actorId: 'director-user',
      reasonCode: 'admin_override',
    })).rejects.toMatchObject({ code: 'MATCH_SCORE_INCOMPLETE' });
    expect(client.writes).toEqual([]);
  });

  it('refuses acceptance if a routed participant no longer belongs to the match tournament', async () => {
    const client = finishClient({
      teamBTournamentId: '99999999-9999-4999-8999-999999999999',
    });
    await expect(persistGoV2FinishReviewDecision(client as never, {
      tournamentId: TOURNAMENT_ID,
      matchId: MATCH_ID,
      decision: 'accept',
      finishRequestVersion: 5,
      actorId: 'director-user',
      reasonCode: 'admin_override',
    })).rejects.toMatchObject({ code: 'MATCH_PARTICIPANTS_UNRESOLVED' });
    expect(client.writes).toEqual([]);
  });
});
