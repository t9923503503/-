import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('ordinary game lifecycle source contract', () => {
  it('persists rated/friendly mode, revisions, approvals and correction requests', () => {
    const migration = read('migrations/087_play_game_lifecycle.sql');
    expect(migration).toContain("rating_mode TEXT NOT NULL DEFAULT 'rated'");
    expect(migration).toContain('play_result_revisions');
    expect(migration).toContain('play_result_correction_requests');
    expect(migration).toContain('approved_by_admin_actor');
    expect(migration).toContain('UNIQUE (result_id, revision, user_id)');
  });

  it('requires explicit organizer approval and keeps participant votes informational', () => {
    const service = read('web/lib/play-service.ts');
    const cron = read('web/lib/play-cron.ts');
    expect(service).toContain('export async function approvePlayResult');
    expect(service).toContain('if (!access.isManager)');
    expect(service).toContain('result_awaiting_approval');
    expect(service).toContain('canonicalJson(existing.payload) === canonicalJson(payload)');
    expect(service).toContain('entered_by_admin_actor');
    expect(service).toContain('completeActivePlaySessions(client, postId)');
    expect(service).not.toContain('Number(confirmed) >= Number(total)');
    expect(cron).toContain('AND FALSE -- results require an explicit organizer/admin approval');
  });

  it('reverses results atomically when their game is cancelled', () => {
    const service = read('web/lib/play-service.ts');
    expect(service).toContain("SET status = 'cancelled', auto_confirm_at = NULL");
    expect(service).toContain('await reverseActivePlayResultRating(client, resultId, reason)');
    expect(service).toContain("String(access.post.status) === 'cancelled'");
  });

  it('skips Elo for friendly games and keys rating events by revision', () => {
    const rating = read('web/lib/play-game-rating.ts');
    expect(rating).toContain("rating_mode) === 'friendly'");
    expect(rating).toContain('AND revision = $2 AND reversed_at IS NULL');
    expect(rating).toContain('(result_id,revision,user_id');
  });

  it('exposes revision-safe result, approval and correction APIs', () => {
    expect(read('web/app/api/play-results/[id]/route.ts')).toContain('expectedRevision');
    expect(read('web/app/api/play-results/[id]/approve/route.ts')).toContain('approvePlayResult');
    expect(read('web/app/api/play-results/[id]/correction-requests/route.ts')).toContain('createPlayResultCorrectionRequest');
    expect(read('web/app/api/play-results/[id]/correction-requests/[requestId]/resolve/route.ts'))
      .toContain('resolvePlayResultCorrectionRequest');
  });
});
