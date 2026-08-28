import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildCompetitionTierPipeline,
  type LockedRoundRobinPool,
} from '../../web/lib/go-v2/competition';
import type { StandingContribution } from '../../web/lib/go-v2/core';
import {
  assessDownstreamImpact,
  buildQualificationCascadeTopologyPlan,
  persistRetainedQualificationCorrectionSnapshots,
  previewCompensatingUndo,
  type CompetitionTierSource,
} from '../../web/lib/go-v2/repository';
import {
  buildLockedQualificationCorrectionProjection,
} from '../../web/lib/go-v2/service';

function contribution(
  matchId: string,
  teamId: string,
  opponentId: string,
  won: boolean,
): StandingContribution {
  return {
    matchId,
    teamId,
    opponentId,
    matchPoints: won ? 2 : 0,
    setsFor: won ? 1 : 0,
    setsAgainst: won ? 0 : 1,
    pointsFor: won ? 21 : 15,
    pointsAgainst: won ? 15 : 21,
  };
}

function roundRobinPool(
  poolId: string,
  entryIds: readonly [string, string, string],
  firstSeed: number,
  winners: Readonly<Record<string, string>>,
): LockedRoundRobinPool {
  const ledger = new Map(entryIds.map((entryId) => [entryId, [] as StandingContribution[]]));
  for (let left = 0; left < entryIds.length; left += 1) {
    for (let right = left + 1; right < entryIds.length; right += 1) {
      const teamA = entryIds[left];
      const teamB = entryIds[right];
      const matchId = `${poolId}-${teamA}-${teamB}`;
      const winner = winners[matchId];
      if (winner !== teamA && winner !== teamB) throw new Error(`Missing winner for ${matchId}`);
      ledger.get(teamA)?.push(contribution(matchId, teamA, teamB, winner === teamA));
      ledger.get(teamB)?.push(contribution(matchId, teamB, teamA, winner === teamB));
    }
  }
  return {
    poolId,
    poolSize: 3,
    locked: true,
    format: 'round_robin_pool',
    entries: entryIds.map((entryId, index) => ({
      entryId,
      initialSeed: firstSeed + index,
      ledger: ledger.get(entryId) ?? [],
    })),
  };
}

function correctionSource(poolAWinnerOfBC: 'B' | 'C'): CompetitionTierSource {
  return {
    groupStageId: 'group-stage',
    format: 'round_robin_pool',
    pools: [
      roundRobinPool('pool-a', ['A', 'B', 'C'], 1, {
        'pool-a-A-B': 'A',
        'pool-a-A-C': 'A',
        'pool-a-B-C': poolAWinnerOfBC,
      }),
      roundRobinPool('pool-b', ['D', 'E', 'F'], 4, {
        'pool-b-D-E': 'D',
        'pool-b-D-F': 'D',
        'pool-b-E-F': 'E',
      }),
    ],
    formatSnapshot: {},
    rankingRulesSnapshot: { internalMatchPointsMode: 'total' },
    targetStages: {},
    resultRevisionIds: ['revision-a', 'revision-b'],
  };
}

describe('GO V2 locked qualification correction projection', () => {
  it('reports authoritative standing and qualification changes without rewriting the frozen before snapshot', () => {
    const beforeSource = correctionSource('B');
    const beforePipeline = buildCompetitionTierPipeline({
      pools: beforeSource.pools,
      tierQuotas: { hard: 4, medium: 0, light: 2 },
      internalMatchPointsMode: 'total',
    });
    const frozenBefore = {
      standingRows: structuredClone(beforePipeline.standingRows),
      qualificationRows: structuredClone(beforePipeline.qualificationRows),
    };

    const projection = buildLockedQualificationCorrectionProjection(
      correctionSource('C'),
      { quotas: beforePipeline.quotas },
      frozenBefore,
    );

    expect(projection.after.pipelineHash).toMatch(/^[0-9a-f]{64}$/);
    expect(projection.after.quotas).toEqual(beforePipeline.quotas);
    expect(projection.changes.qualificationChanged).toBe(true);
    expect(projection.changes.standingRows).toEqual(expect.arrayContaining([
      { entryId: 'B', before: { poolRank: 2 }, after: { poolRank: 3 } },
      { entryId: 'C', before: { poolRank: 3 }, after: { poolRank: 2 } },
    ]));
    expect(projection.changes.qualificationRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entryId: 'B',
        before: expect.objectContaining({ tier: 'hard' }),
        after: expect.objectContaining({ tier: 'light' }),
      }),
      expect.objectContaining({
        entryId: 'C',
        before: expect.objectContaining({ tier: 'light' }),
        after: expect.objectContaining({ tier: 'hard' }),
      }),
    ]));
    expect(frozenBefore).toEqual({
      standingRows: beforePipeline.standingRows,
      qualificationRows: beforePipeline.qualificationRows,
    });
  });
});

