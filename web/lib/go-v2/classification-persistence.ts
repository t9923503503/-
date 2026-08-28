import { createHash } from 'crypto';

import type { PoolClient } from 'pg';

import {
  generateClassificationTopology,
  LPV_CLASSIFICATION_STRATEGY_V1,
  resolveCompleteClassificationPlacements,
  SportsDomainError,
  type BracketParticipant,
  type ClassificationTopology,
} from './core';
import { GoV2Error } from './contracts';
import {
  GO_V2_DEFAULT_RATING_POLICY,
  type GoV2FinalPlacementLineupSnapshot,
  type GoV2PersistedFinalPlacementRow,
} from './final-placements';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new GoV2Error(422, 'NON_FINITE_CLASSIFICATION_VALUE', 'Classification snapshot contains a non-finite number');
  }
  return value;
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function parsePositiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new GoV2Error(422, 'INVALID_CLASSIFICATION_TOPOLOGY', `${field} must be a positive integer`, {
      field,
      value,
    });
  }
  return parsed;
}

function parseParticipants(value: unknown): BracketParticipant[] {
  if (!Array.isArray(value)) {
    throw new GoV2Error(422, 'CLASSIFICATION_PARTICIPANTS_REQUIRED', 'Classification participants are required');
  }
  return value.map((rawParticipant, index) => {
    const participant = record(rawParticipant);
    const entryId = String(participant.entryId ?? '').trim();
    if (!entryId) {
      throw new GoV2Error(422, 'INVALID_CLASSIFICATION_PARTICIPANT', 'Every classification participant requires entryId', {
        index,
      });
    }
    return {
      entryId,
      seed: parsePositiveInteger(participant.seed ?? participant.initialSeed, `participants[${index}].seed`),
      poolId: participant.poolId ? String(participant.poolId) : undefined,
      poolRank: participant.poolRank == null
        ? undefined
        : parsePositiveInteger(participant.poolRank, `participants[${index}].poolRank`),
    };
  });
}

function sportsError(error: unknown): never {
  if (error instanceof GoV2Error) throw error;
  if (error instanceof SportsDomainError) {
    throw new GoV2Error(422, error.code, error.message, { ...error.details });
  }
  throw error;
}

export interface VerifiedClassificationPayload {
  stageKey: string;
  stageOrder: number;
  tier: 'hard' | 'medium' | 'light';
  idPrefix: string;
  participants: BracketParticipant[];
  topology: ClassificationTopology;
  matchRule: Record<string, unknown>;
  lockedFormatSnapshot: Record<string, unknown>;
}

/**
 * Rebuilds the classification graph from its participant snapshot. The client
 * topology is used only as a hash assertion and is never trusted as sports
 * input during commit or final-place reconstruction.
 */
export function verifyClassificationPayload(payload: Record<string, unknown>): VerifiedClassificationPayload {
  try {
    const participants = parseParticipants(payload.participants);
    const stageKey = String(payload.stageKey ?? 'standalone_classification').trim();
    if (!stageKey) throw new GoV2Error(422, 'INVALID_STAGE_KEY', 'stageKey is required');
    const stageOrder = parsePositiveInteger(payload.stageOrder ?? 1, 'stageOrder');
    const tier = String(payload.tier ?? 'hard');
    if (tier !== 'hard' && tier !== 'medium' && tier !== 'light') {
      throw new GoV2Error(422, 'INVALID_STAGE_TIER', 'tier must be hard, medium or light');
    }
    const idPrefix = String(payload.idPrefix ?? 'CLASS').trim() || 'CLASS';
    const topology = generateClassificationTopology(participants, {
      idPrefix,
      strategy: LPV_CLASSIFICATION_STRATEGY_V1,
    });
    const suppliedTopology = record(payload.topology);
    const suppliedTopologyHash = String(suppliedTopology.topologyHash ?? '');
    if (!suppliedTopologyHash || suppliedTopologyHash !== topology.topologyHash) {
      throw new GoV2Error(
        409,
        'CLASSIFICATION_TOPOLOGY_HASH_MISMATCH',
        'Classification topology no longer matches its immutable participant snapshot',
        { suppliedTopologyHash, expectedTopologyHash: topology.topologyHash },
      );
    }
    const matchRule = record(payload.matchRule);
    if (!Object.keys(matchRule).length) {
      throw new GoV2Error(422, 'CLASSIFICATION_MATCH_RULE_REQUIRED', 'Classification match rule is required');
    }
    const lockedFormatSnapshot = record(payload.lockedFormatSnapshot);
    if (
      Number(lockedFormatSnapshot.schemaVersion) !== 2
      || !String(lockedFormatSnapshot.templateId ?? '').trim()
      || !String(lockedFormatSnapshot.snapshotHash ?? '').trim()
      || String(lockedFormatSnapshot.playoffFormat ?? '') !== 'classification'
    ) {
      throw new GoV2Error(
        409,
        'LOCKED_FORMAT_SNAPSHOT_REQUIRED',
        'Classification lock requires the immutable TournamentFormatTemplateV2 snapshot',
      );
    }
    return {
      stageKey,
      stageOrder,
      tier,
      idPrefix,
      participants,
      topology,
      matchRule,
      lockedFormatSnapshot,
    };
  } catch (error) {
    return sportsError(error);
  }
}

