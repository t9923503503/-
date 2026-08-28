import { describe, expect, it } from 'vitest';

import {
  deriveGoV2StageProgress,
  reconcileGoV2TournamentProgress,
} from '../../web/lib/go-v2/repository';

function match(overrides: Partial<{
  matchId: string;
  playState: string;
  currentResultRevisionNo: number;
  isConditional: boolean;
  conditionState: string;
  metadata: Record<string, unknown>;
}> = {}) {
  return {
    matchId: overrides.matchId ?? 'match-1',
    playState: overrides.playState ?? 'pending',
    currentResultRevisionNo: overrides.currentResultRevisionNo ?? 0,
    isConditional: overrides.isConditional ?? false,
    conditionState: overrides.conditionState ?? 'not_applicable',
    metadata: overrides.metadata ?? {},
  };
}

describe('GO V2 lifecycle derivation', () => {
  it('moves a locked stage to live after the first real result while a required match remains', () => {
    const progress = deriveGoV2StageProgress({
      stageId: 'stage',
      stageKey: 'groups',
      stageType: 'round_robin_pool',
      status: 'locked',
      matches: [
        match({ matchId: 'done', playState: 'final', currentResultRevisionNo: 1 }),
        match({ matchId: 'pending' }),
      ],
    });

    expect(progress).toMatchObject({
      status: 'live',
      complete: false,
      hasStarted: true,
      requiredMatchCount: 2,
      completedRequiredMatchCount: 1,
      pendingRequiredMatchIds: ['pending'],
    });
  });

  it('finishes with a result-less runtime BYE and ignores a condition-false reset final', () => {
    const progress = deriveGoV2StageProgress({
      stageId: 'stage',
      stageKey: 'hard-de',
      stageType: 'double_elimination',
      status: 'live',
      matches: [
        match({ matchId: 'gf1', playState: 'final', currentResultRevisionNo: 7 }),
        match({
          matchId: 'bye',
          playState: 'final',
          metadata: { byeAutoAdvance: true },
        }),
        match({
          matchId: 'gf2',
          isConditional: true,
          conditionState: 'false',
        }),
      ],
    });

    expect(progress).toMatchObject({
      status: 'finished',
      complete: true,
      matchCount: 3,
      requiredMatchCount: 2,
      completedRequiredMatchCount: 2,
      pendingRequiredMatchIds: [],
    });
  });

  it('keeps an unresolved reset final and any reopened required match live', () => {
    const unresolvedReset = deriveGoV2StageProgress({
      stageId: 'stage',
      stageKey: 'hard-de',
      stageType: 'double_elimination',
      status: 'live',
      matches: [
        match({ matchId: 'gf1', playState: 'final', currentResultRevisionNo: 2 }),
        match({ matchId: 'gf2', isConditional: true, conditionState: 'pending' }),
      ],
    });
    expect(unresolvedReset).toMatchObject({
      status: 'live',
      complete: false,
      pendingRequiredMatchIds: ['gf2'],
    });

    const reopened = deriveGoV2StageProgress({
      stageId: 'stage',
      stageKey: 'hard-de',
      stageType: 'double_elimination',
      status: 'finished',
      matches: [match({ matchId: 'replay' })],
    });
    expect(reopened).toMatchObject({ status: 'live', complete: false, hasStarted: false });
  });

  it('does not mark a placeholder stage with no matches as complete', () => {
    const progress = deriveGoV2StageProgress({
      stageId: 'stage',
      stageKey: 'tier-split',
      stageType: 'tier_split',
      status: 'locked',
      matches: [],
    });
    expect(progress).toMatchObject({ status: 'locked', complete: false, matchCount: 0 });
  });
});

interface FakeStage {
  id: string;
  key: string;
  type: string;
  status: string;
}

interface FakeMatch {
  id: string;
  stageId: string;
  playState: string;
  resultNo: number;
  conditional?: boolean;
  conditionState?: string;
  metadata?: Record<string, unknown>;
}

