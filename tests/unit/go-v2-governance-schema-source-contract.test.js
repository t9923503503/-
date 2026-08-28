import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  path.join(process.cwd(), 'migrations/108_go_v2_pilot_live_safety.sql'),
  'utf8',
);

describe('GO V2 governance and court-policy schema contract', () => {
  it('keeps tournament roles revisioned, scoped and append-only', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_tournament_role_revisions');
    expect(migration).toContain("role_kind IN ('director', 'operator', 'viewer')");
    expect(migration).toContain("decision IN ('assign', 'revoke')");
    expect(migration).toContain('UNIQUE (tournament_id, principal_id, revision_no)');
    expect(migration).toMatch(
      /BEFORE UPDATE OR DELETE ON go_v2_tournament_role_revisions\s+FOR EACH ROW\s+EXECUTE FUNCTION go_v2_reject_immutable_mutation\(\)/,
    );
  });

  it('freezes court policies and director-approved exceptions against an exact successor schedule', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_court_policy_revisions');
    expect(migration).toContain("DEFAULT 'lpv_tier_courts_v1'");
    expect(migration).toContain("tier_profile IN ('hard_light', 'hard_medium_light')");
    expect(migration).toContain('active_court_policy_revision_id');

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_court_policy_exception_revisions');
    expect(migration).toContain("decision IN ('approve', 'revoke')");
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS go_v2_court_policy_exception_revisions[\s\S]*?stage_id\s+UUID REFERENCES go_v2_stages/,
    );
    expect(migration).toContain('allowed_court_ids     UUID[] NOT NULL');
    expect(migration).toContain('cardinality(allowed_court_ids) BETWEEN 1 AND 6');
    expect(migration).toContain('effective_until > effective_from');
    expect(migration).toContain('source_preview_id     UUID NOT NULL REFERENCES go_v2_operation_previews');
    expect(migration).toContain(
      'successor_schedule_version_id UUID NOT NULL REFERENCES go_v2_schedule_versions',
    );
    expect(migration).toContain("actor_role IN ('director', 'admin')");
    expect(migration).toContain('go_v2_validate_court_policy_exception');
    expect(migration).toContain('go_v2_schedule_session_courts session_court');
    expect(migration).toContain('court policy exception court is outside the schedule session');
    expect(migration).toContain("'court_policy_exception'");
    expect(migration).toMatch(
      /BEFORE UPDATE OR DELETE ON go_v2_court_policy_exception_revisions\s+FOR EACH ROW\s+EXECUTE FUNCTION go_v2_reject_immutable_mutation\(\)/,
    );
  });

  it('records immutable stage and match rule revisions with exact projections', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_stage_rule_revisions');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_match_rule_revisions');
    expect(migration).toContain("revision_kind IN ('initial', 'future_round', 'compensating')");
    expect(migration).toContain(
      "revision_kind IN ('stage_projection', 'match_override', 'compensating')",
    );
    expect(migration).toContain('effective_from_round_no INT NOT NULL');
    expect(migration).toContain("jsonb_typeof(rule_snapshot) = 'object'");
    expect(migration).toContain('go_v2_stages_current_rule_revision_fk');
    expect(migration).toContain('go_v2_matches_current_rule_revision_fk');
    expect(migration).toContain('go_v2_stage_rule_revisions_hash_idx');
    expect(migration).toContain('go_v2_match_rule_revisions_hash_idx');
    expect(migration).not.toContain('UNIQUE (stage_id, rule_hash)');
    expect(migration).not.toContain('UNIQUE (match_id, rule_hash)');
    for (const table of ['go_v2_stage_rule_revisions', 'go_v2_match_rule_revisions']) {
      expect(migration).toMatch(
        new RegExp(
          `BEFORE UPDATE OR DELETE ON ${table}\\s+FOR EACH ROW\\s+EXECUTE FUNCTION go_v2_reject_immutable_mutation\\(\\)`,
        ),
      );
    }
  });

  it('publishes only through a CAS-bound immutable publication revision', () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS publication_state TEXT NOT NULL DEFAULT 'shadow'");
    expect(migration).toContain("publication_state IN ('shadow', 'published', 'unpublished')");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS go_v2_publication_state_revisions');
    expect(migration).toContain(
      'resulting_aggregate_version = expected_aggregate_version + 1',
    );
    expect(migration).toContain("to_state = 'published'");
    expect(migration).toContain('go_v2_guard_publication_projection');
    expect(migration).toContain('go_v2_apply_publication_state_revision');
    expect(migration).toContain('publication projection requires an immutable revision');
    expect(migration).toContain('red_approval_id');
    expect(migration).toContain('reviewed_input_hash = NEW.input_hash');
    expect(migration).toContain('go_v2 red publication requires a fresh matching second approval');
    expect(migration).toContain('go_v2 publication preview understates disclosure risk');
    expect(migration).toContain("tournament.go_engine_version = 2");
    expect(migration).toContain("version.status = 'published'");
    expect(migration).toMatch(
      /AFTER INSERT ON go_v2_publication_state_revisions\s+FOR EACH ROW\s+EXECUTE FUNCTION go_v2_apply_publication_state_revision\(\)/,
    );
    expect(migration).toMatch(
      /BEFORE UPDATE OR DELETE ON go_v2_publication_state_revisions\s+FOR EACH ROW\s+EXECUTE FUNCTION go_v2_reject_immutable_mutation\(\)/,
    );
  });

  it('grants the app only read/append access to immutable governance ledgers', () => {
    for (const table of [
      'go_v2_tournament_role_revisions',
      'go_v2_court_policy_revisions',
      'go_v2_court_policy_exception_revisions',
      'go_v2_stage_rule_revisions',
      'go_v2_match_rule_revisions',
      'go_v2_publication_state_revisions',
    ]) {
      expect(migration).toContain(`GRANT SELECT, INSERT ON TABLE ${table} TO lpbvolley`);
      expect(migration).not.toContain(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${table} TO lpbvolley`,
      );
    }
  });
});
