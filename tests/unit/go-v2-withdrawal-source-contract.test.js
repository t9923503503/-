import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('GO V2 FIVB withdrawal source contract', () => {
  it('keeps reason-specific FIVB ledgers and deferred settlement metadata', () => {
    const repository = read('web/lib/go-v2/repository.ts');

    expect(repository).toContain("'injury_before_match'");
    expect(repository).toContain("'medical_withdrawal'");
    expect(repository).toContain("'no_show'");
    expect(repository).toContain("'refusal_to_play'");
    expect(repository).toContain('fivbLoserMatchPoints');
    expect(repository).toContain('withdrawalCause: causeRule.cause');
    expect(repository).toContain('withdrawalCause: causeRule.cause,');
    expect(repository).toContain("['withdrawn', 'disqualified'].includes(slot.registrationState)");
    expect(repository).toContain('ralliesFor: fivbLedger && winnerEntryId === context.teamAId ? 0');
    expect(repository).toContain('ralliesAgainst: fivbLedger && winnerEntryId === context.teamAId ? 0');
  });

  it('fails closed for an anti-doping pool cascade and preserves completed pool rank', () => {
    const repository = read('web/lib/go-v2/repository.ts');

    expect(repository).toContain('FIVB_ANTIDOPING_POOL_CASCADE_REQUIRED');
    expect(repository).toContain("requiredOperation: 'anti_doping_pool_cascade'");
    expect(repository).toContain("action = row.pool_id ? 'fivb_anti_doping_forfeit'");
    expect(repository).toContain('withdrawalPreserveCompletedPoolRank');
    expect(repository).toContain('allowInactiveWithPreservedPoolRank: true');
    expect(repository).toContain('automaticallyRoutedMatchIds');
  });

  it('keeps registration and day-of attendance withdrawal state in one audited commit', () => {
    const repository = read('web/lib/go-v2/repository.ts');
    const service = read('web/lib/go-v2/service.ts');

    expect(repository).toContain('attendance_state = $3');
    expect(repository).toContain('attendance_version = $5');
    expect(repository).toContain('INSERT INTO go_v2_attendance_events');
    expect(repository).toContain("source: 'entry.withdrawal.commit'");
    expect(repository).toContain('technicalResultCreatedAutomatically: false');
    expect(service).toContain('commandId: input.command.commandId');
    expect(service).toContain('deviceId: input.command.deviceId');
    expect(service).toContain("'entry.withdrawal.preview': ['registration_locked', 'draw_locked'");
    expect(service).toContain("'entry.withdrawal.commit': ['registration_locked', 'draw_locked'");
  });

  it('enforces two-member pairs at both registration lock and roster replacement', () => {
    const repository = read('web/lib/go-v2/repository.ts');
    const workspace = read('web/components/go-v2/TournamentEngineV2Workspace.tsx');

    expect(repository.match(/members\.length !== 2/g)).toHaveLength(3);
    expect(repository).toContain('INVALID_PAIR_ROSTER');
    expect(repository).toContain('deriveGoV2PairRating({ members })');
    expect(repository).not.toContain('entry.ratingSnapshotValue ?? entry.rating ?? memberRating');
    expect(repository).toContain('ROSTER_BASELINE_MISSING_AFTER_START');
    expect(repository).toContain('sharesGoV2OriginalPairMember(baselineMembers, normalizedMembers)');
    expect(repository).toContain('lineupSourceRevisionNo: Number(prior.rows[0].revision_no)');
    expect(repository).not.toContain('requires 1-4 roster members');
    expect(repository).not.toContain('requires 1-4 members');
    expect(workspace).not.toContain('<option value={3}>Игрок 3</option>');
    expect(workspace).toContain('withdrawalCause');
    expect(workspace).toContain('confirmRedWithdrawal');
  });
});