function impactClient(stageType: 'single_elimination' | 'placement_match' = 'single_elimination') {
  return {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT source_stage.id::text AS group_stage_id')) {
        return {
          rowCount: 1,
          rows: [{
            group_stage_id: 'groups',
            qualification_snapshot_id: 'qualification-before',
            standing_snapshot_id: 'standing-before',
            rules_snapshot: { quotas: { mode: 'two', hard: 4, medium: 0, light: 2 } },
          }],
        };
      }
      if (normalized.startsWith('WITH RECURSIVE affected AS')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'group-match',
            stage_id: 'groups',
            play_state: 'final',
            schedule_state: 'completed',
            current_result_revision_no: 1,
            depth: 0,
          }],
        };
      }
      if (
        normalized.startsWith("SELECT jsonb_build_object( 'entryId', row.entry_id, 'poolId', row.pool_id")
        && normalized.includes('FROM go_v2_standing_snapshot_rows')
      ) {
        return {
          rowCount: 1,
          rows: [{ value: { entryId: 'A', poolId: 'pool-a', poolRank: 1 } }],
        };
      }
      if (normalized.includes('FROM go_v2_qualification_snapshot_rows row')) {
        return {
          rowCount: 1,
          rows: [{ value: { entryId: 'A', tier: 'hard', tierSeed: 1, poolId: 'pool-a', poolRank: 1 } }],
        };
      }
      if (normalized.startsWith('SELECT stage.id::text AS stage_id')) {
        return {
          rowCount: 2,
          rows: [
            {
              stage_id: 'hard-stage',
              stage_key: 'hard_playoff',
              stage_type: stageType,
              tier: 'hard',
              stage_status: 'live',
              match_id: 'hard-r1',
              play_state: 'ready',
              schedule_state: 'scheduled',
              current_result_revision_no: 0,
              schedule_assignment_id: 'assignment-1',
            },
            {
              stage_id: 'hard-stage',
              stage_key: 'hard_playoff',
              stage_type: stageType,
              tier: 'hard',
              stage_status: 'live',
              match_id: 'hard-final',
              play_state: 'final',
              schedule_state: 'completed',
              current_result_revision_no: 2,
              schedule_assignment_id: null,
            },
          ],
        };
      }
      if (normalized.startsWith('SELECT version.id::text AS schedule_version_id')) {
        return { rowCount: 0, rows: [] };
      }
      throw new Error(`Unexpected impact query: ${normalized}`);
    },
  };
}

describe('GO V2 locked qualification correction impact', () => {
  it('includes ENTRY-seeded playoff matches and exposes the atomic cascade capability', async () => {
    const impact = await assessDownstreamImpact(
      impactClient() as never,
      'tournament',
      'group-match',
    );

    expect(impact.risk).toBe('red');
    expect(impact.affectedMatches.map((match) => match.matchId)).toEqual(['hard-final', 'hard-r1']);
    expect(impact.qualificationCorrection).toMatchObject({
      groupStageId: 'groups',
      standingSnapshotId: 'standing-before',
      qualificationSnapshotId: 'qualification-before',
      before: {
        standingRows: [{ entryId: 'A', poolId: 'pool-a', poolRank: 1 }],
        qualificationRows: [{ entryId: 'A', tier: 'hard', tierSeed: 1, poolId: 'pool-a', poolRank: 1 }],
      },
      capabilities: {
        cascadeVoidAndReplay: {
          available: true,
          requiresAtomicRematerialization: true,
          requiresAtomicScheduleReplan: true,
        },
        retainProgressionOverride: {
          available: true,
          requiredRole: 'admin',
          preservesBracketParticipants: true,
        },
      },
    });
    expect(impact.qualificationCorrection?.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining([
        'QUALIFICATION_DOWNSTREAM_PROGRESS_LOCKED',
      ]),
    );
    expect(impact.qualificationCorrection?.blockers.map((blocker) => blocker.code)).not.toContain(
      'QUALIFICATION_CASCADE_REMATERIALIZATION_NOT_AVAILABLE_V1',
    );
  });

  it('fails closed for a materialized placement strategy until its ENTRY rebind is implemented', async () => {
    const impact = await assessDownstreamImpact(
      impactClient('placement_match') as never,
      'tournament',
      'group-match',
    );

    expect(impact.qualificationCorrection?.capabilities.cascadeVoidAndReplay.available).toBe(false);
    expect(impact.qualificationCorrection?.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'QUALIFICATION_CASCADE_PLACEMENT_STRATEGY_UNSUPPORTED',
        stageId: 'hard-stage',
      }),
    ]));
  });
});

