-- 109: append-only reserve promotion lineage for Tournament Engine V2.
-- This migration is additive, repeat-safe and does not alter legacy formats.

BEGIN;

INSERT INTO go_v2_mutation_reason_catalog (code, label, requires_note)
VALUES ('reserve_promoted', 'Reserve promoted into the tournament', true)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  requires_note = EXCLUDED.requires_note;

CREATE TABLE IF NOT EXISTS go_v2_reserve_promotion_revisions (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id                 UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  reserve_entry_id              UUID NOT NULL REFERENCES go_v2_entries(id) ON DELETE RESTRICT,
  target_entry_id               UUID REFERENCES go_v2_entries(id) ON DELETE RESTRICT,
  promotion_mode                TEXT NOT NULL
                                CHECK (promotion_mode IN ('pre_draw_reseed', 'post_draw_slot_replace')),
  reserve_roster_revision_id    UUID NOT NULL REFERENCES go_v2_roster_revisions(id) ON DELETE RESTRICT,
  rating_snapshot_id            UUID NOT NULL REFERENCES go_v2_rating_snapshots(id) ON DELETE RESTRICT,
  source_preview_id             UUID NOT NULL UNIQUE
                                REFERENCES go_v2_operation_previews(id) ON DELETE RESTRICT,
  red_approval_id               UUID,
  prior_schedule_version_id     UUID REFERENCES go_v2_schedule_versions(id) ON DELETE RESTRICT,
  successor_schedule_version_id UUID REFERENCES go_v2_schedule_versions(id) ON DELETE RESTRICT,
  schedule_hash                 TEXT,
  expected_aggregate_version    BIGINT NOT NULL CHECK (expected_aggregate_version >= 0),
  resulting_aggregate_version   BIGINT NOT NULL CHECK (resulting_aggregate_version >= 1),
  source_hash                   TEXT NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  input_hash                    TEXT NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  request_hash                  TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  prior_entries_snapshot        JSONB NOT NULL,
  resulting_entries_snapshot    JSONB NOT NULL,
  slot_diff                     JSONB NOT NULL DEFAULT '[]'::jsonb,
  schedule_diff                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason_code                   TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note                   TEXT NOT NULL CHECK (length(btrim(reason_note)) > 0),
  actor_id                      TEXT NOT NULL CHECK (length(btrim(actor_id)) > 0),
  command_id                    TEXT NOT NULL CHECK (length(btrim(command_id)) > 0),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, command_id),
  CHECK (reserve_entry_id <> target_entry_id),
  CHECK (
    (promotion_mode = 'pre_draw_reseed' AND target_entry_id IS NULL)
    OR (promotion_mode = 'post_draw_slot_replace' AND target_entry_id IS NOT NULL)
  ),
  CHECK (resulting_aggregate_version = expected_aggregate_version + 1)
);

-- Keep the migration repeat-safe even if an earlier rehearsal created the
-- ledger before approval lineage was added.
ALTER TABLE go_v2_reserve_promotion_revisions
  ADD COLUMN IF NOT EXISTS red_approval_id UUID;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'go_v2_reserve_promotion_revisions'::regclass
       AND conname = 'go_v2_reserve_promotion_red_approval_fk'
  ) THEN
    ALTER TABLE go_v2_reserve_promotion_revisions
      ADD CONSTRAINT go_v2_reserve_promotion_red_approval_fk
      FOREIGN KEY (red_approval_id)
      REFERENCES go_v2_red_operation_approvals(id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS go_v2_reserve_promotion_red_approval_uidx
  ON go_v2_reserve_promotion_revisions(red_approval_id)
  WHERE red_approval_id IS NOT NULL;
ALTER TABLE go_v2_reserve_promotion_revisions
  DROP CONSTRAINT IF EXISTS go_v2_reserve_promotion_schedule_lineage_check;
ALTER TABLE go_v2_reserve_promotion_revisions
  ADD CONSTRAINT go_v2_reserve_promotion_schedule_lineage_check CHECK (
    (prior_schedule_version_id IS NULL AND successor_schedule_version_id IS NULL
      AND schedule_hash IS NULL AND red_approval_id IS NULL)
    OR (
      prior_schedule_version_id IS NOT NULL
      AND successor_schedule_version_id IS NOT NULL
      AND red_approval_id IS NOT NULL
      AND prior_schedule_version_id <> successor_schedule_version_id
      AND schedule_hash ~ '^[0-9a-f]{64}$'
    )
  );

CREATE INDEX IF NOT EXISTS go_v2_reserve_promotions_tournament_created_idx
  ON go_v2_reserve_promotion_revisions(tournament_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS go_v2_reserve_promotions_reserve_entry_idx
  ON go_v2_reserve_promotion_revisions(reserve_entry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS go_v2_reserve_promotions_target_entry_idx
  ON go_v2_reserve_promotion_revisions(target_entry_id, created_at DESC)
  WHERE target_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION go_v2_validate_reserve_promotion_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  prior_session_id UUID;
  successor_session_id UUID;
  successor_based_on_id UUID;
  successor_status TEXT;
  successor_schedule_hash TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM go_v2_entries entry
    WHERE entry.id = NEW.reserve_entry_id
      AND entry.tournament_id = NEW.tournament_id
  ) THEN
    RAISE EXCEPTION 'go_v2 reserve promotion reserve/tournament mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.target_entry_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM go_v2_entries entry
    WHERE entry.id = NEW.target_entry_id
      AND entry.tournament_id = NEW.tournament_id
  ) THEN
    RAISE EXCEPTION 'go_v2 reserve promotion target/tournament mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM go_v2_roster_revisions roster
    WHERE roster.id = NEW.reserve_roster_revision_id
      AND roster.entry_id = NEW.reserve_entry_id
  ) THEN
    RAISE EXCEPTION 'go_v2 reserve promotion roster/reserve mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM go_v2_rating_snapshots snapshot
    WHERE snapshot.id = NEW.rating_snapshot_id
      AND snapshot.tournament_id = NEW.tournament_id
  ) THEN
    RAISE EXCEPTION 'go_v2 reserve promotion rating snapshot/tournament mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM go_v2_operation_previews preview
    WHERE preview.id = NEW.source_preview_id
      AND preview.tournament_id = NEW.tournament_id
      AND preview.operation_kind = 'reserve.promotion.preview'
      AND preview.aggregate_version = NEW.expected_aggregate_version
      AND preview.input_hash = NEW.input_hash
      AND preview.consumed_at IS NULL
      AND preview.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'go_v2 reserve promotion preview lineage mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.prior_schedule_version_id IS NOT NULL THEN
    SELECT version.session_id
      INTO prior_session_id
      FROM go_v2_schedule_versions version
     WHERE version.id = NEW.prior_schedule_version_id;
    SELECT version.session_id, version.based_on_version_id, version.status, version.schedule_hash
      INTO successor_session_id, successor_based_on_id, successor_status, successor_schedule_hash
      FROM go_v2_schedule_versions version
     WHERE version.id = NEW.successor_schedule_version_id;
    IF prior_session_id IS NULL
       OR successor_session_id IS NULL
       OR prior_session_id <> successor_session_id
       OR successor_based_on_id IS DISTINCT FROM NEW.prior_schedule_version_id
       OR successor_status <> 'published'
       OR successor_schedule_hash IS DISTINCT FROM NEW.schedule_hash
       OR NOT EXISTS (
         SELECT 1 FROM go_v2_schedule_session_tournaments member
         WHERE member.session_id = prior_session_id
           AND member.tournament_id = NEW.tournament_id
       ) THEN
      RAISE EXCEPTION 'go_v2 reserve promotion schedule lineage mismatch'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM go_v2_red_operation_approvals approval
       WHERE approval.id = NEW.red_approval_id
         AND approval.tournament_id = NEW.tournament_id
         AND approval.preview_id = NEW.source_preview_id
         AND approval.requested_by = NEW.actor_id
         AND approval.approved_by <> NEW.actor_id
         AND approval.reviewed_input_hash = NEW.input_hash
         AND approval.reviewed_aggregate_version = NEW.expected_aggregate_version
         AND approval.consumed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'go_v2 reserve promotion second approval lineage mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS go_v2_reserve_promotion_lineage_guard
  ON go_v2_reserve_promotion_revisions;
