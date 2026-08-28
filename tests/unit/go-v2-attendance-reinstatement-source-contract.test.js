import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('GO V2 attendance reinstatement source contract', () => {
  it('exposes director-only preview and commit routes', () => {
    const previewRoute = read('web/app/api/admin/go-v2/tournaments/[id]/attendance/reinstate/preview/route.ts');
    const commitRoute = read('web/app/api/admin/go-v2/tournaments/[id]/attendance/reinstate/commit/route.ts');
    const authorization = read('web/lib/go-v2/authorization.ts');

    expect(previewRoute).toContain('requireGoV2Director(req)');
    expect(previewRoute).toContain("'attendance.reinstate.preview'");
    expect(commitRoute).toContain('requireGoV2Director(req)');
    expect(commitRoute).toContain("'attendance.reinstate.commit'");
    expect(authorization).toContain("'attendance.reinstate.preview'");
    expect(authorization).toContain("'attendance.reinstate.commit'");
  });

  it('prevents ordinary attendance commands from bypassing awarded-result impact review', () => {
    const liveOperations = read('web/lib/go-v2/live-operations.ts');

    expect(liveOperations).toContain("if (from === 'no_show') return false");
    expect(liveOperations).toContain('ATTENDANCE_REINSTATEMENT_WORKFLOW_REQUIRED');
    expect(liveOperations).toContain("match.play_state IN ('live', 'paused')");
    expect(liveOperations).toContain('technicalResultCreated: false');
  });

  it('freezes exact impact and successor schedule, then commits without re-solving', () => {
    const service = read('web/lib/go-v2/service.ts');
    const applyStart = service.indexOf('async function applyDomainOperation');
    const commitStart = service.indexOf("case 'attendance.reinstate.commit':", applyStart);
    const commitEnd = service.indexOf("case 'disruption.commit'", commitStart);
    const commitCase = service.slice(commitStart, commitEnd);
    const freshnessStart = service.indexOf("if (operation === 'attendance.reinstate.commit')");
    const freshnessEnd = service.indexOf("if (\n      operation === 'match.paper_import.commit'", freshnessStart);
    const freshness = service.slice(freshnessStart, freshnessEnd);

    expect(service).toContain('resultRouteSnapshots');
    expect(service).toContain('qualificationChanges');
    expect(service).toContain('successorScheduleHash');
    expect(service).toContain("'walkover', 'forfeit', 'mutual_no_show', 'admin_award'");
    expect(service).toContain('SECOND_APPROVAL_REQUIRED');
    expect(commitCase).toContain('appendResultRevision');
    expect(commitCase).toContain('persistPendingReplayQualificationInvalidation');
    expect(commitCase).toContain('persistScheduleVersion');
    expect(commitCase).toContain('persistGoV2AttendanceReinstatement');
    expect(commitCase).toContain("live_score = '{}'::jsonb");
    expect(commitCase).toContain('command_version = command_version + 1');
    expect(commitCase).toContain('go_v2_match_court_segments');
    expect(commitCase).not.toContain('solveSchedule(');
    expect(freshness).toContain('validateSchedule(');
    expect(freshness).not.toContain('solveSchedule(');
    expect(read('web/lib/go-v2/repository.ts')).toContain(
      'Historical actual timing,\n    // live ETA and locks remain on the superseded schedule version.',
    );
  });

  it('projects append-only reinstatement lineage for admin UI and notifications', () => {
    const repository = read('web/lib/go-v2/repository.ts');
    const delivery = read('web/lib/go-v2/notification-delivery.ts');

    expect(repository).toContain('attendanceReinstatements');
    expect(repository).toContain("String(record(event.payload).operation ?? '') === 'attendance.reinstate.commit'");
    expect(repository).toContain("String(event.reasonCode ?? '') === 'attendance_reinstated'");
    expect(repository).toContain("String(event.fromState ?? '') === 'no_show'");
    expect(delivery).toContain("case 'attendance.reinstate.commit':");
  });
});