async function assertClassificationEntries(
  client: PoolClient,
  tournamentId: string,
  participants: readonly BracketParticipant[],
): Promise<void> {
  const entryIds = participants.map((participant) => participant.entryId);
  const result = await client.query(
    `SELECT id::text, initial_seed, registration_state
     FROM go_v2_entries
     WHERE tournament_id = $1 AND id::text = ANY($2::text[])
     ORDER BY id`,
    [tournamentId, entryIds],
  );
  const byId = new Map(result.rows.map((row) => [String(row.id), row]));
  const unknownEntryIds = entryIds.filter((entryId) => !byId.has(entryId));
  const inactiveEntryIds = entryIds.filter((entryId) => byId.get(entryId)?.registration_state !== 'confirmed');
  const seedMismatches = participants.flatMap((participant) => {
    const storedSeed = Number(byId.get(participant.entryId)?.initial_seed);
    return storedSeed === participant.seed
      ? []
      : [{ entryId: participant.entryId, suppliedSeed: participant.seed, storedSeed }];
  });
  if (
    result.rowCount !== participants.length
    || unknownEntryIds.length
    || inactiveEntryIds.length
    || seedMismatches.length
  ) {
    throw new GoV2Error(
      409,
      'CLASSIFICATION_PARTICIPANT_SNAPSHOT_MISMATCH',
      'Classification participants must be the confirmed immutable registration seed snapshot',
      { unknownEntryIds, inactiveEntryIds, seedMismatches },
    );
  }
}