function progressClient(
  initialLifecycle: string,
  stages: FakeStage[],
  matches: FakeMatch[],
) {
  const state = { lifecycle: initialLifecycle };
  return {
    state,
    stages,
    async query(sql: string, params: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT lifecycle_state FROM go_v2_tournament_state')) {
        return { rowCount: 1, rows: [{ lifecycle_state: state.lifecycle }] };
      }
      if (normalized.startsWith('SELECT id::text AS stage_id, stage_key')) {
        return {
          rowCount: stages.length,
          rows: stages.map((stage) => ({
            stage_id: stage.id,
            stage_key: stage.key,
            stage_type: stage.type,
            status: stage.status,
          })),
        };
      }
      if (normalized.startsWith('SELECT id::text AS match_id, stage_id::text')) {
        return {
          rowCount: matches.length,
          rows: matches.map((entry) => ({
            match_id: entry.id,
            stage_id: entry.stageId,
            play_state: entry.playState,
            current_result_revision_no: entry.resultNo,
            is_conditional: entry.conditional === true,
            condition_state: entry.conditionState ?? 'not_applicable',
            metadata: entry.metadata ?? {},
          })),
        };
      }
      if (normalized.startsWith('UPDATE go_v2_stages SET status = $2')) {
        const stage = stages.find((entry) => entry.id === String(params[0]));
        if (stage) stage.status = String(params[1]);
        return { rowCount: stage ? 1 : 0, rows: [] };
      }
      if (normalized.startsWith('UPDATE go_v2_tournament_state SET lifecycle_state = $2')) {
        state.lifecycle = String(params[1]);
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected progress query: ${normalized}`);
    },
  };
}

describe('GO V2 lifecycle reconciliation', () => {
  it('finishes only after every match-bearing stage is complete and a playoff exists', async () => {
    const stages: FakeStage[] = [
      { id: 'groups', key: 'groups', type: 'round_robin_pool', status: 'live' },
      { id: 'split', key: 'split', type: 'tier_split', status: 'locked' },
      { id: 'playoff', key: 'hard', type: 'double_elimination', status: 'live' },
    ];
    const client = progressClient('live', stages, [
      { id: 'group-1', stageId: 'groups', playState: 'final', resultNo: 1 },
      { id: 'gf1', stageId: 'playoff', playState: 'final', resultNo: 2 },
      {
        id: 'gf2',
        stageId: 'playoff',
        playState: 'pending',
        resultNo: 0,
        conditional: true,
        conditionState: 'false',
      },
    ]);

    const progress = await reconcileGoV2TournamentProgress(client as never, 'tournament');
    expect(progress).toMatchObject({
      previousLifecycleState: 'live',
      lifecycleState: 'finished',
      lifecycleChanged: true,
      reopened: false,
      hasMatchBearingPlayoff: true,
      allMatchBearingStagesComplete: true,
    });
    expect(client.state.lifecycle).toBe('finished');
    expect(stages.map((stage) => [stage.key, stage.status])).toEqual([
      ['groups', 'finished'],
      ['split', 'locked'],
      ['hard', 'finished'],
    ]);
  });

  it('reopens a finished tournament when an approved cascade restores a pending match', async () => {
    const stages: FakeStage[] = [
      { id: 'playoff', key: 'hard', type: 'single_elimination', status: 'finished' },
    ];
    const client = progressClient('finished', stages, [
      { id: 'final', stageId: 'playoff', playState: 'pending', resultNo: 0 },
    ]);

    const progress = await reconcileGoV2TournamentProgress(client as never, 'tournament');
    expect(progress).toMatchObject({
      previousLifecycleState: 'finished',
      lifecycleState: 'live',
      lifecycleChanged: true,
      reopened: true,
      allMatchBearingStagesComplete: false,
    });
    expect(client.state.lifecycle).toBe('live');
    expect(stages[0].status).toBe('live');
  });

  it('does not finish without a match-bearing playoff or while any required stage match is pending', async () => {
    const groupOnly = progressClient(
      'live',
      [{ id: 'groups', key: 'groups', type: 'round_robin_pool', status: 'live' }],
      [{ id: 'group-1', stageId: 'groups', playState: 'final', resultNo: 1 }],
    );
    const groupOnlyProgress = await reconcileGoV2TournamentProgress(groupOnly as never, 'tournament');
    expect(groupOnlyProgress).toMatchObject({
      lifecycleState: 'live',
      hasMatchBearingPlayoff: false,
      allMatchBearingStagesComplete: true,
    });

    const pendingGroup = progressClient(
      'live',
      [
        { id: 'groups', key: 'groups', type: 'round_robin_pool', status: 'live' },
        { id: 'playoff', key: 'hard', type: 'single_elimination', status: 'live' },
      ],
      [
        { id: 'group-1', stageId: 'groups', playState: 'pending', resultNo: 0 },
        { id: 'final', stageId: 'playoff', playState: 'final', resultNo: 2 },
      ],
    );
    const pendingGroupProgress = await reconcileGoV2TournamentProgress(pendingGroup as never, 'tournament');
    expect(pendingGroupProgress).toMatchObject({
      lifecycleState: 'live',
      hasMatchBearingPlayoff: true,
      allMatchBearingStagesComplete: false,
    });
  });
});
