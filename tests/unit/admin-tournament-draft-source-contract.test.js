import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('Admin tournament draft source contract', () => {
  it('preserves draft status in admin tournament mappers', () => {
    const helper = read('web/lib/admin-tournament-status.ts');
    const pgQueries = read('web/lib/admin-queries-pg.ts');
    const postgrest = read('web/lib/admin-postgrest.ts');

    expect(helper).toContain("if (rawStatus === 'draft')");
    expect(helper).toContain("status: 'draft'");
    expect(pgQueries).toContain("import { enrichAdminTournamentRuntimeState } from './admin-tournament-status';");
    expect(postgrest).toContain("import { enrichAdminTournamentRuntimeState } from './admin-tournament-status';");
    expect(pgQueries).toContain('return enrichAdminTournamentRuntimeState({');
    expect(postgrest).toContain('return enrichAdminTournamentRuntimeState({');
  });

  it('allows draft in tournaments status constraint and reports it in admin errors', () => {
    const migration = read('migrations/060_tournaments_allow_draft_status.sql');
    const errors = read('web/lib/admin-errors.ts');

    expect(migration).toContain("CHECK (status IN ('draft', 'open', 'full', 'finished', 'cancelled'))");
    expect(errors).toContain('Status must be draft, open, full, finished, or cancelled');
  });

  it('keeps draft tournaments hidden from public queries', () => {
    const queries = read('web/lib/queries.ts');

    expect(queries).toContain("function isDraftTournamentStatus(value: unknown): boolean {");
    expect(queries).toContain('if (isDraftTournamentStatus(row.status)) return false;');
    expect(queries).toContain("COALESCE(t.status, '') NOT IN ('cancelled', 'draft')");
    expect(queries).toContain("COALESCE(t.status, 'open') NOT IN ('cancelled', 'draft')");
  });
});