CREATE TRIGGER go_v2_reserve_promotion_lineage_guard
BEFORE INSERT ON go_v2_reserve_promotion_revisions
FOR EACH ROW
EXECUTE FUNCTION go_v2_validate_reserve_promotion_revision();

-- A plain UUID foreign key only proves that the referenced row exists. It does
-- not prove that the row belongs to the same tournament. Keep this invariant
-- in PostgreSQL so a compromised/stale runtime command cannot splice stages,
-- pools, entries, matches or live-schedule lineage from another tournament.
--
-- The helpers below intentionally validate every non-null polymorphic source.
-- Schedule versions are session-scoped, so they are valid for a tournament
-- only when that tournament is an explicit member of the same shared session.
CREATE OR REPLACE FUNCTION go_v2_reference_tournament(
  p_kind TEXT,
  p_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  resolved_tournament_id UUID;
BEGIN
  IF p_id IS NULL THEN
    RETURN NULL;
  END IF;

  CASE p_kind
    WHEN 'entry' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_entries WHERE id = p_id;
    WHEN 'roster_revision' THEN
      SELECT entry.tournament_id INTO resolved_tournament_id
        FROM go_v2_roster_revisions roster
        JOIN go_v2_entries entry ON entry.id = roster.entry_id
       WHERE roster.id = p_id;
    WHEN 'rating_snapshot' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_rating_snapshots WHERE id = p_id;
    WHEN 'stage_lock_snapshot' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_stage_lock_snapshots WHERE id = p_id;
    WHEN 'stage' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_stages WHERE id = p_id;
    WHEN 'pool' THEN
      SELECT stage.tournament_id INTO resolved_tournament_id
        FROM go_v2_pools pool
        JOIN go_v2_stages stage ON stage.id = pool.stage_id
       WHERE pool.id = p_id;
    WHEN 'match' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_matches WHERE id = p_id;
    WHEN 'result_revision' THEN
      SELECT match.tournament_id INTO resolved_tournament_id
        FROM go_v2_match_result_revisions revision
        JOIN go_v2_matches match ON match.id = revision.match_id
       WHERE revision.id = p_id;
    WHEN 'standing_snapshot' THEN
      SELECT stage.tournament_id INTO resolved_tournament_id
        FROM go_v2_standing_snapshots snapshot
        JOIN go_v2_stages stage ON stage.id = snapshot.stage_id
       WHERE snapshot.id = p_id;
    WHEN 'qualification_snapshot' THEN
      SELECT stage.tournament_id INTO resolved_tournament_id
        FROM go_v2_qualification_snapshots snapshot
        JOIN go_v2_stages stage ON stage.id = snapshot.source_stage_id
       WHERE snapshot.id = p_id;
    WHEN 'final_placement_snapshot' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_final_placement_snapshots WHERE id = p_id;
    WHEN 'rating_projection_run' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_rating_projection_runs WHERE id = p_id;
    WHEN 'operation_preview' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_operation_previews WHERE id = p_id;
    WHEN 'red_approval' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_red_operation_approvals WHERE id = p_id;
    WHEN 'disruption' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_schedule_disruptions WHERE id = p_id;
    WHEN 'court_grant' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_court_grants WHERE id = p_id;
    WHEN 'cascade_batch' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_cascade_mutation_batches WHERE id = p_id;
    WHEN 'pause_resolution' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_match_pause_resolutions WHERE id = p_id;
    WHEN 'court_policy_revision' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_court_policy_revisions WHERE id = p_id;
    WHEN 'court_policy_exception' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_court_policy_exception_revisions WHERE id = p_id;
    WHEN 'stage_rule_revision' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_stage_rule_revisions WHERE id = p_id;
    WHEN 'match_rule_revision' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_match_rule_revisions WHERE id = p_id;
    WHEN 'schedule_defer' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_schedule_defer_overrides WHERE id = p_id;
    WHEN 'publication_revision' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_publication_state_revisions WHERE id = p_id;
    WHEN 'reserve_promotion' THEN
      SELECT tournament_id INTO resolved_tournament_id
        FROM go_v2_reserve_promotion_revisions WHERE id = p_id;
    ELSE
      RAISE EXCEPTION 'unknown go_v2 scope reference kind: %', p_kind
        USING ERRCODE = '22023';
  END CASE;

  IF resolved_tournament_id IS NULL THEN
    RAISE EXCEPTION 'go_v2 scope reference does not exist: % %', p_kind, p_id
      USING ERRCODE = '23503';
  END IF;
  RETURN resolved_tournament_id;
END;
$$;

CREATE OR REPLACE FUNCTION go_v2_require_tournament_reference(
  p_expected_tournament_id UUID,
  p_kind TEXT,
  p_id UUID,
  p_reference_label TEXT
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  actual_tournament_id UUID;
BEGIN
  IF p_id IS NULL THEN
    RETURN;
  END IF;
  actual_tournament_id := go_v2_reference_tournament(p_kind, p_id);
  IF actual_tournament_id IS DISTINCT FROM p_expected_tournament_id THEN
    RAISE EXCEPTION 'go_v2 tournament scope mismatch: %', p_reference_label
      USING ERRCODE = '23514',
            DETAIL = format('expected tournament %s, referenced tournament %s',
                            p_expected_tournament_id, actual_tournament_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION go_v2_require_session_tournament(
  p_tournament_id UUID,
  p_session_id UUID,
  p_reference_label TEXT
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_session_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM go_v2_schedule_session_tournaments member
     WHERE member.session_id = p_session_id
       AND member.tournament_id = p_tournament_id
  ) THEN
    RAISE EXCEPTION 'go_v2 tournament scope mismatch: %', p_reference_label
      USING ERRCODE = '23514',
            DETAIL = format('tournament %s is not a member of session %s',
                            p_tournament_id, p_session_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION go_v2_require_session_court(
  p_session_id UUID,
  p_court_id UUID,
  p_reference_label TEXT
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_court_id IS NULL THEN
    RETURN;
  END IF;
  IF p_session_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM go_v2_schedule_session_courts member
     WHERE member.session_id = p_session_id
       AND member.court_id = p_court_id
  ) THEN
    RAISE EXCEPTION 'go_v2 schedule scope mismatch: %', p_reference_label
      USING ERRCODE = '23514',
            DETAIL = format('court %s is not a member of session %s',
                            p_court_id, p_session_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION go_v2_require_schedule_version_scope(
  p_tournament_id UUID,
  p_session_id UUID,
  p_version_id UUID,
  p_reference_label TEXT
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  version_session_id UUID;
BEGIN
  IF p_version_id IS NULL THEN
    RETURN;
  END IF;
  SELECT session_id INTO version_session_id
    FROM go_v2_schedule_versions WHERE id = p_version_id;
  IF version_session_id IS NULL THEN
    RAISE EXCEPTION 'go_v2 scope reference does not exist: schedule_version %', p_version_id
      USING ERRCODE = '23503';
  END IF;
  IF p_session_id IS NOT NULL AND version_session_id <> p_session_id THEN
    RAISE EXCEPTION 'go_v2 schedule scope mismatch: %', p_reference_label
      USING ERRCODE = '23514';
  END IF;
  PERFORM go_v2_require_session_tournament(
    p_tournament_id, version_session_id, p_reference_label
  );
END;
$$;

CREATE OR REPLACE FUNCTION go_v2_require_assignment_scope(
  p_tournament_id UUID,
  p_session_id UUID,
  p_match_id UUID,
  p_court_id UUID,
  p_assignment_id UUID,
  p_reference_label TEXT
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  assignment_tournament_id UUID;
  assignment_session_id UUID;
  assignment_match_id UUID;
  assignment_court_id UUID;
BEGIN
  IF p_assignment_id IS NULL THEN
    RETURN;
  END IF;
  SELECT match.tournament_id, version.session_id, assignment.match_id, assignment.court_id
    INTO assignment_tournament_id, assignment_session_id,
         assignment_match_id, assignment_court_id
    FROM go_v2_schedule_assignments assignment
    JOIN go_v2_schedule_versions version ON version.id = assignment.schedule_version_id
    JOIN go_v2_matches match ON match.id = assignment.match_id
   WHERE assignment.id = p_assignment_id;
  IF assignment_tournament_id IS NULL THEN
    RAISE EXCEPTION 'go_v2 scope reference does not exist: schedule_assignment %', p_assignment_id
      USING ERRCODE = '23503';
  END IF;
  IF assignment_tournament_id <> p_tournament_id
     OR (p_session_id IS NOT NULL AND assignment_session_id <> p_session_id)
     OR (p_match_id IS NOT NULL AND assignment_match_id <> p_match_id)
     OR (p_court_id IS NOT NULL AND assignment_court_id <> p_court_id) THEN
    RAISE EXCEPTION 'go_v2 schedule scope mismatch: %', p_reference_label
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION go_v2_same_tournament_scope_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
#variable_conflict use_variable
DECLARE
  row_data JSONB := to_jsonb(NEW);
  tournament_id UUID;
  session_id UUID;
  match_id UUID;
  court_id UUID;
  ref_id UUID;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'go_v2_tournament_state' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'stage_lock_snapshot',
        (row_data->>'active_stage_snapshot_id')::uuid, TG_TABLE_NAME || '.active_stage_snapshot_id');
      PERFORM go_v2_require_schedule_version_scope(tournament_id, NULL,
        (row_data->>'active_schedule_version_id')::uuid, TG_TABLE_NAME || '.active_schedule_version_id');

    WHEN 'go_v2_entries' THEN
      IF row_data->>'current_roster_revision_id' IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM go_v2_roster_revisions roster
         WHERE roster.id = (row_data->>'current_roster_revision_id')::uuid
           AND roster.entry_id = (row_data->>'id')::uuid
      ) THEN
        RAISE EXCEPTION 'go_v2 tournament scope mismatch: %.current_roster_revision_id', TG_TABLE_NAME
          USING ERRCODE = '23514';
      END IF;

    WHEN 'go_v2_rating_snapshot_entries' THEN
      tournament_id := go_v2_reference_tournament('rating_snapshot', (row_data->>'snapshot_id')::uuid);
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'entry_id')::uuid, TG_TABLE_NAME || '.entry_id');

    WHEN 'go_v2_stages' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'stage_lock_snapshot',
        (row_data->>'lock_snapshot_id')::uuid, TG_TABLE_NAME || '.lock_snapshot_id');
      IF row_data->>'current_rule_revision_id' IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM go_v2_stage_rule_revisions revision
         WHERE revision.id = (row_data->>'current_rule_revision_id')::uuid
           AND revision.tournament_id = tournament_id
           AND revision.stage_id = (row_data->>'id')::uuid
      ) THEN
        RAISE EXCEPTION 'go_v2 tournament scope mismatch: %.current_rule_revision_id', TG_TABLE_NAME
          USING ERRCODE = '23514';
      END IF;

    WHEN 'go_v2_stage_edges' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'stage',
        (row_data->>'from_stage_id')::uuid, TG_TABLE_NAME || '.from_stage_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'stage',
        (row_data->>'to_stage_id')::uuid, TG_TABLE_NAME || '.to_stage_id');

    WHEN 'go_v2_pool_assignments' THEN
      tournament_id := go_v2_reference_tournament('pool', (row_data->>'pool_id')::uuid);
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'entry_id')::uuid, TG_TABLE_NAME || '.entry_id');

    WHEN 'go_v2_matches' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'stage',
        (row_data->>'stage_id')::uuid, TG_TABLE_NAME || '.stage_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'pool',
        (row_data->>'pool_id')::uuid, TG_TABLE_NAME || '.pool_id');
      IF row_data->>'pool_id' IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM go_v2_pools pool
         WHERE pool.id = (row_data->>'pool_id')::uuid
           AND pool.stage_id = (row_data->>'stage_id')::uuid
      ) THEN
        RAISE EXCEPTION 'go_v2 stage scope mismatch: %.pool_id', TG_TABLE_NAME
          USING ERRCODE = '23514';
      END IF;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'winner_entry_id')::uuid, TG_TABLE_NAME || '.winner_entry_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'loser_entry_id')::uuid, TG_TABLE_NAME || '.loser_entry_id');
      IF row_data->>'current_rule_revision_id' IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM go_v2_match_rule_revisions revision
         WHERE revision.id = (row_data->>'current_rule_revision_id')::uuid
           AND revision.tournament_id = tournament_id
           AND revision.match_id = (row_data->>'id')::uuid
      ) THEN
        RAISE EXCEPTION 'go_v2 tournament scope mismatch: %.current_rule_revision_id', TG_TABLE_NAME
          USING ERRCODE = '23514';
      END IF;

    WHEN 'go_v2_match_slot_sources' THEN
      match_id := (row_data->>'match_id')::uuid;
      tournament_id := go_v2_reference_tournament('match', match_id);
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'source_entry_id')::uuid, TG_TABLE_NAME || '.source_entry_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'pool',
        (row_data->>'source_pool_id')::uuid, TG_TABLE_NAME || '.source_pool_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'match',
        (row_data->>'source_match_id')::uuid, TG_TABLE_NAME || '.source_match_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'match',
        (row_data->>'route_source_match_id')::uuid, TG_TABLE_NAME || '.route_source_match_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'resolved_entry_id')::uuid, TG_TABLE_NAME || '.resolved_entry_id');

    WHEN 'go_v2_match_lineup_snapshots' THEN
      tournament_id := go_v2_reference_tournament('match', (row_data->>'match_id')::uuid);
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'entry_id')::uuid, TG_TABLE_NAME || '.entry_id');
      IF NOT EXISTS (
        SELECT 1 FROM go_v2_roster_revisions roster
         WHERE roster.id = (row_data->>'roster_revision_id')::uuid
           AND roster.entry_id = (row_data->>'entry_id')::uuid
      ) THEN
        RAISE EXCEPTION 'go_v2 tournament scope mismatch: %.roster_revision_id', TG_TABLE_NAME
          USING ERRCODE = '23514';
      END IF;

    WHEN 'go_v2_match_result_revisions' THEN
      match_id := (row_data->>'match_id')::uuid;
      tournament_id := go_v2_reference_tournament('match', match_id);
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'winner_entry_id')::uuid, TG_TABLE_NAME || '.winner_entry_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'loser_entry_id')::uuid, TG_TABLE_NAME || '.loser_entry_id');
      IF row_data->>'supersedes_revision_id' IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM go_v2_match_result_revisions previous
         WHERE previous.id = (row_data->>'supersedes_revision_id')::uuid
           AND previous.match_id = match_id
      ) THEN
        RAISE EXCEPTION 'go_v2 match scope mismatch: %.supersedes_revision_id', TG_TABLE_NAME
          USING ERRCODE = '23514';
      END IF;

    WHEN 'go_v2_match_standing_contributions' THEN
      tournament_id := go_v2_reference_tournament('result_revision',
        (row_data->>'result_revision_id')::uuid);
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'entry_id')::uuid, TG_TABLE_NAME || '.entry_id');

    WHEN 'go_v2_standing_snapshots' THEN
      tournament_id := go_v2_reference_tournament('stage', (row_data->>'stage_id')::uuid);
      PERFORM go_v2_require_tournament_reference(tournament_id, 'standing_snapshot',
        (row_data->>'supersedes_snapshot_id')::uuid, TG_TABLE_NAME || '.supersedes_snapshot_id');

    WHEN 'go_v2_standing_snapshot_rows' THEN
      tournament_id := go_v2_reference_tournament('standing_snapshot', (row_data->>'snapshot_id')::uuid);
      PERFORM go_v2_require_tournament_reference(tournament_id, 'pool',
        (row_data->>'pool_id')::uuid, TG_TABLE_NAME || '.pool_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'entry_id')::uuid, TG_TABLE_NAME || '.entry_id');

    WHEN 'go_v2_qualification_snapshots' THEN
      tournament_id := go_v2_reference_tournament('stage', (row_data->>'source_stage_id')::uuid);
      PERFORM go_v2_require_tournament_reference(tournament_id, 'standing_snapshot',
        (row_data->>'standing_snapshot_id')::uuid, TG_TABLE_NAME || '.standing_snapshot_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'qualification_snapshot',
        (row_data->>'supersedes_snapshot_id')::uuid, TG_TABLE_NAME || '.supersedes_snapshot_id');

    WHEN 'go_v2_qualification_snapshot_rows' THEN
      tournament_id := go_v2_reference_tournament('qualification_snapshot', (row_data->>'snapshot_id')::uuid);
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'entry_id')::uuid, TG_TABLE_NAME || '.entry_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'pool',
        (row_data->>'source_pool_id')::uuid, TG_TABLE_NAME || '.source_pool_id');

    WHEN 'go_v2_schedule_session_tournaments' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      session_id := (row_data->>'session_id')::uuid;
      IF row_data->>'active_court_policy_revision_id' IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM go_v2_court_policy_revisions policy
         WHERE policy.id = (row_data->>'active_court_policy_revision_id')::uuid
           AND policy.tournament_id = tournament_id
           AND policy.schedule_session_id = session_id
      ) THEN
        RAISE EXCEPTION 'go_v2 schedule scope mismatch: %.active_court_policy_revision_id', TG_TABLE_NAME
          USING ERRCODE = '23514';
      END IF;

    WHEN 'go_v2_schedule_versions' THEN
      session_id := (row_data->>'session_id')::uuid;
      IF row_data->>'based_on_version_id' IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM go_v2_schedule_versions previous
         WHERE previous.id = (row_data->>'based_on_version_id')::uuid
           AND previous.session_id = session_id
      ) THEN
        RAISE EXCEPTION 'go_v2 schedule scope mismatch: %.based_on_version_id', TG_TABLE_NAME
          USING ERRCODE = '23514';
      END IF;
      IF row_data->>'source_preview_id' IS NOT NULL THEN
        tournament_id := go_v2_reference_tournament('operation_preview',
          (row_data->>'source_preview_id')::uuid);
        PERFORM go_v2_require_session_tournament(tournament_id, session_id,
          TG_TABLE_NAME || '.source_preview_id');
      END IF;

    WHEN 'go_v2_schedule_assignments' THEN
      match_id := (row_data->>'match_id')::uuid;
      tournament_id := go_v2_reference_tournament('match', match_id);
      SELECT version.session_id INTO session_id
        FROM go_v2_schedule_versions version
       WHERE version.id = (row_data->>'schedule_version_id')::uuid;
      IF session_id IS NULL THEN
        RAISE EXCEPTION 'go_v2 scope reference does not exist: schedule_version %',
          row_data->>'schedule_version_id' USING ERRCODE = '23503';
      END IF;
      PERFORM go_v2_require_session_tournament(tournament_id, session_id,
        TG_TABLE_NAME || '.schedule_version_id');
      PERFORM go_v2_require_session_court(session_id, (row_data->>'court_id')::uuid,
        TG_TABLE_NAME || '.court_id');

    WHEN 'go_v2_referee_duties' THEN
      SELECT match.tournament_id, version.session_id, assignment.match_id, assignment.court_id
        INTO tournament_id, session_id, match_id, court_id
        FROM go_v2_schedule_assignments assignment
        JOIN go_v2_schedule_versions version ON version.id = assignment.schedule_version_id
        JOIN go_v2_matches match ON match.id = assignment.match_id
       WHERE assignment.id = (row_data->>'schedule_assignment_id')::uuid;
      IF tournament_id IS NULL THEN
        RAISE EXCEPTION 'go_v2 scope reference does not exist: schedule_assignment %',
          row_data->>'schedule_assignment_id' USING ERRCODE = '23503';
      END IF;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'referee_entry_id')::uuid, TG_TABLE_NAME || '.referee_entry_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'match',
        (row_data->>'source_match_id')::uuid, TG_TABLE_NAME || '.source_match_id');
      FOR ref_id IN
        SELECT value::uuid
          FROM jsonb_array_elements_text(COALESCE(row_data->'candidate_entry_ids', '[]'::jsonb)) value
      LOOP
        PERFORM go_v2_require_tournament_reference(tournament_id, 'entry', ref_id,
          TG_TABLE_NAME || '.candidate_entry_ids');
      END LOOP;

    WHEN 'go_v2_incidents' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'match',
        (row_data->>'match_id')::uuid, TG_TABLE_NAME || '.match_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'entry_id')::uuid, TG_TABLE_NAME || '.entry_id');

    WHEN 'go_v2_cascade_mutation_batches' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'match',
        (row_data->>'trigger_match_id')::uuid, TG_TABLE_NAME || '.trigger_match_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'cascade_batch',
        (row_data->>'parent_batch_id')::uuid, TG_TABLE_NAME || '.parent_batch_id');

    WHEN 'go_v2_cascade_mutation_matches' THEN
      tournament_id := go_v2_reference_tournament('cascade_batch', (row_data->>'batch_id')::uuid);
      match_id := (row_data->>'match_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'match', match_id,
        TG_TABLE_NAME || '.match_id');
      FOR ref_id IN
        SELECT value::uuid FROM jsonb_array_elements_text(jsonb_build_array(
          row_data->>'prior_result_revision_id', row_data->>'new_result_revision_id'
        )) value WHERE value <> 'null'
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM go_v2_match_result_revisions revision
           WHERE revision.id = ref_id AND revision.match_id = match_id
        ) THEN
          RAISE EXCEPTION 'go_v2 match scope mismatch: result revision in %', TG_TABLE_NAME
            USING ERRCODE = '23514';
        END IF;
      END LOOP;
      PERFORM go_v2_require_assignment_scope(tournament_id, NULL, match_id, NULL,
        (row_data->>'prior_schedule_assignment_id')::uuid,
        TG_TABLE_NAME || '.prior_schedule_assignment_id');
      PERFORM go_v2_require_assignment_scope(tournament_id, NULL, match_id, NULL,
        (row_data->>'new_schedule_assignment_id')::uuid,
        TG_TABLE_NAME || '.new_schedule_assignment_id');

    WHEN 'go_v2_attendance_events' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'entry_id')::uuid, TG_TABLE_NAME || '.entry_id');

    WHEN 'go_v2_schedule_disruptions' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      session_id := (row_data->>'schedule_session_id')::uuid;
      PERFORM go_v2_require_session_tournament(tournament_id, session_id,
        TG_TABLE_NAME || '.schedule_session_id');
      PERFORM go_v2_require_session_court(session_id, (row_data->>'court_id')::uuid,
        TG_TABLE_NAME || '.court_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'match',
        (row_data->>'match_id')::uuid, TG_TABLE_NAME || '.match_id');

    WHEN 'go_v2_disruption_matches' THEN
      tournament_id := go_v2_reference_tournament('disruption', (row_data->>'disruption_id')::uuid);
      match_id := (row_data->>'match_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'match', match_id,
        TG_TABLE_NAME || '.match_id');
      PERFORM go_v2_require_assignment_scope(tournament_id, NULL, match_id, NULL,
        (row_data->>'prior_schedule_assignment_id')::uuid,
        TG_TABLE_NAME || '.prior_schedule_assignment_id');

    WHEN 'go_v2_court_grants' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      session_id := (row_data->>'schedule_session_id')::uuid;
      court_id := (row_data->>'court_id')::uuid;
      PERFORM go_v2_require_session_tournament(tournament_id, session_id,
        TG_TABLE_NAME || '.schedule_session_id');
      PERFORM go_v2_require_session_court(session_id, court_id,
        TG_TABLE_NAME || '.court_id');
      IF row_data->>'rotated_from_id' IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM go_v2_court_grants previous
         WHERE previous.id = (row_data->>'rotated_from_id')::uuid
           AND previous.tournament_id = tournament_id
           AND previous.schedule_session_id = session_id
           AND previous.court_id = court_id
      ) THEN
        RAISE EXCEPTION 'go_v2 schedule scope mismatch: %.rotated_from_id', TG_TABLE_NAME
          USING ERRCODE = '23514';
      END IF;

    WHEN 'go_v2_judge_command_journal' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      match_id := (row_data->>'match_id')::uuid;
      court_id := (row_data->>'court_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'match', match_id,
        TG_TABLE_NAME || '.match_id');
      IF NOT EXISTS (
        SELECT 1 FROM go_v2_court_grants grant_row
         WHERE grant_row.id = (row_data->>'grant_id')::uuid
           AND grant_row.tournament_id = tournament_id
           AND grant_row.court_id = court_id
      ) THEN
        RAISE EXCEPTION 'go_v2 schedule scope mismatch: %.grant_id', TG_TABLE_NAME
          USING ERRCODE = '23514';
      END IF;

    WHEN 'go_v2_red_operation_approvals' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'operation_preview',
        (row_data->>'preview_id')::uuid, TG_TABLE_NAME || '.preview_id');

    WHEN 'go_v2_final_placement_snapshots' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      FOR ref_id IN
        SELECT value::uuid
          FROM jsonb_array_elements_text(COALESCE(row_data->'source_stage_ids', '[]'::jsonb)) value
      LOOP
        PERFORM go_v2_require_tournament_reference(tournament_id, 'stage', ref_id,
          TG_TABLE_NAME || '.source_stage_ids');
      END LOOP;
      FOR ref_id IN
        SELECT value::uuid
          FROM jsonb_array_elements_text(COALESCE(row_data->'source_result_revision_ids', '[]'::jsonb)) value
      LOOP
        PERFORM go_v2_require_tournament_reference(tournament_id, 'result_revision', ref_id,
          TG_TABLE_NAME || '.source_result_revision_ids');
      END LOOP;

    WHEN 'go_v2_final_placement_rows' THEN
      tournament_id := go_v2_reference_tournament('final_placement_snapshot',
        (row_data->>'snapshot_id')::uuid);
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'entry_id')::uuid, TG_TABLE_NAME || '.entry_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'stage',
        (row_data->>'source_stage_id')::uuid, TG_TABLE_NAME || '.source_stage_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'match',
        (row_data->>'eliminated_by_match_id')::uuid, TG_TABLE_NAME || '.eliminated_by_match_id');

    WHEN 'go_v2_rating_projection_runs' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'final_placement_snapshot',
        (row_data->>'source_final_placement_snapshot_id')::uuid,
        TG_TABLE_NAME || '.source_final_placement_snapshot_id');
      FOR ref_id IN
        SELECT value::uuid
          FROM jsonb_array_elements_text(COALESCE(row_data->'source_snapshot_ids', '[]'::jsonb)) value
      LOOP
        PERFORM go_v2_require_tournament_reference(tournament_id, 'final_placement_snapshot', ref_id,
          TG_TABLE_NAME || '.source_snapshot_ids');
      END LOOP;

    WHEN 'go_v2_command_receipts' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'court_grant',
        (row_data->>'court_grant_id')::uuid, TG_TABLE_NAME || '.court_grant_id');

    WHEN 'go_v2_match_pause_resolutions' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      session_id := (row_data->>'schedule_session_id')::uuid;
      match_id := (row_data->>'match_id')::uuid;
      court_id := (row_data->>'source_court_id')::uuid;
      PERFORM go_v2_require_session_tournament(tournament_id, session_id,
        TG_TABLE_NAME || '.schedule_session_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'match', match_id,
        TG_TABLE_NAME || '.match_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'disruption',
        (row_data->>'disruption_id')::uuid, TG_TABLE_NAME || '.disruption_id');
      PERFORM go_v2_require_session_court(session_id, court_id,
        TG_TABLE_NAME || '.source_court_id');
      PERFORM go_v2_require_session_court(session_id, (row_data->>'target_court_id')::uuid,
        TG_TABLE_NAME || '.target_court_id');
      PERFORM go_v2_require_schedule_version_scope(tournament_id, session_id,
        (row_data->>'prior_schedule_version_id')::uuid,
        TG_TABLE_NAME || '.prior_schedule_version_id');
      PERFORM go_v2_require_schedule_version_scope(tournament_id, session_id,
        (row_data->>'successor_schedule_version_id')::uuid,
        TG_TABLE_NAME || '.successor_schedule_version_id');
      PERFORM go_v2_require_assignment_scope(tournament_id, session_id, match_id, court_id,
        (row_data->>'prior_schedule_assignment_id')::uuid,
        TG_TABLE_NAME || '.prior_schedule_assignment_id');
      PERFORM go_v2_require_assignment_scope(tournament_id, session_id, match_id,
        (row_data->>'target_court_id')::uuid,
        (row_data->>'successor_schedule_assignment_id')::uuid,
        TG_TABLE_NAME || '.successor_schedule_assignment_id');

    WHEN 'go_v2_disruption_resolutions' THEN
      tournament_id := go_v2_reference_tournament('disruption', (row_data->>'disruption_id')::uuid);
      session_id := (row_data->>'schedule_session_id')::uuid;
      PERFORM go_v2_require_session_tournament(tournament_id, session_id,
        TG_TABLE_NAME || '.schedule_session_id');
      IF NOT EXISTS (
        SELECT 1 FROM go_v2_schedule_disruptions disruption
         WHERE disruption.id = (row_data->>'disruption_id')::uuid
           AND disruption.schedule_session_id = session_id
      ) THEN
        RAISE EXCEPTION 'go_v2 schedule scope mismatch: %.disruption_id', TG_TABLE_NAME
          USING ERRCODE = '23514';
      END IF;

    WHEN 'go_v2_schedule_defer_overrides' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      session_id := (row_data->>'schedule_session_id')::uuid;
      match_id := (row_data->>'match_id')::uuid;
      PERFORM go_v2_require_session_tournament(tournament_id, session_id,
        TG_TABLE_NAME || '.schedule_session_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'match', match_id,
        TG_TABLE_NAME || '.match_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'pause_resolution',
        (row_data->>'pause_resolution_id')::uuid, TG_TABLE_NAME || '.pause_resolution_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'operation_preview',
        (row_data->>'source_preview_id')::uuid, TG_TABLE_NAME || '.source_preview_id');
      PERFORM go_v2_require_schedule_version_scope(tournament_id, session_id,
        (row_data->>'prior_schedule_version_id')::uuid,
        TG_TABLE_NAME || '.prior_schedule_version_id');
      PERFORM go_v2_require_schedule_version_scope(tournament_id, session_id,
        (row_data->>'successor_schedule_version_id')::uuid,
        TG_TABLE_NAME || '.successor_schedule_version_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'schedule_defer',
        (row_data->>'supersedes_id')::uuid, TG_TABLE_NAME || '.supersedes_id');

    WHEN 'go_v2_match_court_segments' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      session_id := (row_data->>'schedule_session_id')::uuid;
      match_id := (row_data->>'match_id')::uuid;
      court_id := (row_data->>'court_id')::uuid;
      PERFORM go_v2_require_session_tournament(tournament_id, session_id,
        TG_TABLE_NAME || '.schedule_session_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'match', match_id,
        TG_TABLE_NAME || '.match_id');
      PERFORM go_v2_require_schedule_version_scope(tournament_id, session_id,
        (row_data->>'schedule_version_id')::uuid, TG_TABLE_NAME || '.schedule_version_id');
      PERFORM go_v2_require_session_court(session_id, court_id,
        TG_TABLE_NAME || '.court_id');
      PERFORM go_v2_require_assignment_scope(tournament_id, session_id, match_id, court_id,
        (row_data->>'schedule_assignment_id')::uuid,
        TG_TABLE_NAME || '.schedule_assignment_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'pause_resolution',
        (row_data->>'pause_resolution_id')::uuid, TG_TABLE_NAME || '.pause_resolution_id');

    WHEN 'go_v2_tournament_role_revisions' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'operation_preview',
        (row_data->>'source_preview_id')::uuid, TG_TABLE_NAME || '.source_preview_id');
      IF row_data->>'supersedes_id' IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM go_v2_tournament_role_revisions previous
         WHERE previous.id = (row_data->>'supersedes_id')::uuid
           AND previous.tournament_id = tournament_id
      ) THEN
        RAISE EXCEPTION 'go_v2 tournament scope mismatch: %.supersedes_id', TG_TABLE_NAME
          USING ERRCODE = '23514';
      END IF;

    WHEN 'go_v2_court_policy_revisions' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      session_id := (row_data->>'schedule_session_id')::uuid;
      PERFORM go_v2_require_session_tournament(tournament_id, session_id,
        TG_TABLE_NAME || '.schedule_session_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'operation_preview',
        (row_data->>'source_preview_id')::uuid, TG_TABLE_NAME || '.source_preview_id');
      PERFORM go_v2_require_schedule_version_scope(tournament_id, session_id,
        (row_data->>'successor_schedule_version_id')::uuid,
        TG_TABLE_NAME || '.successor_schedule_version_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'court_policy_revision',
        (row_data->>'supersedes_id')::uuid, TG_TABLE_NAME || '.supersedes_id');

    WHEN 'go_v2_court_policy_exception_revisions' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      session_id := (row_data->>'schedule_session_id')::uuid;
      PERFORM go_v2_require_session_tournament(tournament_id, session_id,
        TG_TABLE_NAME || '.schedule_session_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'court_policy_revision',
        (row_data->>'policy_revision_id')::uuid, TG_TABLE_NAME || '.policy_revision_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'stage',
        (row_data->>'stage_id')::uuid, TG_TABLE_NAME || '.stage_id');
      FOR ref_id IN
        SELECT value::uuid
          FROM jsonb_array_elements_text(COALESCE(row_data->'allowed_court_ids', '[]'::jsonb)) value
      LOOP
        PERFORM go_v2_require_session_court(session_id, ref_id,
          TG_TABLE_NAME || '.allowed_court_ids');
      END LOOP;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'operation_preview',
        (row_data->>'source_preview_id')::uuid, TG_TABLE_NAME || '.source_preview_id');
      PERFORM go_v2_require_schedule_version_scope(tournament_id, session_id,
        (row_data->>'successor_schedule_version_id')::uuid,
        TG_TABLE_NAME || '.successor_schedule_version_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'court_policy_exception',
        (row_data->>'supersedes_id')::uuid, TG_TABLE_NAME || '.supersedes_id');

    WHEN 'go_v2_stage_rule_revisions' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'stage',
        (row_data->>'stage_id')::uuid, TG_TABLE_NAME || '.stage_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'stage_rule_revision',
        (row_data->>'supersedes_id')::uuid, TG_TABLE_NAME || '.supersedes_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'operation_preview',
        (row_data->>'source_preview_id')::uuid, TG_TABLE_NAME || '.source_preview_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'red_approval',
        (row_data->>'red_approval_id')::uuid, TG_TABLE_NAME || '.red_approval_id');
      PERFORM go_v2_require_schedule_version_scope(tournament_id, NULL,
        (row_data->>'successor_schedule_version_id')::uuid,
        TG_TABLE_NAME || '.successor_schedule_version_id');

    WHEN 'go_v2_match_rule_revisions' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'match',
        (row_data->>'match_id')::uuid, TG_TABLE_NAME || '.match_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'stage_rule_revision',
        (row_data->>'stage_rule_revision_id')::uuid, TG_TABLE_NAME || '.stage_rule_revision_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'match_rule_revision',
        (row_data->>'supersedes_id')::uuid, TG_TABLE_NAME || '.supersedes_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'operation_preview',
        (row_data->>'source_preview_id')::uuid, TG_TABLE_NAME || '.source_preview_id');
      PERFORM go_v2_require_schedule_version_scope(tournament_id, NULL,
        (row_data->>'successor_schedule_version_id')::uuid,
        TG_TABLE_NAME || '.successor_schedule_version_id');

    WHEN 'go_v2_publication_state_revisions' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'operation_preview',
        (row_data->>'source_preview_id')::uuid, TG_TABLE_NAME || '.source_preview_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'red_approval',
        (row_data->>'red_approval_id')::uuid, TG_TABLE_NAME || '.red_approval_id');
      PERFORM go_v2_require_schedule_version_scope(tournament_id, NULL,
        (row_data->>'successor_schedule_version_id')::uuid,
        TG_TABLE_NAME || '.successor_schedule_version_id');

    WHEN 'go_v2_reserve_promotion_revisions' THEN
      tournament_id := (row_data->>'tournament_id')::uuid;
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'reserve_entry_id')::uuid, TG_TABLE_NAME || '.reserve_entry_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'entry',
        (row_data->>'target_entry_id')::uuid, TG_TABLE_NAME || '.target_entry_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'rating_snapshot',
        (row_data->>'rating_snapshot_id')::uuid, TG_TABLE_NAME || '.rating_snapshot_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'operation_preview',
        (row_data->>'source_preview_id')::uuid, TG_TABLE_NAME || '.source_preview_id');
      PERFORM go_v2_require_tournament_reference(tournament_id, 'red_approval',
        (row_data->>'red_approval_id')::uuid, TG_TABLE_NAME || '.red_approval_id');
      PERFORM go_v2_require_schedule_version_scope(tournament_id, NULL,
        (row_data->>'prior_schedule_version_id')::uuid,
        TG_TABLE_NAME || '.prior_schedule_version_id');
      PERFORM go_v2_require_schedule_version_scope(tournament_id, NULL,
        (row_data->>'successor_schedule_version_id')::uuid,
        TG_TABLE_NAME || '.successor_schedule_version_id');
      IF NOT EXISTS (
        SELECT 1 FROM go_v2_roster_revisions roster
         WHERE roster.id = (row_data->>'reserve_roster_revision_id')::uuid
           AND roster.entry_id = (row_data->>'reserve_entry_id')::uuid
      ) THEN
        RAISE EXCEPTION 'go_v2 tournament scope mismatch: %.reserve_roster_revision_id', TG_TABLE_NAME
          USING ERRCODE = '23514';
      END IF;

    ELSE
      RAISE EXCEPTION 'go_v2 scope guard is not configured for table %', TG_TABLE_NAME
        USING ERRCODE = '55000';
  END CASE;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  guarded_table TEXT;
