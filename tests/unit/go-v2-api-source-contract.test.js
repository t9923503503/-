import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const adminBase = 'web/app/api/admin/go-v2/tournaments/[id]';

describe('GO tournament engine V2 persistence and API source contract', () => {
  it('uses the first free migration numbers after occupied 100/101', () => {
    expect(existsSync(path.join(process.cwd(), 'migrations/105_go_tournament_engine_v2.sql'))).toBe(true);
    expect(existsSync(path.join(process.cwd(), 'migrations/106_go_v2_live_schedule.sql'))).toBe(true);
    expect(existsSync(path.join(process.cwd(), 'migrations/100_go_tournament_engine_v2.sql'))).toBe(false);
    expect(existsSync(path.join(process.cwd(), 'migrations/101_go_v2_live_schedule.sql'))).toBe(false);
  });

  it('installs an additive normalized V2 schema without replacing legacy GO tables', () => {
    const migration = read('migrations/105_go_tournament_engine_v2.sql');

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS go_engine_version');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_stage_lock_snapshots');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_match_result_revisions');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_match_standing_contributions');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_schedule_versions');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_referee_duties');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_cascade_mutation_batches');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_cascade_mutation_matches');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_mutation_reason_catalog');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_notification_outbox');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_command_receipts');
    expect(migration).not.toMatch(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?go_/i);
  });

  it('makes result, cascade, command and audit history append-only', () => {
    const liveMigration = read('migrations/106_go_v2_live_schedule.sql');
    for (const table of [
      'go_v2_match_result_revisions',
      'go_v2_match_lineup_snapshots',
      'go_v2_cascade_mutation_batches',
      'go_v2_cascade_mutation_matches',
      'go_v2_command_receipts',
      'go_v2_audit_events',
    ]) {
      expect(liveMigration).toContain(`'${table}'`);
    }
    expect(liveMigration).toContain('BEFORE UPDATE OR DELETE');
    expect(liveMigration).toContain('go_v2_reject_immutable_mutation()');
  });

  it('locks a known versioned format template into tournament metadata', () => {
    const repository = read('web/lib/go-v2/repository.ts');
    const service = read('web/lib/go-v2/service.ts');

    expect(repository).toContain('getTournamentFormatTemplateV2(formatTemplateId)');
    expect(repository).toContain('materializeTournamentFormatTemplateV2({');
    expect(repository).toContain('FORMAT_MODE_TEMPLATE_MISMATCH');
    expect(repository).toContain("'formatTemplateId', $3::text");
    expect(repository).toContain("'formatTemplateSchemaVersion', $4::int");
    expect(repository).toContain("'formatTemplateSnapshot', $6::jsonb");
    expect(service).toContain('loadLockedTournamentFormat');
    expect(service).toContain('LOCKED_FORMAT_SNAPSHOT_MISMATCH');
    expect(service).toContain('assertLockedBracketOverrides');
    expect(service).toContain('SHARED_SESSION_REFEREE_POLICY_MISMATCH');
    expect(repository).toContain('lockedFormatSnapshot');
  });

  it('protects admin reads with viewer and every mutation with operator', () => {
    const structure = read(`${adminBase}/structure/route.ts`);
    const service = read('web/lib/go-v2/service.ts');
    expect(structure).toContain("requireApiRole(req, 'viewer')");
    expect(structure).toContain('getGoV2Structure');
    expect(service).toContain('return readGoV2Structure(tournamentId, { requireEnabled: true });');

    const mutationRoutes = [
      'registration/lock/route.ts',
      'draw/preview/route.ts',
      'draw/commit/route.ts',
      'stages/materialize/route.ts',
      'bracket/preview/route.ts',
      'bracket/lock/route.ts',
      'schedule/generate/route.ts',
      'schedule/commit/route.ts',
      'schedule/replan/preview/route.ts',
      'schedule/replan/commit/route.ts',
      'entries/[entryId]/replacement/preview/route.ts',
      'entries/[entryId]/replacement/commit/route.ts',
      'entries/[entryId]/withdrawal/preview/route.ts',
      'incidents/preview/route.ts',
      'mutations/[batchId]/undo/preview/route.ts',
      'mutations/[batchId]/undo/commit/route.ts',
    ];
    for (const relativePath of mutationRoutes) {
      expect(read(`${adminBase}/${relativePath}`), relativePath).toContain(
        "requireApiRole(req, 'operator')",
      );
    }
    for (const relativePath of [
      'matches/[matchId]/result/route.ts',
      'matches/[matchId]/finish/accept/route.ts',
      'matches/[matchId]/finish/reject/route.ts',
      'entries/[entryId]/withdrawal/commit/route.ts',
      'incidents/commit/route.ts',
      'schedule/disruptions/[disruptionId]/resolve/preview/route.ts',
      'schedule/disruptions/[disruptionId]/resolve/commit/route.ts',
      'matches/[matchId]/pause-resolution/preview/route.ts',
      'matches/[matchId]/pause-resolution/commit/route.ts',
    ]) {
      expect(read(`${adminBase}/${relativePath}`), relativePath).toContain('requireGoV2Director(req)');
    }
  });

  it('uses optimistic versions, idempotency receipts, transactions and advisory locks', () => {
    const contracts = read('web/lib/go-v2/contracts.ts');
    const repository = read('web/lib/go-v2/repository.ts');
    const service = read('web/lib/go-v2/service.ts');

    expect(contracts).toContain('expectedVersion');
    expect(contracts).toContain('idempotencyKey');
    expect(contracts).toContain('commandId');
    expect(contracts).toContain('requestHash');
    expect(contracts).toContain('deviceId');
    expect(contracts).toContain('reasonCode');
    expect(repository).toContain("client.query('BEGIN')");
    expect(repository).toContain('pg_advisory_xact_lock');
    expect(repository).toContain('assertExpectedVersion');
    expect(repository).toContain('go_v2_command_receipts');
    expect(repository).toContain("client.query('ROLLBACK')");
    expect(repository).toContain('IDEMPOTENCY_KEY_REUSED');
    expect(service).toContain('RED_CONFIRMATION_REQUIRED');
    expect(service).toContain('entityId: entityId ?? null');
    expect(service).toContain('canonicalCandidate: result.candidate');
    expect(service).toContain("return current === 'schedule_published' || current === 'live' ? 'live' : current");
  });

  it('connects previews and commits to the sports core, scheduler and normalized persistence', () => {
    const service = read('web/lib/go-v2/service.ts');
    const repository = read('web/lib/go-v2/repository.ts');

    expect(service).toContain('materializeTournamentFormatTemplateV2');
    expect(service).toContain('LOCKED_FORMAT_OVERRIDE_FORBIDDEN');
    expect(service).toContain('projectLockedStageGraphPayload');
    expect(service).toContain('const seedEntries: SeedEntry[] = await loadSeedEntries(client, tournamentId)');
    expect(service).toContain('EXPLICIT_PARTICIPANTS_REQUIRE_STANDALONE_BRACKET');
    expect(repository).toContain('assertTournamentEntryMembership');
    expect(repository).toContain('DUPLICATE_TOURNAMENT_ENTRY');
    expect(repository).toContain('ENTRY_TOURNAMENT_MISMATCH');
    expect(service).toContain('seedGroupsSnake');
    expect(service).toContain('generateDoubleElimination');
    expect(service).toContain('solveSchedule');
    expect(service).toContain('persistDraw');
    expect(service).toContain('persistBracket');
    expect(service).toContain('persistScheduleVersion');
    expect(repository).toContain('go_v2_match_slot_sources');
    expect(repository).toContain('go_v2_schedule_assignments');
    expect(repository).toContain('go_v2_match_standing_contributions');
    expect(repository).toContain('CONDITIONAL_MATCH_NOT_ACTIVE');
    expect(repository).toContain('MATCH_RESULT_STATE_FORBIDDEN');
    expect(repository).toContain("bronzeEnabled: bracketType === 'single_elimination'");
    expect(repository).toContain("resetFinalEnabled: bracketType === 'double_elimination'");
  });

  it('exposes a sanitized public structure without admin authorization or audit data', () => {
    const publicRoute = read('web/app/api/go-v2/tournaments/[id]/structure/route.ts');
    const service = read('web/lib/go-v2/service.ts');
    const repository = read('web/lib/go-v2/repository.ts');

    expect(publicRoute).toContain('getPublicGoV2Structure');
    expect(publicRoute).not.toContain('requireApiRole');
    expect(service).toContain("String(version.status) === 'published'");
    const publicMethod = service.slice(
      service.indexOf('export async function getPublicGoV2Structure'),
      service.indexOf('export async function previewGoV2Operation'),
    );
    expect(publicMethod).not.toContain('audit:');
    expect(publicMethod).not.toContain('mutations:');
    expect(publicMethod).not.toContain('metadata: entry.metadata');
    expect(publicMethod).toContain('timezoneBySessionId');
    expect(publicMethod).toContain('currentSchedule');
    expect(repository).toContain("'resultKind', latest_result.result_kind");
    expect(repository).toContain('FROM go_v2_match_result_revisions revision');
    expect(repository).toContain('assembleLivePoolStandings');
    expect(repository).toContain('revision.revision_no = m.current_result_revision_no');
    expect(repository).toContain('LIVE_STANDING_CONTRIBUTIONS_INCOMPLETE');
    expect(repository).toContain('FROM go_v2_stage_edges edge');
    expect(service).toContain('liveStandings');
    expect(service).toContain('immutableStandingStageIds');
    expect(service).toContain('stageEdges');
  });

  it('derives registration pairs when entries are omitted and rejects group format for five teams', () => {
    const repository = read('web/lib/go-v2/repository.ts');

    expect(repository).toContain('deriveRegistrationEntries');
    expect(repository).toContain('tournament_participants');
    expect(repository).toContain('GROUP_FORMAT_UNAVAILABLE_FOR_FIVE');
    expect(repository).toContain('standalone_bracket');
    expect(repository).toContain('derivedEntries.length > 48');
  });

  it('keeps retained downstream matches untouched during a compensating undo', () => {
    const repository = read('web/lib/go-v2/repository.ts');
    const service = read('web/lib/go-v2/service.ts');

    expect(repository).toContain("if (String(child.action) === 'retain')");
    expect(repository).toContain('noOp: true');
    expect(repository).toContain('prior_schedule_assignment_id');
    expect(repository).toContain('new_schedule_assignment_id');
    expect(repository).toContain('MUTATION_ALREADY_UNDONE');
    expect(repository).toContain('revision.revision_no = m.current_result_revision_no');
    expect(repository).toContain('result_revision_no');
    expect(repository).toContain('MATCH_LINEUP_CHANGED_DURING_RESULT');
    expect(repository).toContain("'sourceType', source.source_type");
    expect(service).toContain('priorScheduleState: snapshot?.scheduleState ?? match.scheduleState');
    expect(service).toContain("action: resultKind === 'voided' ? 'void' : 'reroute'");
    expect(service).toContain("'mutation.undo.commit'");
  });

  it('keeps tier schedules parallel and never smuggles a staff judge into working-team mode', () => {
    const service = read('web/lib/go-v2/service.ts');
    const repository = read('web/lib/go-v2/repository.ts');

    expect(service).toContain('const groupMatchIdsByTournament = new Map<string, string[]>()');
    expect(service).toContain('groupMatchIdsByTournament.get(String(match.tournamentId ?? tournamentId))');
    expect(service).not.toContain('previousStageByOrder');
    expect(service).toContain("refereeRequirement = { kind: 'idle_team_candidates', candidateTeamIds: candidates }");
    expect(service).toContain('NO_ELIGIBLE_WORKING_TEAM_REFEREE');
    expect(service).toContain('playerIds,');
    expect(repository).toContain('playerIdsByEntry');
    expect(repository).toContain('go_v2_roster_revision_members');
  });

  it('publishes a shared men/women schedule atomically across linked tournament versions', () => {
    const service = read('web/lib/go-v2/service.ts');
    const repository = read('web/lib/go-v2/repository.ts');

    expect(service).toContain('sessionTournamentVersions');
    expect(service).toContain('pg_try_advisory_xact_lock');
    expect(service).toContain('lockLinkedScheduleStates');
    expect(service).toContain('linkedNextStates');
    expect(service).toContain('SHARED_ACTIVE_SESSION_MISMATCH');
    expect(repository).toContain('sessionTournamentIds');
    expect(repository).toContain('SCHEDULE_SESSION_MEMBERSHIP_MISMATCH');
    expect(repository).toContain('for (const memberTournamentId of sessionTournamentIds)');
    expect(repository).toContain('setActiveScheduleVersion(client, memberTournamentId, scheduleVersionId)');
  });

  it('compiles every published schedule from canonical DB constraints and exposes only the active version', () => {
    const service = read('web/lib/go-v2/service.ts');
    const repository = read('web/lib/go-v2/repository.ts');

    expect(service).not.toContain('payload.solverInput\n        ?');
    expect(service).not.toContain('effectivePayload.solverInput\n        ?');
    expect(service).toContain('const automatic = await buildAutomaticSchedulePayload(client, tournamentId, payload)');
    expect(read(`${adminBase}/schedule/generate/route.ts`)).toContain("'schedule.generate.preview'");
    expect(read(`${adminBase}/schedule/commit/route.ts`)).toContain("'schedule.generate.commit'");
    expect(service).toContain("operation === 'schedule.generate.preview' || operation === 'schedule.replan.preview'");
    expect(service).toMatch(
      /operation === 'schedule\.generate\.commit'[\s\S]{0,120}\|\| operation === 'schedule\.replan\.commit'[\s\S]{0,120}\|\| operation === 'schedule\.policy\.commit'/,
    );
    expect(service).toContain('const commitCanonical = await buildAutomaticSchedulePayload');
    expect(service).toContain('asOf: new Date().toISOString()');
    expect(service).toContain('SCHEDULE_REPLAN_PREVIEW_STALE');
    expect(service).toContain('scheduleHash: commitValidation.scheduleHash');
    expect(service).toContain("String(version.id) === String(structure.tournament.activeScheduleVersionId ?? '')");
    expect(service).toContain('const effectivePublishedStart = forcedTransfer?.resumeNotBefore');
    expect(service).toContain('?? liveEtaOverrides.get(String(match.id))');
    expect(repository).toContain("WHEN NOT $2 THEN 'skipped'");
  });

  it('versions roster replacements and freezes the lineup used by completed matches', () => {
    const repository = read('web/lib/go-v2/repository.ts');
    const service = read('web/lib/go-v2/service.ts');

    expect(repository).toContain('prepareRosterReplacement');
    expect(repository).toContain('FIVB_REPLACEMENT_AFTER_START_FORBIDDEN');
    expect(repository).toContain('FULL_TEAM_REPLACEMENT_AFTER_START_FORBIDDEN');
    expect(repository).toContain('go_v2_match_lineup_snapshots');
    expect(repository).toContain('MATCH_LINEUP_UNRESOLVED');
    expect(service).toContain("'roster.replacement.preview'");
    expect(service).toContain("'roster.replacement.commit'");
  });

  it('applies explicit withdrawal policies and excludes withdrawn entries from qualification', () => {
    const repository = read('web/lib/go-v2/repository.ts');
    const competition = read('web/lib/go-v2/competition.ts');

    expect(repository).toContain('LPV_PRESERVE_PLAYED_FORFEIT_FUTURE');
    expect(repository).toContain('FIVB_2026_MATCH_LEDGER');
    expect(repository).toContain('LOCAL_REDUCE_TO_THREE_ANNUL_RESULTS');
    expect(repository).toContain('LOCAL_FORFEIT_ALL');
    expect(repository).toContain('REDUCE_TO_THREE_REQUIRES_RR_POOL_OF_FOUR');
    expect(repository).toContain('poolMatches.length === 0');
    expect(repository).toContain("registration_state = 'withdrawn'");
    expect(repository).toContain('deferred_forfeit');
    expect(repository).toContain('resolveNoWinnerDownstreamSlots');
    expect(repository).toContain('WITHDRAWAL_QUALIFICATION_CASCADE_REQUIRED');
    expect(repository).toContain('persistQualificationCascadeRematerialization');
    expect(repository).toContain('buildQualificationCascadeTopologyPlan');
    expect(repository).toContain('QUALIFICATION_CASCADE_GROUP_DESCENDANT_REPLAY_REQUIRED');
    expect(repository).not.toContain('QUALIFICATION_CASCADE_REMATERIALIZATION_NOT_AVAILABLE_V1');
    expect(repository).toContain('CASCADE_REPLAY_REQUIRES_ATOMIC_SCHEDULE_REPLAN');
    expect(repository).toContain('downstream.affectedMatches.length > 0');
    expect(competition).toContain('excludedEntryIds');
    expect(competition).toContain('compressActivePoolRanks');
  });

  it('restores immutable winner/loser routes when a no-winner runtime BYE is corrected', () => {
    const baseMigration = read('migrations/105_go_tournament_engine_v2.sql');
    const additiveMigration = read('migrations/106_go_v2_live_schedule.sql');
    const repository = read('web/lib/go-v2/repository.ts');

    expect(baseMigration).toContain('route_source_type TEXT NOT NULL');
    expect(baseMigration).toContain('route_source_match_id UUID');
    expect(additiveMigration).toContain('go_v2_match_slot_route_lineage_immutable');
    expect(additiveMigration).toContain('go_v2_reject_route_lineage_update');
    expect(repository).toContain('JOIN go_v2_match_slot_sources source ON source.route_source_match_id = affected.id');
    expect(repository).toContain("WHERE route_source_match_id = $1\n       AND route_source_type IN ('MATCH_WINNER', 'MATCH_LOSER')");
    expect(repository).toContain('SET source_type = route_source_type,\n         source_match_id = route_source_match_id');
    expect(repository).toContain('SET source_type = source.route_source_type,\n           source_match_id = source.route_source_match_id');
    expect(repository).toContain('route_source_type, route_source_match_id, resolved_entry_id');
    expect(repository).toContain('routeRuntimeByeWinnerDownstream(client, matchId, winnerEntryId, actor)');
    expect(repository).toContain('winner_entry_id = $4, loser_entry_id = $5');
  });

  it('validates checked stage, incident and schedule values before persistence', () => {
    const migration = read('migrations/105_go_tournament_engine_v2.sql');
    const repository = read('web/lib/go-v2/repository.ts');
    const service = read('web/lib/go-v2/service.ts');

    expect(migration).toContain('go_v2_match_lineup_snapshots_result_revision_no_check');
    expect(migration).toContain('CHECK (result_revision_no >= 1)');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS route_source_type TEXT');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS route_source_match_id UUID');
    expect(migration).toContain('SET route_source_type = source_type');
    expect(migration).toContain('ALTER COLUMN route_source_type SET NOT NULL');
    expect(migration).toContain('go_v2_match_slot_route_source_match_fk');
    expect(repository).toContain('INVALID_STAGE_ORDER');
    expect(repository).toContain('INVALID_STAGE_TYPE');
    expect(repository).toContain('INVALID_STAGE_TIER');
    expect(repository).toContain('INVALID_STAGE_ROUTING_KIND');
    expect(repository).toContain('INVALID_INCIDENT_STATUS');
    expect(service).toContain('GROUP_DRAW_NOT_AVAILABLE_FOR_LOCKED_TEMPLATE');
    expect(service).toContain('LOCKED_FORMAT_SNAPSHOT_MISMATCH');
    expect(service).toContain('INVALID_BRACKET_TYPE');
    expect(service).toContain('freezeHorizonMinutes > 1440');
  });
});
