import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const adminBase = 'web/app/api/admin/go-v2/tournaments/[id]';

describe('GO V2 day-of-tournament safety source contract', () => {
  it('installs attendance, disruptions and immutable history additively in migration 103', () => {
    const migration = read('migrations/106_go_v2_live_schedule.sql');

    expect(migration).toContain('go_v2_attendance_policies');
    expect(migration).toContain('check_in_open_minutes_before');
    expect(migration).toContain('check_in_deadline_minutes_before');
    expect(migration).toContain('grace_period_minutes');
    expect(migration).toContain('technical_result_requires_director');
    expect(migration).toContain('go_v2_attendance_events');
    expect(migration).toContain('go_v2_schedule_disruptions');
    expect(migration).toContain("'court_close', 'court_reopen', 'global_pause'");
    expect(migration).toContain('go_v2_reject_immutable_mutation');
    expect(migration).toContain('go_v2 immutable history is append-only');
    expect(migration).toContain("'go_v2_rating_snapshots'");
    expect(migration).toContain("'go_v2_stage_lock_snapshots'");
    expect(migration).toContain("'go_v2_standing_snapshots'");
    expect(migration).toContain("'go_v2_qualification_snapshots'");
  });

  it('requires preview/commit and never turns attendance into an automatic result', () => {
    const live = read('web/lib/go-v2/live-operations.ts');
    const preview = read(`${adminBase}/entries/[entryId]/attendance/preview/route.ts`);
    const commit = read(`${adminBase}/entries/[entryId]/attendance/commit/route.ts`);

    expect(preview).toContain("'attendance.preview'");
    expect(commit).toContain("'attendance.commit'");
    expect(preview).toContain("requireApiRole(req, 'operator')");
    expect(commit).toContain("requireApiRole(req, 'operator')");
    expect(live).toContain('LATE_HOLD_REQUIRED');
    expect(live).toContain('checkInDeadlineAt');
    expect(live).toContain('deadlineAt: checkInDeadlineAt');
    expect(live).toContain('isLateAtEffectiveTime');
    expect(live).toContain('NO_SHOW_GRACE_PERIOD_ACTIVE');
    expect(live).toContain('createsTechnicalResult: false');
    expect(live).toContain("'incident_preview_required'");
  });

  it('records disruptions, pauses live matches and requires a separate replan/result decision', () => {
    const live = read('web/lib/go-v2/live-operations.ts');
    const preview = read(`${adminBase}/schedule/disruptions/preview/route.ts`);
    const commit = read(`${adminBase}/schedule/disruptions/commit/route.ts`);

    expect(preview).toContain("'disruption.preview'");
    expect(commit).toContain("'disruption.commit'");
    expect(live).toContain("SET play_state = 'paused'");
    expect(live).toContain('operatorDecisionRequired');
    expect(live).toContain('incompleteResultCreated: false');
    expect(live).toContain("'choose_transfer_or_incomplete'");
    expect(live).toContain("'schedule.replan.preview'");
    expect(read('web/lib/go-v2/service.ts')).toContain('DISRUPTION_PREVIEW_RISK_ESCALATED');
    expect(read('web/lib/go-v2/service.ts')).toContain('authoritativeDisruptions');
    expect(read('web/lib/go-v2/service.ts')).toContain('ACTIVE_SESSION_COURT_MISMATCH');
    expect(read('web/lib/go-v2/service.ts')).toContain('subtractGoV2BlockedWindows');
    expect(live).toContain('DISRUPTION_RESOLVE_ENDPOINT_REQUIRED');
    expect(live).toContain('prepareGoV2DisruptionResolution');
    expect(live).toContain("status = 'active'");
    expect(live).toContain('expectedEndAt is an ETA only');
    expect(live).toContain('scheduleSessionId');
    expect(read('web/lib/go-v2/repository.ts')).toContain('disruption.schedule_session_id IN (');
  });

  it('uses random hashed single-writer court grants with TTL, rotation and rate limits', () => {
    const migration = read('migrations/106_go_v2_live_schedule.sql');
    const live = read('web/lib/go-v2/live-operations.ts');

    expect(migration).toContain('go_v2_court_grants_single_writer_uidx');
    expect(migration).toContain('ON go_v2_court_grants(schedule_session_id, court_id)');
    expect(migration).toContain('token_hash       TEXT NOT NULL UNIQUE');
    expect(migration).toContain('go_v2_court_grant_rate_limits');
    expect(live).toContain('const grantId = randomUUID()');
    expect(live).toContain("createHmac('sha256', secret)");
    expect(live).toContain('GO_V2_COURT_TOKEN_SECRET');
    expect(live).toContain('COURT_GRANT_SECRET_NOT_CONFIGURED');
    expect(live).toContain("createHash('sha256').update(token).digest('hex')");
    expect(live).toContain("revoke_reason = 'expired_rotation_cleanup'");
    expect(live).toContain('expires_at <= now()');
    expect(live).toContain('targetDeviceId');
    expect(live).toContain('issuerDeviceId');
    expect(live).toContain('COURT_GRANT_DEVICE_MISMATCH');
    expect(live).toContain('COURT_GRANT_RATE_LIMITED');
    expect(live).toContain('replayedFromDeterministicReceipt: true');
    expect(live).toContain('COURT_GRANT_REPLAY_REQUIRES_ROTATION');
    expect(live).toContain('COURT_GRANT_SECRET_CHANGED');
    expect(live).toContain('responsePayload: redactedResponse');
    expect(live).toContain('tokenStoredInReceipt: false');
    expect(live).toContain('deterministicReplaySupported: true');
    expect(live).toContain('schedule_session_id::text');
    expect(live).not.toMatch(/INSERT INTO go_v2_court_grants[\s\S]{0,500}token[,)]/);
    const issueGrantSource = live.slice(
      live.indexOf('export async function issueGoV2CourtGrant'),
      live.indexOf('export async function revokeGoV2CourtGrant'),
    );
    expect(issueGrantSource).not.toContain('responsePayload: response,');
    expect(issueGrantSource).not.toMatch(/diffPayload:\s*\{[\s\S]{0,300}\btoken\s*[,}]/);
  });

  it('provides grant-authenticated judge read/command APIs and no last-write-wins merge', () => {
    const readRoute = read('web/app/api/go-v2/judge/tournaments/[id]/court/route.ts');
    const commandRoute = read('web/app/api/go-v2/judge/tournaments/[id]/commands/route.ts');
    const live = read('web/lib/go-v2/live-operations.ts');

    expect(readRoute).toContain('getGoV2JudgeCourtState');
    expect(readRoute).toContain("req.headers.get('x-go-v2-device-id')");
    expect(commandRoute).toContain('applyGoV2JudgeCommand');
    expect(readRoute).not.toContain('requireApiRole');
    expect(commandRoute).not.toContain('requireApiRole');
    expect(live).toContain('JUDGE_COMMAND_VERSION_CONFLICT');
    expect(live).toContain('MATCH_OUTSIDE_COURT_GRANT');
    expect(live).toContain("'match.finish.request'");
    expect(live).toContain('finishReviewRequired');
    expect(live).toContain('INVALID_JUDGE_REASON_CODE');
    expect(live).toContain('validateGoV2JudgeLiveScore');
    expect(live).toContain('loadJudgeBlockingHolds');
    expect(live).toContain('COURT_LANE_OCCUPIED');
    expect(live).toContain('computedPlayState');
    expect(live).toContain("eventType: 'judge.match.start'");
    expect(live).toContain('AND match.tournament_id = $1');
    expect(live).toContain('AND match.tournament_id = $3');
    expect(live).toContain('[grantRow.active_schedule_version_id, grantRow.court_id, tournamentId]');
    expect(live).not.toContain('last-write-wins');
  });

  it('requires a second real admin actor for every red commit', () => {
    const migration = read('migrations/106_go_v2_live_schedule.sql');
    const approval = read(`${adminBase}/approvals/[previewId]/route.ts`);
    const live = read('web/lib/go-v2/live-operations.ts');
    const service = read('web/lib/go-v2/service.ts');

    expect(approval).toContain("requireApiRole(req, 'admin')");
    expect(approval).toContain('export async function GET(');
    expect(approval).toContain('getGoV2RedOperationPreview');
    expect(migration).toContain('CHECK (requested_by <> approved_by)');
    expect(live).toContain('SECOND_APPROVER_REQUIRED');
    expect(live).toContain("operationKind: 'red_operation.approve'");
    expect(live).toContain('approval_consumed_at');
    expect(live).toContain('authorId: String(row.created_by)');
    expect(live).toContain('reviewedInputHash');
    expect(live).toContain('reviewedAggregateVersion');
    expect(migration).toContain('reviewed_input_hash');
    expect(migration).toContain('reviewed_aggregate_version');
    expect(service).toContain("redApprovalId: risk === 'red'");
    expect(service).toContain('consumeGoV2RedApproval');
    expect(service).toContain('SECOND_APPROVAL_REQUIRED');
    expect(service).toContain('redApprovalId');
  });

  it('adds leased outbox delivery with backoff/dead-letter receipts and Telegram bridge', () => {
    const migration = read('migrations/106_go_v2_live_schedule.sql');

    expect(migration).toContain('next_attempt_at');
    expect(migration).toContain('lease_owner');
    expect(migration).toContain('lease_expires_at');
    expect(migration).toContain('max_attempts');
    expect(migration).toContain('dead_lettered_at');
    expect(migration).toContain('delivery_receipt');
    expect(migration).toContain('FOR UPDATE SKIP LOCKED');
    expect(migration).toContain('go_v2_complete_notification_outbox');
    expect(migration).toContain('go_v2_fail_notification_outbox');
    expect(migration).toContain('power(2');
    expect(migration).toContain('go_v2_bridge_telegram_notification');
    expect(migration).toContain('INSERT INTO telegram_outbox');
    expect(read('migrations/108_go_v2_pilot_live_safety.sql')).toContain(
      'go_v2_begin_telegram_outbox_attempt',
    );
    expect(read('migrations/108_go_v2_pilot_live_safety.sql')).toContain(
      'go_v2_quarantine_unknown_telegram_outbox',
    );
  });

  it('keeps rating projection shadow-only and idempotent by final standings hash', () => {
    const migration = read('migrations/106_go_v2_live_schedule.sql');
    const live = read('web/lib/go-v2/live-operations.ts');
    const route = read(`${adminBase}/rating/shadow/route.ts`);

    expect(migration).toContain('go_v2_rating_projection_runs');
    expect(migration).toContain('UNIQUE (tournament_id, standings_hash)');
    expect(migration).toContain("DEFAULT 'shadow'");
    expect(route).toContain("requireApiRole(req, 'admin')");
    expect(live).toContain('RATING_REQUIRES_FINISHED_TOURNAMENT');
    expect(live).toContain('RATING_APPLY_DISABLED');
    expect(live).toContain('ratingMutated: false');
    expect(live).not.toMatch(/UPDATE\s+players\s+SET/i);
  });
});
