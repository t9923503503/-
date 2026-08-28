import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('GO V2 finish review transactional contract', () => {
  it('exposes director-only accept/reject endpoints with server actor context', () => {
    for (const decision of ['accept', 'reject']) {
      const route = read(`web/app/api/admin/go-v2/tournaments/[id]/matches/[matchId]/finish/${decision}/route.ts`);
      expect(route).toContain('requireGoV2Director(req)');
      expect(route).toContain(`'match.finish.${decision}'`);
      expect(route).toContain('auth.actor');
    }
  });

  it('serializes accept/reject and makes lost-response retries idempotent', () => {
    const service = read('web/lib/go-v2/service.ts');
    const repository = read('web/lib/go-v2/repository.ts');
    const commit = service.slice(
      service.indexOf('export async function commitGoV2Operation'),
      service.indexOf('export function goV2ErrorResponse'),
    );
    expect(commit).toContain('withGoV2Transaction(tournamentId');
    expect(repository).toContain('pg_advisory_xact_lock');
    expect(commit.indexOf('findCommandReceipt')).toBeLessThan(commit.indexOf('assertExpectedVersion'));
    expect(commit).toContain('return replayedResponse(receipt.responsePayload)');
    expect(commit).toContain('saveCommandReceipt');
  });

  it('uses a locked match/live CAS, publishes only acceptance and reconciles completion', () => {
    const live = read('web/lib/go-v2/live-operations.ts');
    const service = read('web/lib/go-v2/service.ts');
    const review = live.slice(
      live.indexOf('export async function persistGoV2FinishReviewDecision'),
      live.indexOf('function assertDeclaredHash'),
    );
    const publicOperations = service.slice(
      service.indexOf('const PUBLIC_NOTIFICATION_OPERATIONS'),
      service.indexOf('const PROGRESS_RECONCILIATION_OPERATIONS'),
    );
    expect(review).toContain('FOR UPDATE OF match');
    expect(review).toContain('FROM go_v2_live_match_state');
    expect(review).toContain('FOR UPDATE');
    expect(review).toContain('AND command_version = $2');
    expect(review).toContain('AND finish_requested = true');
    expect(review).toContain('preparePlayedResultPayload');
    expect(review).toContain('appendResultRevision');
    expect(review).toContain('resolveDownstreamSlots');
    expect(review).toContain('actual_end = COALESCE(actual_end, clock_timestamp())');
    expect(publicOperations).toContain("'match.finish.accept'");
    expect(publicOperations).not.toContain("'match.finish.reject'");
    expect(service).toMatch(/PROGRESS_RECONCILIATION_OPERATIONS[\s\S]*'match\.finish\.accept'/);
  });
});
