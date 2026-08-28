import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (relativePath) => readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('GO V2 fail-closed publication source contract', () => {
  it('exposes director-only preview and commit routes outside generic dispatch', () => {
    const preview = read('web/app/api/admin/go-v2/tournaments/[id]/publication/preview/route.ts');
    const commit = read('web/app/api/admin/go-v2/tournaments/[id]/publication/commit/route.ts');
    expect(preview).toContain('requireGoV2Director');
    expect(preview).toContain('previewGoV2Publication');
    expect(preview).toContain("'publication.preview'");
    expect(commit).toContain('requireGoV2Director');
    expect(commit).toContain('commitGoV2Publication');
    expect(commit).toContain("'publication.commit'");
  });

  it('binds commit to engine 2, exact preview input, CAS and immutable revision', () => {
    const service = read('web/lib/go-v2/publication.ts');
    const migration = read('migrations/108_go_v2_pilot_live_safety.sql');
    expect(service).toContain('tournament.go_engine_version');
    expect(service).toContain("activeScheduleStatus !== 'published'");
    expect(service).toContain("'displayName', entry.display_name");
    expect(service).toContain("'plannedStart', assignment.planned_start");
    expect(service).toContain("'refereeDuty'");
    expect(service).toContain('PUBLICATION_PREVIEW_STALE');
    expect(service).toContain('assertPublicationRedApproval');
    expect(service).toContain('go_v2_publication_state_revisions');
    expect(service).toContain('findCommandReceipt');
    expect(migration).toContain("publication_state IN ('shadow', 'published', 'unpublished')");
    expect(migration).toContain("preview.operation_kind = 'publication.preview'");
    expect(migration).toContain('preview.input_hash = NEW.input_hash');
    expect(migration).toContain('NEW.expected_aggregate_version');
    expect(migration).toContain('go_v2 red publication requires a fresh matching second approval');
    expect(migration).toContain('go_v2 publication preview understates disclosure risk');
    expect(migration).toContain('SELECT 1 FROM go_v2_entries entry');
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS go_v2_publication_state_revisions[\s\S]*?red_approval_id\s+UUID REFERENCES go_v2_red_operation_approvals/,
    );
    expect(migration).toContain('reviewed_input_hash = NEW.input_hash');
    expect(migration).toMatch(
      /BEFORE UPDATE OR DELETE ON go_v2_publication_state_revisions\s+FOR EACH ROW\s+EXECUTE FUNCTION go_v2_reject_immutable_mutation\(\)/,
    );
  });

  it('requires both the immutable published projection and the settings kill switch', () => {
    const helper = read('web/lib/go-v2-publication.ts');
    expect(helper).toContain("row.publication_state === 'published'");
    expect(helper).toContain('isGoV2PublicEnabled');
    expect(helper).not.toContain("publication_state !== 'unpublished'");
  });
});