describe('GO V2 qualification cascade topology rebind', () => {
  const currentStages = [{
    stageId: 'hard-stage-id',
    stageKey: 'hard_playoff',
    tier: 'hard',
    stageType: 'single_elimination',
    configuration: {
      capacity: 2,
      templateVersion: 'lpv_se_v1',
      bronzeEnabled: false,
      resetFinalEnabled: false,
      topologyHash: 'prior-participant-bound-hash',
    },
    matches: [{
      matchId: 'hard-final-id',
      matchKey: 'U1-M1',
      phase: 'upper',
      round: 1,
      position: 1,
      conditional: false,
      slots: [
        {
          slotNo: 1,
          routeSourceType: 'ENTRY',
          routeSourceMatchKey: null,
          sourceEntryId: 'A',
          resolvedEntryId: 'A',
        },
        {
          slotNo: 2,
          routeSourceType: 'ENTRY',
          routeSourceMatchKey: null,
          sourceEntryId: 'B',
          resolvedEntryId: 'B',
        },
      ],
    }],
  }];

  function bracket(firstEntryId: string) {
    return [{
      tier: 'hard',
      stageKey: 'hard_playoff',
      bracketType: 'single_elimination',
      bronzeEnabled: false,
      resetFinalEnabled: false,
      participants: [
        { entryId: firstEntryId, seed: 1 },
        { entryId: 'B', seed: 2 },
      ],
      topology: {
        kind: 'single_elimination',
        participantCount: 2,
        capacity: 2,
        templateVersion: 'lpv_se_v1',
        topologyHash: `participant-hash-${firstEntryId}`,
        matches: [{
          matchId: 'U1-M1',
          phase: 'upper',
          round: 1,
          position: 1,
          conditional: false,
          sourceA: { kind: 'ENTRY', entryId: firstEntryId },
          sourceB: { kind: 'ENTRY', entryId: 'B' },
        }],
      },
    }];
  }

  it('keeps frozen coordinates and UUIDs while rebinding only direct ENTRY slots', () => {
    const before = buildQualificationCascadeTopologyPlan(currentStages, bracket('A'));
    const after = buildQualificationCascadeTopologyPlan(currentStages, bracket('C'));

    expect(after.topologyShapeHash).toBe(before.topologyShapeHash);
    expect(after.slotBindingHash).not.toBe(before.slotBindingHash);
    expect(after.affectedMatchIds).toEqual(['hard-final-id']);
    expect(after.slotChanges).toEqual([{
      stageId: 'hard-stage-id',
      matchId: 'hard-final-id',
      matchKey: 'U1-M1',
      slotNo: 1,
      priorEntryId: 'A',
      nextEntryId: 'C',
    }]);
    expect(after.stages[0]).toMatchObject({
      stageId: 'hard-stage-id',
      priorTopologyHash: 'prior-participant-bound-hash',
      topologyHash: 'participant-hash-C',
      participantSeeds: [{ entryId: 'C', seed: 1 }, { entryId: 'B', seed: 2 }],
    });
  });

  it('fails closed when a frozen coordinate or MATCH route changes', () => {
    const incompatible = bracket('C');
    const topology = incompatible[0].topology;
    topology.matches[0] = {
      ...topology.matches[0],
      position: 2,
    };

    expect(() => buildQualificationCascadeTopologyPlan(currentStages, incompatible))
      .toThrowError(expect.objectContaining({ code: 'QUALIFICATION_CASCADE_TOPOLOGY_MISMATCH' }));
  });
});

