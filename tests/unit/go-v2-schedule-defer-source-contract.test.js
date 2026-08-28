import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');

describe('GO V2 schedule defer source contract', () => {
  const service = read('web', 'lib', 'go-v2', 'service.ts');
  const contracts = read('web', 'lib', 'go-v2', 'contracts.ts');
  const client = read('web', 'lib', 'go-v2', 'client-admin-command.ts');
  const migration = read('migrations', '108_go_v2_pilot_live_safety.sql');
  const previewRoute = read(
    'web', 'app', 'api', 'admin', 'go-v2', 'tournaments', '[id]',
    'schedule', 'defer', 'preview', 'route.ts',
  );
  const commitRoute = read(
    'web', 'app', 'api', 'admin', 'go-v2', 'tournaments', '[id]',
    'schedule', 'defer', 'commit', 'route.ts',
  );

  it('exposes operator-authenticated preview and commit commands', () => {
    expect(contracts).toContain("| 'schedule.defer.preview'");
    expect(contracts).toContain("| 'schedule.defer.commit'");
    expect(client).toContain("'/schedule/defer/preview': 'schedule.defer.preview'");
    expect(client).toContain("'/schedule/defer/commit': 'schedule.defer.commit'");
    expect(previewRoute).toContain("requireApiRole(req, 'operator')");
    expect(commitRoute).toContain("requireApiRole(req, 'operator')");
  });

  it('fails closed outside pending/ready and escalates locked or frozen assignments', () => {
    expect(service).toContain("playState !== 'pending' && playState !== 'ready'");
    expect(service).toContain("'DEFER_MATCH_STATE_FORBIDDEN'");
    expect(service).toContain('scheduleDeferRequiresDirector({');
    expect(service).toContain("actor.role !== 'admin'");
    expect(service).toContain("'TOURNAMENT_DIRECTOR_REQUIRED'");
  });

  it('solves once in preview and commit only validates the stored successor assignments', () => {
    const commitService = service.slice(service.indexOf('export async function commitGoV2Operation'));
    expect(service).toContain('const prepared = await prepareGoV2ScheduleDefer');
    expect(service).toContain('const solverResult = solveSchedule(automatic.solverInput)');
    expect(commitService).not.toContain('solveSchedule(');
    expect(commitService).toContain('const commitValidation = validateSchedule(');
    expect(commitService).toContain("previewSolverResult.scheduleHash ?? '') !== commitValidation.scheduleHash");
    expect(service).toContain("publicationKind: 'schedule_defer'");
    expect(service).toContain("kind: 'schedule_defer'");
  });

  it('records immutable preview and schedule lineage without changing sporting state', () => {
    expect(migration).toContain("'schedule_defer'");
    expect(migration).toContain("'stage_rule_change'");
    expect(migration).toContain("('schedule_deferred', 'Pending or ready match deferred in schedule', true)");
    expect(migration).toContain('source_preview_id     UUID REFERENCES go_v2_operation_previews');
    expect(migration).toContain('prior_schedule_version_id UUID REFERENCES go_v2_schedule_versions');
    expect(migration).toContain('successor_schedule_version_id UUID REFERENCES go_v2_schedule_versions');
    expect(migration).toContain('go_v2_schedule_defer_overrides_lineage_check');
    expect(migration).toContain('go_v2_schedule_defer_overrides_preview_uidx');
    expect(service).toContain('sportingStateChanged: false');
    expect(service).toContain("action: 'release'");
    expect(service).toContain("previewPath: '/schedule/defer/release/preview'");
    expect(service).toContain('requiresSuccessorSchedule: true');
  });
});
