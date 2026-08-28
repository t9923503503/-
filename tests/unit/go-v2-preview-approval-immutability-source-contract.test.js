import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (relativePath) => readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('GO V2 preview and second-approval immutability contract', () => {
  const migration = read('migrations/108_go_v2_pilot_live_safety.sql');

  it('guards inserts, updates and deletes while allowing only first consumption', () => {
    expect(migration).toContain('go_v2_guard_operation_preview_history');
    expect(migration).toContain('go_v2_guard_red_approval_history');
    expect(migration).toMatch(
      /BEFORE INSERT OR UPDATE OR DELETE ON go_v2_operation_previews\s+FOR EACH ROW\s+EXECUTE FUNCTION go_v2_guard_operation_preview_history\(\)/,
    );
    expect(migration).toMatch(
      /BEFORE INSERT OR UPDATE OR DELETE ON go_v2_red_operation_approvals\s+FOR EACH ROW\s+EXECUTE FUNCTION go_v2_guard_red_approval_history\(\)/,
    );
    expect(migration).toContain('OLD.consumed_at IS NULL');
    expect(migration).toContain('NEW.consumed_at IS NOT DISTINCT FROM transaction_timestamp()');
    expect(migration).toContain('NEW.expires_at > clock_timestamp()');
    expect(migration).toContain('go_v2 red approval does not match a fresh immutable preview');
    expect(migration).toContain('preview.created_by = NEW.requested_by');
    expect(migration).toContain('preview.input_hash = NEW.reviewed_input_hash');
    expect(migration).toContain(
      'preview.aggregate_version = NEW.reviewed_aggregate_version',
    );
  });

  it('removes broad mutation rights from the application role', () => {
    for (const table of ['go_v2_operation_previews', 'go_v2_red_operation_approvals']) {
      expect(migration).toContain(`REVOKE UPDATE, DELETE ON TABLE ${table} FROM lpbvolley`);
      expect(migration).toContain(`GRANT SELECT, INSERT ON TABLE ${table} TO lpbvolley`);
      expect(migration).toContain(
        `GRANT UPDATE (consumed_at) ON TABLE ${table} TO lpbvolley`,
      );
      expect(migration).toContain(`REVOKE UPDATE, DELETE ON TABLE ${table} FROM PUBLIC`);
    }
  });

  it('creates a new preview revision instead of rewriting reviewed content', () => {
    const repository = read('web/lib/go-v2/repository.ts');
    const previewWriter = repository.slice(
      repository.indexOf('export async function createOperationPreview'),
      repository.indexOf('function mapPreview'),
    );
    expect(previewWriter).toContain('Previews are append-only once created');
    expect(previewWriter).toMatch(
      /UPDATE go_v2_operation_previews\s+SET consumed_at = now\(\)[\s\S]*?created_by <> \$5/,
    );
    expect(previewWriter).toMatch(
      /ON CONFLICT \(tournament_id, operation_kind, input_hash, aggregate_version\)[\s\S]*?DO NOTHING/,
    );
    expect(previewWriter).not.toMatch(
      /ON CONFLICT \(tournament_id, operation_kind, input_hash, aggregate_version\)[\s\S]*?DO UPDATE SET/,
    );
    expect(previewWriter).not.toContain('DELETE FROM go_v2_operation_previews');
  });

  it('keeps every application approval update limited to consumed_at', () => {
    const applicationSources = [
      read('web/lib/go-v2/live-operations.ts'),
      read('web/lib/go-v2/publication.ts'),
    ].join('\n');
    const updates = [...applicationSources.matchAll(
      /UPDATE go_v2_red_operation_approvals[\s\S]*?SET\s+([a-z_]+)\s*=/g,
    )].map((match) => match[1]);
    expect(updates.length).toBeGreaterThan(0);
    expect(new Set(updates)).toEqual(new Set(['consumed_at']));
    expect(applicationSources).not.toContain('DELETE FROM go_v2_red_operation_approvals');
  });

  it('makes the rollback-only database check part of the rehearsal runbook', () => {
    const dbTest = read('tests/db/go-v2-preview-approval-immutability.sql');
    const runbook = read('docs/GO_V2_PILOT_RELEASE.md');
    const packager = read('scripts/package-go-v2-pilot.sh');
    expect(dbTest).toContain('SET LOCAL ROLE lpbvolley');
    expect(dbTest).toContain('ROLLBACK;');
    expect(runbook).toContain('tests/db/go-v2-preview-approval-immutability.sql');
    expect(packager).toContain('tests/db/go-v2-preview-approval-immutability.sql');
  });
});