function retainedSnapshotClient(expectedRowCount: number) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    async query(sql: string, params: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      if (normalized.startsWith('SELECT qualification.rules_snapshot')) {
        return {
          rowCount: 1,
          rows: [{
            rules_snapshot: { quotas: { mode: 'two', hard: 4, medium: 0, light: 2 } },
            qualification_row_count: expectedRowCount,
          }],
        };
      }
      if (normalized.startsWith('SELECT entry_id::text AS entry_id, seed')) {
        return {
          rowCount: expectedRowCount,
          rows: Array.from({ length: expectedRowCount }, (_, index) => ({
            entry_id: String.fromCharCode('A'.charCodeAt(0) + index),
            seed: index + 1,
          })),
        };
      }
      if (normalized.startsWith('INSERT INTO go_v2_standing_snapshots')) {
        return { rowCount: 1, rows: [{ id: 'standing-after' }] };
      }
      if (normalized.startsWith('INSERT INTO go_v2_standing_snapshot_rows')) {
        return { rowCount: 1, rows: [] };
      }
      if (normalized.startsWith('INSERT INTO go_v2_qualification_snapshots')) {
        return { rowCount: 1, rows: [{ id: 'qualification-after' }] };
      }
      if (normalized.startsWith('INSERT INTO go_v2_qualification_snapshot_rows')) {
        return { rowCount: expectedRowCount, rows: [] };
      }
      throw new Error(`Unexpected retained-snapshot query: ${normalized}`);
    },
  };
}

describe('GO V2 retain-progression correction persistence', () => {
  it('appends corrected standings and a copied qualification snapshot without mutating matches or brackets', async () => {
    const source = correctionSource('C');
    const pipeline = buildCompetitionTierPipeline({
      pools: source.pools,
      tierQuotas: { hard: 4, medium: 0, light: 2 },
      internalMatchPointsMode: 'total',
    });
    const client = retainedSnapshotClient(pipeline.standingRows.length);

    const lineage = await persistRetainedQualificationCorrectionSnapshots(client as never, {
      tournamentId: 'tournament',
      aggregateVersion: 19,
      groupStageId: 'groups',
      priorStandingSnapshotId: 'standing-before',
      priorQualificationSnapshotId: 'qualification-before',
      sourceHash: 'corrected-source-hash',
      pipeline,
    });

    expect(lineage).toEqual({
      correctionMode: 'retain_progression_override',
      priorStandingSnapshotId: 'standing-before',
      standingSnapshotId: 'standing-after',
      priorQualificationSnapshotId: 'qualification-before',
      qualificationSnapshotId: 'qualification-after',
      sourceHash: 'corrected-source-hash',
      retainedQualificationRows: 6,
    });
    expect(client.calls.filter((call) => call.sql.startsWith('INSERT INTO go_v2_standing_snapshots'))).toHaveLength(1);
    expect(client.calls.filter((call) => call.sql.startsWith('INSERT INTO go_v2_standing_snapshot_rows'))).toHaveLength(6);
    expect(client.calls.filter((call) => call.sql.startsWith('INSERT INTO go_v2_qualification_snapshots'))).toHaveLength(1);
    expect(client.calls.filter((call) => call.sql.startsWith('INSERT INTO go_v2_qualification_snapshot_rows'))).toHaveLength(1);
    expect(client.calls.some((call) => /^(DELETE|UPDATE)\b/.test(call.sql))).toBe(false);
    expect(client.calls.some((call) => (
      /^(DELETE FROM|UPDATE|INSERT INTO) go_v2_(matches|match_slot_sources|stages)\b/.test(call.sql)
    ))).toBe(false);
    const copiedRows = client.calls.find((call) => call.sql.startsWith('INSERT INTO go_v2_qualification_snapshot_rows'));
    expect(copiedRows?.sql).toContain('FROM go_v2_qualification_snapshot_rows');
    expect(copiedRows?.params).toEqual(['qualification-after', 'qualification-before']);
    const qualificationSnapshot = client.calls.find((call) => call.sql.startsWith('INSERT INTO go_v2_qualification_snapshots'));
    expect(JSON.parse(String(qualificationSnapshot?.params[4]))).toMatchObject({
      correctionMode: 'retain_progression_override',
      retainedFromQualificationSnapshotId: 'qualification-before',
      correctedStandingSnapshotId: 'standing-after',
    });
  });
});

