import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath) => readFileSync(path.join(process.cwd(), relativePath), 'utf8');
const migration = read('migrations/109_go_v2_reserve_promotion.sql');
const dbRegression = read('tests/db/go-v2-cross-tournament-scope.sql');

describe('GO V2 cross-tournament database scope guards', () => {
  it('centralizes same-tournament and shared-session checks in PostgreSQL', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION go_v2_same_tournament_scope_guard()');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION go_v2_reference_tournament(');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION go_v2_require_session_tournament(');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION go_v2_require_session_court(');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION go_v2_require_schedule_version_scope(');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION go_v2_require_assignment_scope(');
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON %I FOR EACH ROW');
    expect(migration).toContain("USING ERRCODE = '23514'");
  });

  it('covers the sports DAG, polymorphic routes and live scheduling lineage', () => {
    for (const table of [
      'go_v2_stage_edges',
      'go_v2_pool_assignments',
      'go_v2_matches',
      'go_v2_match_slot_sources',
      'go_v2_match_result_revisions',
      'go_v2_schedule_assignments',
      'go_v2_referee_duties',
      'go_v2_attendance_events',
      'go_v2_schedule_disruptions',
      'go_v2_disruption_matches',
      'go_v2_match_pause_resolutions',
      'go_v2_schedule_defer_overrides',
      'go_v2_match_court_segments',
      'go_v2_stage_rule_revisions',
      'go_v2_match_rule_revisions',
      'go_v2_reserve_promotion_revisions',
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
    for (const sourceField of [
      'source_entry_id',
      'source_pool_id',
      'source_match_id',
      'route_source_match_id',
      'resolved_entry_id',
    ]) {
      expect(migration).toContain(`TG_TABLE_NAME || '.${sourceField}'`);
    }
  });

  it('runs negative probes as the application role and rolls fixtures back', () => {
    expect(dbRegression).toContain('SET LOCAL ROLE lpbvolley;');
    expect(dbRegression).toContain('go_v2_expect_scope_reject');
    expect(dbRegression).toContain("'ENTRY'");
    expect(dbRegression).toContain("'POOL_RANK'");
    expect(dbRegression).toContain("'MATCH_WINNER'");
    expect(dbRegression).toContain("'MATCH_LOSER'");
    expect(dbRegression).toContain('go_v2_match_pause_resolutions');
    expect(dbRegression).toContain('go_v2_schedule_defer_overrides');
    expect(dbRegression).toContain('go_v2_match_court_segments');
    expect(dbRegression).toContain('ROLLBACK;');
  });
});
