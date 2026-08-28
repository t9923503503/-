import { describe, expect, it } from 'vitest';

import {
  persistClassificationFinalPlacementSnapshot,
  persistClassificationStage,
  verifyClassificationPayload,
} from '@/lib/go-v2/classification-persistence';
import { generateClassificationTopology } from '@/lib/go-v2/core';

function candidate(teamCount = 4) {
  const participants = Array.from({ length: teamCount }, (_, index) => ({
    entryId: `entry-${index + 1}`,
    seed: index + 1,
  }));
  return {
    participants,
    topology: generateClassificationTopology(participants, { idPrefix: 'CLASS' }),
    idPrefix: 'CLASS',
    stageKey: 'standalone_classification',
    stageOrder: 1,
    tier: 'hard',
    matchRule: { preset: 'single_21', setsToWin: 1, sets: [{ target: 21, winBy: 2, pointCap: null }] },
    lockedFormatSnapshot: {
      schemaVersion: 2,
      templateId: 'lpv_classification_v1',
      snapshotHash: 'fnv1a64:0000000000000000',
      playoffFormat: 'classification',
    },
  };
}

describe('GO V2 classification persistence', () => {
  it('rebuilds the candidate server-side and rejects a tampered topology hash', () => {
    const payload = candidate(5);
    expect(verifyClassificationPayload(payload)).toMatchObject({
      stageKey: 'standalone_classification',
      topology: {
        kind: 'classification_rounds',
        participantCount: 5,
        roundCount: 4,
        realMatchCount: 8,
        minimumGamesGuaranteed: 3,
        maximumGames: 4,
      },
    });
    expect(() => verifyClassificationPayload({
      ...payload,
      topology: { ...payload.topology, topologyHash: 'tampered' },
    })).toThrowError(expect.objectContaining({ code: 'CLASSIFICATION_TOPOLOGY_HASH_MISMATCH' }));
    expect(() => verifyClassificationPayload({
      ...payload,
      lockedFormatSnapshot: { ...payload.lockedFormatSnapshot, playoffFormat: 'single_elimination' },
    })).toThrowError(expect.objectContaining({ code: 'LOCKED_FORMAT_SNAPSHOT_REQUIRED' }));
  });

  it('materializes only real ENTRY matches and a normalized scheduling dependency DAG', async () => {
    const payload = candidate(4);
    const insertedMatches: Array<{ logicalId: string; databaseId: string }> = [];
    const slotSources: unknown[][] = [];
    const dependencies: unknown[][] = [];
    const client = {
      async query(sql: string, params: unknown[] = []) {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        if (normalized.startsWith('SELECT id::text, initial_seed, registration_state')) {
          return {
            rowCount: payload.participants.length,
            rows: payload.participants.map((participant) => ({
              id: participant.entryId,
              initial_seed: participant.seed,
              registration_state: 'confirmed',
            })),
          };
        }
        if (normalized.startsWith('SELECT active_stage_snapshot_id::text')) {
          return { rowCount: 1, rows: [{ active_stage_snapshot_id: 'snapshot-1' }] };
        }
        if (normalized.startsWith('SELECT stage.id::text') && normalized.includes('stage.stage_key = $2')) {
          return { rowCount: 0, rows: [] };
        }
        if (normalized.startsWith('INSERT INTO go_v2_stages')) {
          return { rowCount: 1, rows: [{ id: 'stage-1' }] };
        }
        if (normalized.startsWith('INSERT INTO go_v2_matches')) {
          const logicalId = String(params[2]);
          const databaseId = `db-${logicalId}`;
          insertedMatches.push({ logicalId, databaseId });
          expect(normalized).toContain("'placement', false, 'not_applicable'");
          return { rowCount: 1, rows: [{ id: databaseId }] };
        }
        if (normalized.startsWith('INSERT INTO go_v2_match_slot_sources')) {
          slotSources.push(params);
          expect(normalized).toContain("'ENTRY'");
          expect(normalized).not.toContain("'BYE'");
          return { rowCount: 1, rows: [] };
        }
        if (normalized.startsWith('INSERT INTO go_v2_match_dependencies')) {
          dependencies.push(params);
          return { rowCount: 1, rows: [] };
        }
        if (normalized.startsWith('UPDATE go_v2_tournament_state')) {
          return { rowCount: 1, rows: [] };
        }
        throw new Error(`Unexpected query: ${normalized}`);
      },
    };

    const result = await persistClassificationStage(client as never, {
      tournamentId: 'tournament-1',
      actorId: 'director-1',
      payload,
    });

    expect(result).toMatchObject({
      sourceKind: 'classification_v1',
      strategyId: 'lpv_classification_rounds_v1',
      participantCount: 4,
      roundCount: 3,
      realMatchCount: 6,
      matchCount: 6,
      minimumGamesGuaranteed: 3,
      maximumGames: 3,
    });
    expect(insertedMatches).toHaveLength(6);
    expect(slotSources).toHaveLength(12);
    expect(dependencies.length).toBeGreaterThan(0);
    expect(dependencies.every((params) => params[0] !== params[1])).toBe(true);
  });

  it('appends complete 1..N classification standings with deciding lineup snapshots', async () => {
    const payload = candidate(3);
    const topology = payload.topology;
    const participantSeed = new Map(payload.participants.map((participant) => [participant.entryId, participant.seed]));
    const persistedRows = topology.matches.map((match, index) => {
      const left = match.sourceA.entryId;
      const right = match.sourceB.entryId;
      const leftWins = (participantSeed.get(left) as number) < (participantSeed.get(right) as number);
      return {
        id: `match-uuid-${index + 1}`,
        match_key: match.matchId,
        round_no: match.round,
        position: match.position,
        bracket_side: 'placement',
        play_state: 'final',
        metadata: {},
        result_revision_id: `revision-uuid-${index + 1}`,
        revision_no: 1,
        result_kind: 'played',
        winner_entry_id: leftWins ? left : right,
        loser_entry_id: leftWins ? right : left,
        advancement_effect: 'advance_winner',
        rating_eligibility: 'eligible',
        slot_sources: [
          { slotNo: 1, sourceType: 'ENTRY', sourceEntryId: left, resolvedEntryId: left },
          { slotNo: 2, sourceType: 'ENTRY', sourceEntryId: right, resolvedEntryId: right },
        ],
        dependency_match_keys: [...match.dependencies],
      };
    });
    const finalRows: unknown[][] = [];
    const client = {
      async query(sql: string, params: unknown[] = []) {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        if (normalized.startsWith('SELECT stage.id::text') && normalized.includes("stage.stage_type = 'placement_match'")) {
          return {
            rowCount: 1,
            rows: [{
              id: 'stage-uuid',
              stage_key: 'standalone_classification',
              stage_order: 1,
              stage_type: 'placement_match',
              tier: 'hard',
              status: 'finished',
              configuration: {
                materializationKind: 'classification_rounds',
                sourceKind: 'classification_v1',
                strategy: topology.strategy,
                idPrefix: 'CLASS',
                topologyHash: topology.topologyHash,
                participantCount: topology.participantCount,
                participants: topology.participants,
                rounds: topology.rounds,
                gamesByEntry: topology.gamesByEntry,
                roundCount: topology.roundCount,
                realMatchCount: topology.realMatchCount,
                minimumGamesGuaranteed: topology.minimumGamesGuaranteed,
                maximumGames: topology.maximumGames,
              },
            }],
          };
        }
        if (normalized.startsWith('SELECT stage.id::text') && normalized.includes("stage.stage_type IN ('single_elimination', 'double_elimination')")) {
          return { rowCount: 0, rows: [] };
        }
        if (normalized.startsWith('SELECT match.id::text, match.match_key')) {
          return { rowCount: persistedRows.length, rows: persistedRows };
        }
        if (normalized.startsWith('SELECT lineup.match_id::text, match.match_key')) {
          return {
            rowCount: persistedRows.length * 2,
            rows: persistedRows.flatMap((row) => {
              const topologyMatch = topology.matches.find((match) => match.matchId === row.match_key)!;
              return [topologyMatch.sourceA.entryId, topologyMatch.sourceB.entryId].map((entryId, side) => ({
                match_id: row.id,
                match_key: row.match_key,
                entry_id: entryId,
                roster_revision_id: `roster-${entryId}`,
                result_revision_id: row.result_revision_id,
                revision_no: 1,
                rating_eligibility: 'eligible',
                members: [
                  { memberOrder: 1, playerId: `player-${entryId}-1`, displayName: `${entryId} 1`, ratingValue: 100 },
                  { memberOrder: 2, playerId: `player-${entryId}-2`, displayName: `${entryId} 2`, ratingValue: 90 },
                ],
                side: side + 1,
              }));
            }),
          };
        }
        if (normalized.startsWith('INSERT INTO go_v2_final_placement_snapshots')) {
          expect(normalized).toContain("'classification_v1'");
          return { rowCount: 1, rows: [{ id: 'snapshot-uuid' }] };
        }
        if (normalized.startsWith('INSERT INTO go_v2_final_placement_rows')) {
          finalRows.push(params);
          return { rowCount: 1, rows: [] };
        }
        throw new Error(`Unexpected query: ${normalized}`);
      },
    };

    await expect(persistClassificationFinalPlacementSnapshot(client as never, {
      tournamentId: 'tournament-1',
      aggregateVersion: 9,
      actorId: 'director-1',
    })).resolves.toEqual({ snapshotId: 'snapshot-uuid', created: true });

    expect(finalRows).toHaveLength(3);
    expect(finalRows.map((params) => [params[1], params[5]])).toEqual([
      ['entry-1', 1],
      ['entry-2', 2],
      ['entry-3', 3],
    ]);
    expect(finalRows.map((params) => params[13])).toEqual([
      'classification_standings',
      'classification_standings',
      'classification_standings',
    ]);
  });
});