function retainedUndoClient(latestQualificationSnapshotId = 'qualification-after') {
  return {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT batch.id, batch.mutation_kind')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'batch-retain',
            mutation_kind: 'incident',
            risk: 'red',
            state: 'committed',
            trigger_match_id: 'group-match',
            already_undone: false,
            diff_payload: {
              resolution: 'retain_progression_override',
              qualificationSnapshotLineage: {
                standingSnapshotId: 'standing-after',
                qualificationSnapshotId: 'qualification-after',
              },
              impact: { qualificationCorrection: { groupStageId: 'groups' } },
            },
          }],
        };
      }
      if (normalized.startsWith('SELECT qualification.id::text AS qualification_snapshot_id')) {
        return {
          rowCount: 1,
          rows: [{
            qualification_snapshot_id: latestQualificationSnapshotId,
            rules_snapshot: { quotas: { mode: 'two', hard: 4, medium: 0, light: 2 } },
            group_stage_id: 'groups',
            playoff_stage_id: 'hard-stage',
            status: 'live',
          }],
        };
      }
      if (normalized.startsWith('SELECT child.match_id::text AS match_id')) {
        return {
          rowCount: 1,
          rows: [{
            match_id: 'group-match',
            prior_result_revision_id: 'result-before',
            new_result_revision_id: 'result-after',
            prior_schedule_assignment_id: null,
            new_schedule_assignment_id: null,
            action: 'reroute',
            risk: 'red',
            diff_payload: { resolution: 'retain_progression_override' },
            play_state: 'final',
            schedule_state: 'completed',
          }],
        };
      }
      throw new Error(`Unexpected retained-undo query: ${normalized}`);
    },
  };
}

describe('GO V2 retain-progression correction undo', () => {
  it('allows only latest-lineage retain undo and exposes the snapshot copy context', async () => {
    const preview = await previewCompensatingUndo(
      retainedUndoClient() as never,
      'tournament',
      'batch-retain',
    );

    expect(preview.qualificationUndo).toMatchObject({
      available: true,
      mode: 'retain_progression_override',
      groupStageId: 'groups',
      priorStandingSnapshotId: 'standing-after',
      priorQualificationSnapshotId: 'qualification-after',
    });
    expect(preview.undoCapability).toMatchObject({ available: true });

    await expect(previewCompensatingUndo(
      retainedUndoClient('qualification-newer') as never,
      'tournament',
      'batch-retain',
    )).rejects.toMatchObject({ code: 'QUALIFICATION_UNDO_LINEAGE_NOT_LATEST' });
  });
});