BEGIN
  FOREACH guarded_table IN ARRAY ARRAY[
    'go_v2_tournament_state',
    'go_v2_entries',
    'go_v2_rating_snapshot_entries',
    'go_v2_stages',
    'go_v2_stage_edges',
    'go_v2_pool_assignments',
    'go_v2_matches',
    'go_v2_match_slot_sources',
    'go_v2_match_lineup_snapshots',
    'go_v2_match_result_revisions',
    'go_v2_match_standing_contributions',
    'go_v2_standing_snapshots',
    'go_v2_standing_snapshot_rows',
    'go_v2_qualification_snapshots',
    'go_v2_qualification_snapshot_rows',
    'go_v2_schedule_session_tournaments',
    'go_v2_schedule_versions',
    'go_v2_schedule_assignments',
    'go_v2_referee_duties',
    'go_v2_incidents',
    'go_v2_cascade_mutation_batches',
    'go_v2_cascade_mutation_matches',
    'go_v2_attendance_events',
    'go_v2_schedule_disruptions',
    'go_v2_disruption_matches',
    'go_v2_court_grants',
    'go_v2_judge_command_journal',
    'go_v2_red_operation_approvals',
    'go_v2_final_placement_snapshots',
    'go_v2_final_placement_rows',
    'go_v2_rating_projection_runs',
    'go_v2_command_receipts',
    'go_v2_match_pause_resolutions',
    'go_v2_disruption_resolutions',
    'go_v2_schedule_defer_overrides',
    'go_v2_match_court_segments',
    'go_v2_tournament_role_revisions',
    'go_v2_court_policy_revisions',
    'go_v2_court_policy_exception_revisions',
    'go_v2_stage_rule_revisions',
    'go_v2_match_rule_revisions',
    'go_v2_publication_state_revisions',
    'go_v2_reserve_promotion_revisions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS go_v2_same_tournament_scope_guard ON %I', guarded_table);
    EXECUTE format(
      'CREATE TRIGGER go_v2_same_tournament_scope_guard '
      'BEFORE INSERT OR UPDATE ON %I FOR EACH ROW '
      'EXECUTE FUNCTION go_v2_same_tournament_scope_guard()',
      guarded_table
    );
  END LOOP;
