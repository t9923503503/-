import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const adminBase = 'web/app/api/admin/go-v2/tournaments/[id]';

describe('GO V2 pilot live-safety source contract', () => {
  it('adds result provenance, explicit disruption scope and immutable live decisions', () => {
    const migration = read('migrations/108_go_v2_pilot_live_safety.sql');

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS result_source');
    expect(migration).toContain("'judge_review', 'paper_import', 'incident', 'withdrawal'");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS scope_kind');
    expect(migration).toContain("scope_kind = 'match'");
    expect(migration).toContain('expected_end_at is an advisory ETA');
    expect(migration).toContain('publication_kind');
    expect(migration).toContain('input_snapshot');
    expect(migration).toContain('validator_result');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_match_pause_resolutions');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_disruption_resolutions');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_schedule_defer_overrides');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_match_court_segments');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON go_v2_match_pause_resolutions');
  });

  it('maps only global admin to tournament director while operator retains urgent hold creation', () => {
    const authorization = read('web/lib/go-v2/authorization.ts');
    const disruptionPreview = read(`${adminBase}/schedule/disruptions/preview/route.ts`);
    const disruptionCommit = read(`${adminBase}/schedule/disruptions/commit/route.ts`);

    expect(authorization).toContain("actor.role === 'admin'");
    expect(authorization).toContain('TOURNAMENT_DIRECTOR_REQUIRED');
    expect(authorization).toContain("directorMapping: 'global_admin'");
    expect(disruptionPreview).toContain("requireApiRole(req, 'operator')");
    expect(disruptionCommit).toContain("requireApiRole(req, 'operator')");
    for (const route of [
      'matches/[matchId]/result/route.ts',
      'matches/[matchId]/paper-import/preview/route.ts',
      'matches/[matchId]/paper-import/commit/route.ts',
      'matches/[matchId]/finish/accept/route.ts',
      'matches/[matchId]/finish/reject/route.ts',
      'entries/[entryId]/withdrawal/commit/route.ts',
      'incidents/commit/route.ts',
      'schedule/disruptions/[disruptionId]/resolve/preview/route.ts',
      'schedule/disruptions/[disruptionId]/resolve/commit/route.ts',
      'matches/[matchId]/pause-resolution/preview/route.ts',
      'matches/[matchId]/pause-resolution/commit/route.ts',
    ]) {
      expect(read(`${adminBase}/${route}`), route).toContain('requireGoV2Director(req)');
    }
  });

  it('keeps hold ETA advisory, rejects stale/future effective times and resolves by id', () => {
    const live = read('web/lib/go-v2/live-operations.ts');
    const service = read('web/lib/go-v2/service.ts');

    expect(live).toContain('DISRUPTION_EFFECTIVE_TIME_OUT_OF_RANGE');
    expect(live).toContain('toleranceSeconds: 120');
    expect(live).toContain('DISRUPTION_RESOLVE_ENDPOINT_REQUIRED');
    expect(live).toContain('prepareGoV2DisruptionResolution');
    expect(live).toContain('persistGoV2DisruptionResolution');
    expect(live).toContain('expectedEndAt is an ETA only');
    expect(live).not.toContain('expected_end_at > now()');
    expect(live).toContain("'medical_delay',");
    expect(live).toContain('PAUSE_RESOLUTION_REQUIRED');
    expect(live).toContain('MATCH_DEFERRED');
    expect(service).toContain('activeMatchHoldNotBeforeByMatchId');
    expect(service).toContain('PAUSE_DISRUPTION_REQUIRED');
    expect(service).toContain('advisoryExpectedEndAt');
    expect(service).toContain('expected_end_at is advisory ETA');
    expect(service).toContain("'disruption.resolve.commit'");
  });

  it('routes existing result corrections to incidents and accepts only timed played paper imports', () => {
    const service = read('web/lib/go-v2/service.ts');
    const repository = read('web/lib/go-v2/repository.ts');

    expect(service).toContain('PAPER_IMPORT_MODE_REQUIRED');
    expect(service).toContain('DIRECT_RESULT_ENDPOINT_RETIRED');
    expect(service).toContain('PAPER_IMPORT_REASON_REQUIRED');
    expect(service).toContain('INCIDENT_PREVIEW_REQUIRED');
    expect(service).toContain('PAPER_IMPORT_ACTUAL_TIMING_REQUIRED');
    expect(service).toContain('PAPER_IMPORT_ACTUAL_TIME_CONFLICT');
    expect(service).toContain('PAPER_IMPORT_ASSIGNMENT_MISSING');
    expect(service).toContain("resultSource: 'paper_import'");
    expect(service).toContain("'match.paper_import.preview'");
    expect(service).toContain("'match.paper_import.commit'");
    expect(repository).toContain('result_source');
    expect(service).toContain("'match.result.revise': ['schedule_published', 'live']");
  });

  it('serializes entry/player runtime lanes and blocks roster, withdrawal and attendance while paused', () => {
    const live = read('web/lib/go-v2/live-operations.ts');
    const repository = read('web/lib/go-v2/repository.ts');

    expect(live).toContain('assertGoV2RuntimePlayerMutex');
    expect(live).toContain('PLAYER_IDENTITY_REQUIRED_FOR_SHARED_SESSION');
    expect(live).toContain('PLAYER_LANE_OCCUPIED');
    expect(live).toContain('FROM players');
    expect(live).toContain("active_match.play_state IN ('live', 'paused')");
    expect(repository).toContain("bool_or(match.play_state IN ('live', 'paused'))");
    expect(repository).toContain("['live', 'paused'].includes(String(row.play_state))");
    expect(live).toContain("match.play_state IN ('live', 'paused')");
  });

  it('publishes a validated successor schedule for transfer and records defer/resume decisions append-only', () => {
    const service = read('web/lib/go-v2/service.ts');
    const repository = read('web/lib/go-v2/repository.ts');
    const live = read('web/lib/go-v2/live-operations.ts');

    expect(service).toContain('prepareGoV2PauseResolution');
    expect(service).toContain('PAUSE_TRANSFER_SCHEDULE_INFEASIBLE');
    expect(service).toContain("publicationKind: 'live_transfer'");
    expect(service).toContain("'match.pause_resolution.commit'");
    expect(service).toContain('lockLinkedScheduleStates');
    expect(repository).toContain('source_preview_id');
    expect(repository).toContain('input_snapshot');
    expect(repository).toContain('validator_result');
    expect(repository).toContain('actual_start, actual_end');
    expect(live).toContain('persistGoV2PauseResolution');
    expect(live).toContain('PAUSE_RESOLUTION_REASON_MISMATCH');
    expect(live).toContain('automaticResume: false');
  });
});