describe('GO V2 qualification cascade commit guard source contract', () => {
  it('revalidates and atomically persists qualification/schedule lineage while voided replay stays fail-closed', () => {
    const service = readFileSync(
      path.join(process.cwd(), 'web/lib/go-v2/service.ts'),
      'utf8',
    );
    const versionAdvance = service.indexOf('const nextState = await advanceAggregateVersion');
    const preflightStart = service.lastIndexOf("if (operation === 'incident.commit') {", versionAdvance);
    const preflight = service.slice(preflightStart, versionAdvance);

    expect(preflightStart).toBeGreaterThan(-1);
    expect(versionAdvance).toBeGreaterThan(preflightStart);
    expect(service).not.toContain('QUALIFICATION_CASCADE_ATOMIC_REMATERIALIZATION_REQUIRED');
    expect(service).toContain('persistQualificationCascadeRematerialization');
    expect(service).toContain('publishQualificationCascadeScheduleSuccessor');
    expect(service).toContain('QUALIFICATION_CASCADE_PREVIEW_STALE');
    expect(preflight).toContain('QUALIFICATION_CASCADE_UNAVAILABLE');
    expect(preflight).toContain('VOIDED_TRIGGER_REPLAY_RECOVERY_REQUIRED');
    expect(preflight.indexOf('VOIDED_TRIGGER_REPLAY_RECOVERY_REQUIRED')).toBeLessThan(preflight.length);
  });

  it('uses a no-op successor for an unpublished schedule and clone-or-replan for a published one', () => {
    const service = readFileSync(
      path.join(process.cwd(), 'web/lib/go-v2/service.ts'),
      'utf8',
    );
    const helperStart = service.indexOf('async function publishQualificationCascadeScheduleSuccessor');
    const helperEnd = service.indexOf('export interface CompetitionTierBracketCandidate', helperStart);
    const helper = service.slice(helperStart, helperEnd);

    expect(helper).toContain('if (!expected) return null');
    expect(helper).toContain('const cloneValidation = validateSchedule(solverInput, priorAssignments)');
    expect(helper).toContain(': solveSchedule(solverInput)');
    expect(helper).toContain('staleReplayAssignments.has(match.id)');
    expect(helper).toContain('notBefore: new Date(Math.max(');
    expect(helper).toContain("'QUALIFICATION_CASCADE_SCHEDULE_REPLAN_INFEASIBLE'");
    expect(helper).toContain('await persistScheduleVersion(client');
    expect(helper.indexOf('const validation = validateSchedule')).toBeLessThan(
      helper.indexOf('await persistScheduleVersion(client'),
    );
  });

  it('binds stale-preview checks to snapshot, pipeline, topology, schedule and every session member version', () => {
    const service = readFileSync(
      path.join(process.cwd(), 'web/lib/go-v2/service.ts'),
      'utf8',
    );
    const versionAdvance = service.indexOf('const nextState = await advanceAggregateVersion');
    const preflightStart = service.lastIndexOf("if (operation === 'incident.commit') {", versionAdvance);
    const preflight = service.slice(preflightStart, versionAdvance);

    expect(preflight).toContain('previewQualificationSnapshotId');
    expect(preflight).toContain('previewPipelineHash');
    expect(preflight).toContain('previewPlan.topologyShapeHash');
    expect(preflight).toContain('previewPlan.slotBindingHash');
    expect(preflight).toContain('previewSchedule.scheduleVersionId');
    expect(preflight).toContain('previewSchedule.sessionTournamentVersions');
    expect(preflight).toContain('freshSchedule?.sessionTournamentVersions');
    expect(preflight).toContain("'QUALIFICATION_CORRECTION_PREVIEW_STALE'");
  });

  it('locks every shared-session aggregate but preserves linked lifecycle on cascade publication', () => {
    const service = readFileSync(
      path.join(process.cwd(), 'web/lib/go-v2/service.ts'),
      'utf8',
    );

    expect(service).toContain("'incident.commit',\n            );");
    expect(service).toContain("operation === 'incident.commit' || operation === 'mutation.undo.commit'\n          ? linked.state.lifecycleState");
    expect(service).toContain('sessionTournamentVersions: freshSchedule.sessionTournamentVersions');
    expect(service).toContain('for (const linked of linkedScheduleStates)');
    expect(service).toContain('linkedNextStates.push');
  });

  it('stores an append-only exact cascade lineage and relies on command receipts for retry idempotency', () => {
    const migration102 = readFileSync(
      path.join(process.cwd(), 'migrations/105_go_tournament_engine_v2.sql'),
      'utf8',
    );
    const migration103 = readFileSync(
      path.join(process.cwd(), 'migrations/106_go_v2_live_schedule.sql'),
      'utf8',
    );
    const repository = readFileSync(
      path.join(process.cwd(), 'web/lib/go-v2/repository.ts'),
      'utf8',
    );
    const service = readFileSync(
      path.join(process.cwd(), 'web/lib/go-v2/service.ts'),
      'utf8',
    );

    expect(migration102).toContain('supersedes_snapshot_id UUID REFERENCES go_v2_standing_snapshots');
    expect(migration102).toContain('standing_snapshot_id UUID REFERENCES go_v2_standing_snapshots');
    expect(migration102).toContain('lineage_payload');
    expect(migration103).toContain("'go_v2_cascade_mutation_batches'");
    expect(migration103).toContain("'go_v2_cascade_mutation_matches'");
    expect(repository).toContain("correctionMode ?? 'cascade_void_and_replay'");
    expect(repository).toContain("'participantSeeds', $3::jsonb");
    expect(repository).toContain("'qualificationSnapshotId', $4::text");
    expect(repository).toContain("'QUALIFICATION_CASCADE_STAGE_STALE'");
    expect(repository).toContain("'QUALIFICATION_CASCADE_PLACEMENT_STRATEGY_UNSUPPORTED'");
    expect(repository).toContain('prior_result_revision_id, new_result_revision_id');
    expect(repository).toContain('prior_schedule_assignment_id, new_schedule_assignment_id');
    expect(service).toContain('const receipt = await findCommandReceipt');
    expect(service).toContain('return replayedResponse(receipt.responsePayload)');
    expect(service).toContain("mutationKind: impact.qualificationCorrection\n          ? resolution === 'cascade_void_and_replay'");
  });

  it('implements undo as a newer compensating cascade, never as snapshot deletion', () => {
    const service = readFileSync(
      path.join(process.cwd(), 'web/lib/go-v2/service.ts'),
      'utf8',
    );
    const repository = readFileSync(
      path.join(process.cwd(), 'web/lib/go-v2/repository.ts'),
      'utf8',
    );

    expect(service).toContain("correctionMode: 'compensating_undo_cascade'");
    expect(service).toContain('parentBatchId: input.entityId');
    expect(repository).toContain("undo.mutation_kind = 'compensating_undo'");
    expect(repository).not.toMatch(/DELETE FROM go_v2_(standing|qualification)_snapshot/);
  });
});
