import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const routeBase = 'web/app/api/admin/go-v2/tournaments/[id]/schedule/policy';

describe('GO V2 court-policy preview/commit source contract', () => {
  it('keeps both endpoints director-only and distinct', () => {
    const preview = read(`${routeBase}/preview/route.ts`);
    const commit = read(`${routeBase}/commit/route.ts`);
    expect(preview).toContain('requireGoV2Director(req)');
    expect(preview).toContain("'schedule.policy.preview'");
    expect(commit).toContain('requireGoV2Director(req)');
    expect(commit).toContain("'schedule.policy.commit'");
  });

  it('publishes the immutable preview assignments before recording the exception revision', () => {
    const contracts = read('web/lib/go-v2/contracts.ts');
    const authorization = read('web/lib/go-v2/authorization.ts');
    const service = read('web/lib/go-v2/service.ts');
    const repository = read('web/lib/go-v2/repository.ts');
    expect(contracts).toContain("| 'schedule.policy.preview'");
    expect(contracts).toContain("| 'schedule.policy.commit'");
    expect(authorization).toContain("'schedule.policy.preview'");
    expect(authorization).toContain("'schedule.policy.commit'");
    expect(service).toContain("risk: 'amber'");
    expect(service).toContain('const activeScope = await loadActiveScheduleCommandScope');
    expect(service).toContain('sessionTournamentIds: activeScope.sessionTournamentIds');
    expect(service).toContain('sessionTournamentVersions: activeScope.sessionTournamentVersions');
    expect(service).toContain("publicationKind: 'court_policy_exception'");
    expect(service).toContain('parseGoV2CourtPolicyExceptionRequest');
    expect(service).toContain('const persistedSchedule = await persistScheduleVersion');
    expect(service.indexOf('const persistedSchedule = await persistScheduleVersion'))
      .toBeLessThan(service.indexOf('const revision = await persistGoV2CourtPolicyExceptionRevision'));
    expect(repository).toContain('go_v2_court_policy_exception_revisions');
    expect(repository).toContain("revision.decision = 'approve'");
    expect(repository).toContain('successor_schedule_version_id');
  });
});