END $$;

-- Roster revisions are snapshots. Changes are represented by a new revision;
-- neither reserve promotion nor any other application workflow may rewrite one.
DROP TRIGGER IF EXISTS go_v2_immutable_history_guard ON go_v2_roster_revision_members;
CREATE TRIGGER go_v2_immutable_history_guard
BEFORE UPDATE OR DELETE ON go_v2_roster_revision_members
FOR EACH ROW
EXECUTE FUNCTION go_v2_reject_immutable_mutation();

DROP TRIGGER IF EXISTS go_v2_immutable_history_guard ON go_v2_roster_revisions;
CREATE TRIGGER go_v2_immutable_history_guard
BEFORE UPDATE OR DELETE ON go_v2_roster_revisions
FOR EACH ROW
EXECUTE FUNCTION go_v2_reject_immutable_mutation();

DROP TRIGGER IF EXISTS go_v2_immutable_history_guard ON go_v2_reserve_promotion_revisions;
CREATE TRIGGER go_v2_immutable_history_guard
BEFORE UPDATE OR DELETE ON go_v2_reserve_promotion_revisions
FOR EACH ROW
EXECUTE FUNCTION go_v2_reject_immutable_mutation();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    GRANT SELECT, INSERT ON go_v2_reserve_promotion_revisions TO lpbvolley;
  END IF;
END $$;

COMMIT;