export async function persistClassificationStage(
  client: PoolClient,
  input: {
    tournamentId: string;
    actorId: string;
    payload: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const verified = verifyClassificationPayload(input.payload);
  await assertClassificationEntries(client, input.tournamentId, verified.participants);

  const stateResult = await client.query(
    `SELECT active_stage_snapshot_id::text
     FROM go_v2_tournament_state
     WHERE tournament_id = $1
     FOR UPDATE`,
    [input.tournamentId],
  );
  let snapshotId = stateResult.rows[0]?.active_stage_snapshot_id
    ? String(stateResult.rows[0].active_stage_snapshot_id)
    : null;
  if (!snapshotId) {
    const snapshotPayload = {
      schemaVersion: 2,
      seedSnapshot: verified.participants,
      rankingRulesSnapshot: {
        strategyId: LPV_CLASSIFICATION_STRATEGY_V1.strategyId,
        placementPolicy: LPV_CLASSIFICATION_STRATEGY_V1.placementPolicy,
      },
      formatSnapshot: verified.lockedFormatSnapshot,
      policySnapshot: {
        sourceKind: 'classification_v1',
        minimumGamesTarget: LPV_CLASSIFICATION_STRATEGY_V1.targetGamesPerTeam,
      },
    };
    const snapshotHash = stableHash(snapshotPayload);
    const inserted = await client.query(
      `WITH inserted AS (
         INSERT INTO go_v2_stage_lock_snapshots (
           tournament_id, schema_version, seed_snapshot, ranking_rules_snapshot,
           format_snapshot, policy_snapshot, snapshot_hash, locked_by
         ) VALUES ($1, 2, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7)
         ON CONFLICT (tournament_id, snapshot_hash) DO NOTHING
         RETURNING id
       )
       SELECT id::text FROM inserted
       UNION ALL
       SELECT id::text FROM go_v2_stage_lock_snapshots
       WHERE tournament_id = $1 AND snapshot_hash = $6
       LIMIT 1`,
      [
        input.tournamentId,
        JSON.stringify(snapshotPayload.seedSnapshot),
        JSON.stringify(snapshotPayload.rankingRulesSnapshot),
        JSON.stringify(snapshotPayload.formatSnapshot),
        JSON.stringify(snapshotPayload.policySnapshot),
        snapshotHash,
        input.actorId,
      ],
    );
    snapshotId = String(inserted.rows[0]?.id ?? '');
    if (!snapshotId) {
      throw new GoV2Error(500, 'CLASSIFICATION_SNAPSHOT_FAILED', 'Could not persist classification lock snapshot');
    }
  }

  const existing = await client.query(
    `SELECT stage.id::text, stage.stage_type, stage.status, stage.configuration,
            EXISTS (SELECT 1 FROM go_v2_matches match WHERE match.stage_id = stage.id) AS has_matches
     FROM go_v2_stages stage
     WHERE stage.tournament_id = $1 AND stage.stage_key = $2
     FOR UPDATE`,
    [input.tournamentId, verified.stageKey],
  );
  if (existing.rowCount && existing.rows[0].has_matches === true) {
    throw new GoV2Error(
      409,
      'MATERIALIZED_CLASSIFICATION_IMMUTABLE',
      'A materialized classification stage cannot be overwritten; use an explicit correction/rebuild workflow',
      {
        stageId: String(existing.rows[0].id),
        topologyHash: String(record(existing.rows[0].configuration).topologyHash ?? ''),
      },
    );
  }

  const configuration = {
    materializationKind: 'classification_rounds',
    sourceKind: 'classification_v1',
    strategy: LPV_CLASSIFICATION_STRATEGY_V1,
    idPrefix: verified.idPrefix,
    topologyHash: verified.topology.topologyHash,
    participantCount: verified.topology.participantCount,
    participants: verified.topology.participants,
    rounds: verified.topology.rounds,
    gamesByEntry: verified.topology.gamesByEntry,
    roundCount: verified.topology.roundCount,
    realMatchCount: verified.topology.realMatchCount,
    minimumGamesGuaranteed: verified.topology.minimumGamesGuaranteed,
    maximumGames: verified.topology.maximumGames,
  };
  const stageResult = await client.query(
    `INSERT INTO go_v2_stages (
       tournament_id, stage_key, stage_order, stage_type, tier, status,
       lock_snapshot_id, match_rule, configuration
     ) VALUES ($1, $2, $3, 'placement_match', $4, 'locked', $5, $6::jsonb, $7::jsonb)
     ON CONFLICT (tournament_id, stage_key) DO UPDATE SET
       stage_order = EXCLUDED.stage_order,
       stage_type = EXCLUDED.stage_type,
       tier = EXCLUDED.tier,
       status = 'locked',
       lock_snapshot_id = EXCLUDED.lock_snapshot_id,
       match_rule = EXCLUDED.match_rule,
       configuration = EXCLUDED.configuration,
       version = go_v2_stages.version + 1,
       updated_at = now()
     RETURNING id::text`,
    [
      input.tournamentId,
      verified.stageKey,
      verified.stageOrder,
      verified.tier,
      snapshotId,
      JSON.stringify(verified.matchRule),
      JSON.stringify(configuration),
    ],
  );
  const stageId = String(stageResult.rows[0]?.id ?? '');
  if (!stageId) throw new GoV2Error(500, 'CLASSIFICATION_STAGE_FAILED', 'Could not persist classification stage');

  const matchIdByLogicalId = new Map<string, string>();
  for (const match of verified.topology.matches) {
    const inserted = await client.query(
      `INSERT INTO go_v2_matches (
         tournament_id, stage_id, match_key, round_no, position,
         bracket_side, is_conditional, condition_state, metadata
       ) VALUES ($1, $2, $3, $4, $5, 'placement', false, 'not_applicable', $6::jsonb)
       RETURNING id::text`,
      [
        input.tournamentId,
        stageId,
        match.matchId,
        match.round,
        match.position,
        JSON.stringify({
          publicLabel: match.publicLabel,
          topologyHash: verified.topology.topologyHash,
          dependencyMatchKeys: match.dependencies,
        }),
      ],
    );
    matchIdByLogicalId.set(match.matchId, String(inserted.rows[0]?.id ?? ''));
  }

  for (const match of verified.topology.matches) {
    const matchId = matchIdByLogicalId.get(match.matchId);
    if (!matchId) {
      throw new GoV2Error(500, 'CLASSIFICATION_MATCH_FAILED', 'Materialized classification match is missing');
    }
    for (const [slotNo, source] of [[1, match.sourceA], [2, match.sourceB]] as const) {
      await client.query(
        `INSERT INTO go_v2_match_slot_sources (
           match_id, slot_no, source_type, source_entry_id,
           route_source_type, resolved_entry_id
         ) VALUES ($1, $2, 'ENTRY', $3, 'ENTRY', $3)`,
        [matchId, slotNo, source.entryId],
      );
    }
    for (const [dependencyIndex, dependencyKey] of match.dependencies.entries()) {
      const dependencyId = matchIdByLogicalId.get(dependencyKey);
      if (!dependencyId) {
        throw new GoV2Error(
          409,
          'CLASSIFICATION_DEPENDENCY_MISSING',
          'Classification dependency references a match outside the immutable topology',
          { matchKey: match.matchId, dependencyMatchKey: dependencyKey },
        );
      }
      await client.query(
        `INSERT INTO go_v2_match_dependencies (
           match_id, depends_on_match_id, dependency_kind, ordinal
         ) VALUES ($1, $2, 'team_sequence', $3)`,
        [matchId, dependencyId, dependencyIndex + 1],
      );
    }
  }

  await client.query(
    `UPDATE go_v2_tournament_state
     SET active_stage_snapshot_id = $2, updated_at = now()
     WHERE tournament_id = $1`,
    [input.tournamentId, snapshotId],
  );

  return {
    stageId,
    stageKey: verified.stageKey,
    tier: verified.tier,
    sourceKind: 'classification_v1',
    strategyId: LPV_CLASSIFICATION_STRATEGY_V1.strategyId,
    topologyHash: verified.topology.topologyHash,
    participantCount: verified.topology.participantCount,
    roundCount: verified.topology.roundCount,
    realMatchCount: verified.topology.realMatchCount,
    matchCount: verified.topology.matches.length,
    minimumGamesGuaranteed: verified.topology.minimumGamesGuaranteed,
    maximumGames: verified.topology.maximumGames,
  };
}

interface PersistedClassificationTopology {
  topology: ClassificationTopology;
  tier: 'hard' | 'medium' | 'light';
}

function rebuildPersistedClassificationTopology(
  configurationValue: unknown,
  tierValue: unknown,
): PersistedClassificationTopology {
  const configuration = record(configurationValue);
  if (
    String(configuration.materializationKind ?? '') !== 'classification_rounds'
    || String(configuration.sourceKind ?? '') !== 'classification_v1'
  ) {
    throw new GoV2Error(
      409,
      'FINAL_PLACEMENT_STRATEGY_NOT_MATERIALIZED',
      'placement_match is not a frozen classification_v1 stage',
    );
  }
  const participants = parseParticipants(configuration.participants);
  let topology: ClassificationTopology;
  try {
    topology = generateClassificationTopology(participants, {
      idPrefix: String(configuration.idPrefix ?? 'CLASS'),
      strategy: LPV_CLASSIFICATION_STRATEGY_V1,
    });
  } catch (error) {
    return sportsError(error);
  }
  if (
    String(configuration.topologyHash ?? '') !== topology.topologyHash
    || Number(configuration.participantCount) !== topology.participantCount
    || Number(configuration.roundCount) !== topology.roundCount
    || Number(configuration.realMatchCount) !== topology.realMatchCount
    || Number(configuration.minimumGamesGuaranteed) !== topology.minimumGamesGuaranteed
    || Number(configuration.maximumGames) !== topology.maximumGames
    || stableHash(configuration.rounds) !== stableHash(topology.rounds)
    || stableHash(configuration.gamesByEntry) !== stableHash(topology.gamesByEntry)
  ) {
    throw new GoV2Error(
      409,
      'CLASSIFICATION_PERSISTED_TOPOLOGY_MISMATCH',
      'Persisted classification topology is incomplete or does not match its immutable participant snapshot',
      { expectedTopologyHash: topology.topologyHash, storedTopologyHash: configuration.topologyHash },
    );
  }
  const tier = String(tierValue ?? 'hard');
  if (tier !== 'hard' && tier !== 'medium' && tier !== 'light') {
    throw new GoV2Error(409, 'INVALID_FINAL_PLACEMENT_TIER', 'Classification stage has an unsupported tier', { tier });
  }
  return { topology, tier };
}

function finalInteger(value: unknown, field: string, minimum = 0): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new GoV2Error(409, 'INVALID_CLASSIFICATION_FINAL_DATA', `${field} is invalid`, { field, value });
  }
  return parsed;
}

