import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());
const read = (path) => readFileSync(resolve(root, path), 'utf8');

describe('GO V2 draw unlock safety contract', () => {
  it('exposes authenticated preview and commit routes', () => {
    const preview = read('web/app/api/admin/go-v2/tournaments/[id]/draw/unlock/preview/route.ts');
    const commit = read('web/app/api/admin/go-v2/tournaments/[id]/draw/unlock/commit/route.ts');

    expect(preview).toContain("requireApiRole(req, 'operator')");
    expect(preview).toContain("'draw.unlock.preview'");
    expect(commit).toContain("requireApiRole(req, 'operator')");
    expect(commit).toContain("'draw.unlock.commit'");
  });

  it('is preview-gated, CAS journaled and returns to registration lock', () => {
    const contracts = read('web/lib/go-v2/contracts.ts');
    const service = read('web/lib/go-v2/service.ts');
    const client = read('web/lib/go-v2/client-admin-command.ts');

    expect(contracts).toContain("| 'draw.unlock.preview'");
    expect(contracts).toContain("| 'draw.unlock.commit'");
    expect(service).toContain("case 'draw.unlock.commit':");
    expect(service).toContain("return 'registration_locked';");
    expect(service).toContain("return 'draw.unlock.preview';");
    expect(client).toContain("'/draw/unlock/preview': 'draw.unlock.preview'");
    expect(client).toContain("'/draw/unlock/commit': 'draw.unlock.commit'");
  });

  it('fails closed after play, downstream routing, schedule, or live journal activity', () => {
    const repository = read('web/lib/go-v2/repository.ts');

    expect(repository).toContain('DRAW_UNLOCK_MATCH_ACTIVITY_BLOCKED');
    expect(repository).toContain('DRAW_UNLOCK_DOWNSTREAM_BLOCKED');
    expect(repository).toContain('DRAW_UNLOCK_SCHEDULE_BLOCKED');
    expect(repository).toContain('DRAW_UNLOCK_LIVE_JOURNAL_BLOCKED');
    expect(repository).toContain('DRAW_UNLOCK_IMMUTABLE_HISTORY_BLOCKED');
    expect(repository).toContain('DRAW_UNLOCK_SNAPSHOT_REQUIRED');
    expect(repository).toContain('COALESCE(source.route_source_match_id, source.source_match_id)');
    expect(repository).toContain('upstream_pool.stage_id = $1');
    expect(repository).toContain('go_v2_match_result_revisions');
    expect(repository).toContain('go_v2_match_lineup_snapshots');
    expect(repository).toContain('go_v2_cascade_mutation_matches');
    expect(repository).toContain('go_v2_incidents');
    expect(repository).toContain("source_kind, captured_by, input_hash, payload");
    expect(repository).toContain("'draw_unlock_reseed'");
  });

  it('uses row-count and stage-version CAS before committing destructive removal', () => {
    const repository = read('web/lib/go-v2/repository.ts');

    expect(repository).toContain("status = 'locked' AND version = $6");
    expect(repository).toContain('DRAW_UNLOCK_MATCH_SET_STALE');
    expect(repository).toContain('DRAW_UNLOCK_POOL_SET_STALE');
    expect(repository).toContain('DRAW_UNLOCK_STAGE_STALE');
    expect(repository).toContain('DRAW_UNLOCK_STATE_STALE');
  });
});
