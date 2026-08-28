import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');

describe('GO V2 schedule defer release source contract', () => {
  const service = read('web', 'lib', 'go-v2', 'service.ts');
  const contracts = read('web', 'lib', 'go-v2', 'contracts.ts');
  const client = read('web', 'lib', 'go-v2', 'client-admin-command.ts');
  const repository = read('web', 'lib', 'go-v2', 'repository.ts');
  const notification = read('web', 'lib', 'go-v2', 'notification-delivery.ts');
  const migration = read('migrations', '108_go_v2_pilot_live_safety.sql');
  const previewRoute = read(
    'web', 'app', 'api', 'admin', 'go-v2', 'tournaments', '[id]',
    'schedule', 'defer', 'release', 'preview', 'route.ts',
  );
  const commitRoute = read(
    'web', 'app', 'api', 'admin', 'go-v2', 'tournaments', '[id]',
    'schedule', 'defer', 'release', 'commit', 'route.ts',
  );

  it('exposes operator-authenticated preview/commit with canonical client hashing', () => {
    expect(contracts).toContain("| 'schedule.defer.release.preview'");
    expect(contracts).toContain("| 'schedule.defer.release.commit'");
    expect(client).toContain("'/schedule/defer/release/preview': 'schedule.defer.release.preview'");
    expect(client).toContain("'/schedule/defer/release/commit': 'schedule.defer.release.commit'");
    expect(previewRoute).toContain("requireApiRole(req, 'operator')");
    expect(commitRoute).toContain("requireApiRole(req, 'operator')");
  });

  it('releases only the latest active generic defer for a pending/ready match', () => {
    expect(service).toContain("'ACTIVE_SCHEDULE_DEFER_REQUIRED'");
    expect(service).toContain("'PAUSE_RESOLUTION_RELEASE_REQUIRED'");
    expect(service).toContain("'DEFER_RELEASE_MATCH_STATE_FORBIDDEN'");
    expect(service).toContain("String(latestOverride.rows[0].action) !== 'defer'");
    expect(service).toContain('activeOverride.pause_resolution_id');
    expect(service).toContain("playState !== 'pending' && playState !== 'ready'");
  });

  it('solves the successor once and commit only validates frozen assignments/hash', () => {
    const commitService = service.slice(service.indexOf('export async function commitGoV2Operation'));
    expect(service).toContain('const prepared = await prepareGoV2ScheduleDeferRelease');
    expect(service).toContain('releasedDefer: { matchId: request.matchId }');
    expect(service).toContain('releasedDefer ? undefined : deferNotBeforeByMatchId.get');
    expect(commitService).not.toContain('solveSchedule(');
    expect(commitService).toContain("operation === 'schedule.defer.release.commit'");
    expect(commitService).toContain("'SCHEDULE_DEFER_RELEASE_PREVIEW_STALE'");
    expect(commitService).toContain('previewSolverResult.scheduleHash ??');
  });

  it('writes an immutable compensating release with schedule lineage and no sporting mutation', () => {
    const applyDomainStart = service.indexOf('async function applyDomainOperation');
    const releaseCaseStart = service.indexOf("case 'schedule.defer.release.commit':", applyDomainStart);
    const releaseCase = service.slice(
      releaseCaseStart,
      service.indexOf("case 'stage.rules.commit':", releaseCaseStart),
    );
    expect(releaseCase).toContain("$1, $2, $3, 'release', NULL, NULL, NULL");
    expect(releaseCase).toContain('prior_schedule_version_id, successor_schedule_version_id');
    expect(releaseCase).toContain('supersedes_id, reason_code, reason_note, actor_id, command_id');
    expect(releaseCase).toContain('sportingStateChanged: false');
    expect(releaseCase).not.toContain('UPDATE go_v2_matches');
    expect(migration).toContain("('schedule_defer_released', 'Schedule defer override released', true)");
    expect(migration).toContain("(action = 'release' AND defer_mode IS NULL AND not_before IS NULL)");
  });

  it('projects release readiness for admin UI and sends the normal committed notification', () => {
    expect(repository).toContain("'isActive'");
    expect(repository).toContain("'isGeneric'");
    expect(repository).toContain("'canRelease'");
    expect(repository).toContain("match.play_state IN ('pending', 'ready')");
    expect(repository).toContain('WHERE child.supersedes_id = override.id');
    expect(notification).toContain("case 'schedule.defer.release.commit':");
  });
});