function classificationLineup(value: {
  matchId: unknown;
  resultRevisionId: unknown;
  resultRevisionNo: unknown;
  rosterRevisionId: unknown;
  ratingEligibility: unknown;
  members: unknown;
}): GoV2FinalPlacementLineupSnapshot {
  const ratingEligibility = String(value.ratingEligibility ?? 'eligible');
  if (!['eligible', 'ineligible', 'profile_controlled'].includes(ratingEligibility)) {
    throw new GoV2Error(409, 'INVALID_FINAL_LINEUP_ELIGIBILITY', 'Classification lineup eligibility is invalid');
  }
  const members = Array.isArray(value.members) ? value.members.map((rawMember) => {
    const member = record(rawMember);
    return {
      memberOrder: finalInteger(member.memberOrder, 'lineup.memberOrder', 1),
      playerId: member.playerId ? String(member.playerId) : null,
      displayName: member.displayName == null ? null : String(member.displayName),
      ratingValue: finalInteger(member.ratingValue, 'lineup.ratingValue'),
    };
  }) : [];
  if (!String(value.matchId ?? '') || !String(value.resultRevisionId ?? '') || !String(value.rosterRevisionId ?? '') || !members.length) {
    throw new GoV2Error(409, 'FINAL_PLACEMENT_LINEUP_MISSING', 'Classification deciding lineup is incomplete');
  }
  return {
    matchId: String(value.matchId),
    resultRevisionId: String(value.resultRevisionId),
    resultRevisionNo: finalInteger(value.resultRevisionNo, 'lineup.resultRevisionNo', 1),
    rosterRevisionId: String(value.rosterRevisionId),
    ratingEligibility: ratingEligibility as GoV2FinalPlacementLineupSnapshot['ratingEligibility'],
    members,
  };
}

/**
 * Resolves every classification place from server-owned matches and appends an
 * immutable classification_v1 snapshot. Missing matches, dependency edges,
 * outcomes or lineups stop the transaction instead of inventing places.
 */
export async function persistClassificationFinalPlacementSnapshot(
  client: PoolClient,
  input: {
    tournamentId: string;
    aggregateVersion: number;
    actorId: string;
  },
): Promise<{ snapshotId: string; created: boolean }> {
  const stageResult = await client.query(
    `SELECT stage.id::text, stage.stage_key, stage.stage_order,
            stage.stage_type, stage.tier, stage.status, stage.configuration
     FROM go_v2_stages stage
     WHERE stage.tournament_id = $1
       AND stage.stage_type = 'placement_match'
       AND stage.status <> 'voided'
       AND EXISTS (SELECT 1 FROM go_v2_matches match WHERE match.stage_id = stage.id)
     ORDER BY stage.stage_order, stage.id
     FOR UPDATE`,
    [input.tournamentId],
  );
  if (stageResult.rowCount !== 1) {
    throw new GoV2Error(
      409,
      stageResult.rowCount ? 'MULTIPLE_CLASSIFICATION_STAGES_UNSUPPORTED' : 'CLASSIFICATION_STAGE_REQUIRED',
      'A standalone classification result requires exactly one materialized placement stage',
      { stageCount: stageResult.rowCount },
    );
  }
  const conflicting = await client.query(
    `SELECT stage.id::text, stage.stage_type
     FROM go_v2_stages stage
     WHERE stage.tournament_id = $1
       AND stage.stage_type IN ('single_elimination', 'double_elimination')
       AND stage.status <> 'voided'
       AND EXISTS (SELECT 1 FROM go_v2_matches match WHERE match.stage_id = stage.id)
     LIMIT 1`,
    [input.tournamentId],
  );
  if (conflicting.rowCount) {
    throw new GoV2Error(
      409,
      'MIXED_CLASSIFICATION_BRACKET_FINAL_FORBIDDEN',
      'Standalone classification cannot share one final-placement ledger with an SE/DE bracket',
      { conflictingStageId: String(conflicting.rows[0].id) },
    );
  }
  const stage = stageResult.rows[0];
  if (String(stage.status) !== 'finished') {
    throw new GoV2Error(409, 'FINAL_PLACEMENT_CLASSIFICATION_INCOMPLETE', 'Classification stage must be finished');
  }
  const { topology, tier } = rebuildPersistedClassificationTopology(stage.configuration, stage.tier);
  const stageId = String(stage.id);
  const stageKey = String(stage.stage_key);

  const matchResult = await client.query(
    `SELECT match.id::text, match.match_key, match.round_no, match.position,
            match.bracket_side, match.play_state, match.metadata,
            revision.id::text AS result_revision_id, revision.revision_no,
            revision.result_kind, revision.winner_entry_id::text,
            revision.loser_entry_id::text, revision.advancement_effect,
            revision.rating_eligibility,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'slotNo', source.slot_no,
                'sourceType', source.source_type,
                'sourceEntryId', source.source_entry_id,
                'resolvedEntryId', source.resolved_entry_id
              ) ORDER BY source.slot_no)
              FROM go_v2_match_slot_sources source
              WHERE source.match_id = match.id
            ), '[]'::jsonb) AS slot_sources,
            COALESCE((
              SELECT jsonb_agg(upstream.match_key ORDER BY dependency.ordinal)
              FROM go_v2_match_dependencies dependency
              JOIN go_v2_matches upstream ON upstream.id = dependency.depends_on_match_id
              WHERE dependency.match_id = match.id
            ), '[]'::jsonb) AS dependency_match_keys
     FROM go_v2_matches match
     LEFT JOIN go_v2_match_result_revisions revision
       ON revision.match_id = match.id
      AND revision.revision_no = match.current_result_revision_no
     WHERE match.stage_id = $1
     ORDER BY match.round_no, match.position, match.id`,
    [stageId],
  );
  const persistedByKey = new Map(matchResult.rows.map((row) => [String(row.match_key), row]));
  if (persistedByKey.size !== topology.matches.length || matchResult.rowCount !== topology.matches.length) {
    throw new GoV2Error(
      409,
      'CLASSIFICATION_TOPOLOGY_INCOMPLETE',
      'Persisted classification real-match set does not match its immutable topology',
      { expectedMatches: topology.matches.length, actualMatches: matchResult.rowCount },
    );
  }
  for (const expected of topology.matches) {
    const row = persistedByKey.get(expected.matchId);
    const slots = Array.isArray(row?.slot_sources) ? row.slot_sources.map(record) : [];
    const dependencyKeys = Array.isArray(row?.dependency_match_keys)
      ? row.dependency_match_keys.map(String)
      : [];
    if (
      !row
      || Number(row.round_no) !== expected.round
      || Number(row.position) !== expected.position
      || String(row.bracket_side) !== 'placement'
      || slots.length !== 2
      || String(slots[0].sourceType) !== 'ENTRY'
      || String(slots[1].sourceType) !== 'ENTRY'
      || String(slots[0].sourceEntryId) !== expected.sourceA.entryId
      || String(slots[1].sourceEntryId) !== expected.sourceB.entryId
      || stableHash(dependencyKeys) !== stableHash(expected.dependencies)
    ) {
      throw new GoV2Error(
        409,
        'CLASSIFICATION_PERSISTED_MATCH_MISMATCH',
        'Persisted classification match or scheduling dependency differs from the frozen topology',
        { matchKey: expected.matchId },
      );
    }
  }

  const outcomes = topology.matches.map((match) => {
    const row = persistedByKey.get(match.matchId) as Record<string, unknown>;
    if (
      String(row.play_state) !== 'final'
      || !row.result_revision_id
      || !row.winner_entry_id
      || !row.loser_entry_id
    ) {
      throw new GoV2Error(
        409,
        'FINAL_PLACEMENT_OUTCOME_INCOMPLETE',
        'Every classification match requires one final server-owned winner and loser',
        { matchId: String(row.id), matchKey: match.matchId },
      );
    }
    return {
      matchId: match.matchId,
      winnerEntryId: String(row.winner_entry_id),
      loserEntryId: String(row.loser_entry_id),
    };
  });
  let resolved: ReturnType<typeof resolveCompleteClassificationPlacements>;
  try {
    resolved = resolveCompleteClassificationPlacements(topology, outcomes);
  } catch (error) {
    return sportsError(error);
  }

  const lineupResult = await client.query(
    `SELECT lineup.match_id::text, match.match_key, lineup.entry_id::text,
            lineup.roster_revision_id::text,
            revision.id::text AS result_revision_id, revision.revision_no,
            revision.rating_eligibility,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'memberOrder', member.member_order,
                'playerId', member.player_id,
                'displayName', member.display_name,
                'ratingValue', member.rating_value
              ) ORDER BY member.member_order)
              FROM go_v2_roster_revision_members member
              WHERE member.roster_revision_id = lineup.roster_revision_id
            ), '[]'::jsonb) AS members
     FROM go_v2_match_lineup_snapshots lineup
     JOIN go_v2_matches match ON match.id = lineup.match_id
     JOIN go_v2_match_result_revisions revision
       ON revision.match_id = match.id
      AND revision.revision_no = match.current_result_revision_no
      AND lineup.result_revision_no = revision.revision_no
     WHERE match.stage_id = $1
     ORDER BY match.round_no, match.position, lineup.side`,
    [stageId],
  );
  const lineupsByMatchEntry = new Map<string, GoV2FinalPlacementLineupSnapshot>();
  for (const row of lineupResult.rows) {
    lineupsByMatchEntry.set(
      `${String(row.match_key)}:${String(row.entry_id)}`,
      classificationLineup({
        matchId: row.match_id,
        resultRevisionId: row.result_revision_id,
        resultRevisionNo: row.revision_no,
        rosterRevisionId: row.roster_revision_id,
        ratingEligibility: row.rating_eligibility,
        members: row.members,
      }),
    );
  }
  const lastMatchByEntry = new Map<string, string>();
  for (const match of topology.matches) {
    lastMatchByEntry.set(match.sourceA.entryId, match.matchId);
    lastMatchByEntry.set(match.sourceB.entryId, match.matchId);
  }
  const placements: GoV2PersistedFinalPlacementRow[] = resolved.placements.map((placement) => {
    const decidingMatchKey = lastMatchByEntry.get(placement.entryId);
    const lineupSnapshot = decidingMatchKey
      ? lineupsByMatchEntry.get(`${decidingMatchKey}:${placement.entryId}`)
      : undefined;
    if (!lineupSnapshot) {
      throw new GoV2Error(
        409,
        'FINAL_PLACEMENT_LINEUP_MISSING',
        'The final classification match lineup is missing',
        { entryId: placement.entryId, decidingMatchKey },
      );
    }
    return {
      entryId: placement.entryId,
      sourceStageId: stageId,
      sourceStageKey: stageKey,
      tier,
      tierPlace: placement.place,
      overallPlace: placement.place,
      sportingTierPlaceRange: placement.sportingPlaceRange,
      sportingOverallPlaceRange: placement.sportingPlaceRange,
      initialSeed: placement.initialSeed,
      gamesPlayed: placement.gamesPlayed,
      losses: placement.losses,
      eliminatedByMatchId: null,
      basis: placement.basis,
      lineupSnapshot,
    };
  });

  const sourceRevisionLineage = topology.matches.map((match) => {
    const row = persistedByKey.get(match.matchId) as Record<string, unknown>;
    return {
      stageId,
      stageKey,
      stageOrder: Number(stage.stage_order),
      stageType: 'placement_match',
      tier,
      matchId: String(row.id),
      matchKey: match.matchId,
      round: match.round,
      position: match.position,
      phase: 'placement',
      conditional: false,
      conditionState: 'not_applicable',
      playState: String(row.play_state),
      resultRevisionId: String(row.result_revision_id),
      resultRevisionNo: Number(row.revision_no),
      resultKind: String(row.result_kind),
      winnerEntryId: String(row.winner_entry_id),
      loserEntryId: String(row.loser_entry_id),
      advancementEffect: String(row.advancement_effect),
      ratingEligibility: String(row.rating_eligibility),
    };
  });
  const sourceResultRevisionIds = sourceRevisionLineage.map((row) => row.resultRevisionId);
  const sourceResultsHash = stableHash({
    schemaVersion: 1,
    sourceKind: 'classification_v1',
    sourceStageIds: [stageId],
    topologyHash: topology.topologyHash,
    resultHash: resolved.resultHash,
    sourceRevisionLineage,
  });
  const standingsHash = stableHash({
    schemaVersion: 1,
    rows: placements.map((row) => ({
      entryId: row.entryId,
      tier: row.tier,
      tierPlace: row.tierPlace,
      overallPlace: row.overallPlace,
      sportingTierPlaceRange: row.sportingTierPlaceRange,
      sportingOverallPlaceRange: row.sportingOverallPlaceRange,
      initialSeed: row.initialSeed,
      basis: row.basis,
      creditedLineup: {
        rosterRevisionId: row.lineupSnapshot.rosterRevisionId,
        ratingEligibility: row.lineupSnapshot.ratingEligibility,
        members: row.lineupSnapshot.members.map((member) => ({
          memberOrder: member.memberOrder,
          playerId: member.playerId,
          ratingValue: member.ratingValue,
        })),
      },
    })),
    ratingPolicy: GO_V2_DEFAULT_RATING_POLICY,
  });
  const inserted = await client.query(
    `INSERT INTO go_v2_final_placement_snapshots (
       tournament_id, schema_version, aggregate_version, source_kind,
       source_results_hash, standings_hash, source_stage_ids,
       source_result_revision_ids, source_revision_lineage,
       rating_policy_snapshot, created_by
     ) VALUES ($1, 1, $2, 'classification_v1', $3, $4, $5::uuid[], $6::uuid[], $7::jsonb, $8::jsonb, $9)
     ON CONFLICT (tournament_id, source_results_hash) DO NOTHING
     RETURNING id::text`,
    [
      input.tournamentId,
      input.aggregateVersion,
      sourceResultsHash,
      standingsHash,
      [stageId],
      sourceResultRevisionIds,
      JSON.stringify(sourceRevisionLineage),
      JSON.stringify(GO_V2_DEFAULT_RATING_POLICY),
      input.actorId,
    ],
  );
  const created = Boolean(inserted.rowCount);
  let snapshotId = created ? String(inserted.rows[0].id) : '';
  if (created) {
    for (const row of placements) {
      await client.query(
        `INSERT INTO go_v2_final_placement_rows (
           snapshot_id, entry_id, source_stage_id, tier, tier_place, overall_place,
           sporting_tier_place_from, sporting_tier_place_to,
           sporting_overall_place_from, sporting_overall_place_to,
           initial_seed, games_played, losses, eliminated_by_match_id, basis, lineup_snapshot
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NULL, $14, $15::jsonb)`,
        [
          snapshotId,
          row.entryId,
          row.sourceStageId,
          row.tier,
          row.tierPlace,
          row.overallPlace,
          row.sportingTierPlaceRange[0],
          row.sportingTierPlaceRange[1],
          row.sportingOverallPlaceRange[0],
          row.sportingOverallPlaceRange[1],
          row.initialSeed,
          row.gamesPlayed,
          row.losses,
          row.basis,
          JSON.stringify(row.lineupSnapshot),
        ],
      );
    }
  } else {
    const existing = await client.query(
      `SELECT id::text
       FROM go_v2_final_placement_snapshots
       WHERE tournament_id = $1 AND source_results_hash = $2`,
      [input.tournamentId, sourceResultsHash],
    );
    snapshotId = String(existing.rows[0]?.id ?? '');
    if (!snapshotId) {
      throw new GoV2Error(500, 'FINAL_PLACEMENT_INSERT_RACE', 'Could not resolve classification placement snapshot');
    }
  }
  return { snapshotId, created };
}
