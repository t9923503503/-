BEGIN;

-- Pilot live-safety additions are additive. Migration 108 deliberately keeps
-- legacy tournament engines isolated and only extends the GO V2 tables.

INSERT INTO go_v2_mutation_reason_catalog (code, label, requires_note)
VALUES
  ('disruption_resolved', 'Schedule disruption resolved', true),
  ('match_pause_deferred', 'Paused match decision deferred', true),
  ('match_pause_resume_authorized', 'Paused match resume authorized', true),
  ('live_match_transfer', 'Paused live match transferred to another court', true),
  ('paper_result_import', 'Played result imported from a paper protocol', true)
ON CONFLICT (code) DO NOTHING;

-- Operation previews and second-approval receipts are security lineage, not
-- mutable work rows. The only permitted UPDATE is the one-way consumption
-- transition used by commit. Re-previewing now retires the old row and inserts
-- a new one, so reviewed payload/actor/version data is never rewritten.
CREATE OR REPLACE FUNCTION go_v2_guard_operation_preview_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'go_v2 operation preview history is append-only'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.consumed_at IS NOT NULL OR NEW.expires_at <= NEW.created_at THEN
      RAISE EXCEPTION 'go_v2 operation preview must be inserted active with a future expiry'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.consumed_at IS NULL
     AND NEW.consumed_at IS NOT NULL
     AND NEW.consumed_at IS NOT DISTINCT FROM transaction_timestamp()
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.tournament_id IS NOT DISTINCT FROM OLD.tournament_id
     AND NEW.operation_kind IS NOT DISTINCT FROM OLD.operation_kind
     AND NEW.aggregate_version IS NOT DISTINCT FROM OLD.aggregate_version
     AND NEW.input_hash IS NOT DISTINCT FROM OLD.input_hash
     AND NEW.risk IS NOT DISTINCT FROM OLD.risk
     AND NEW.payload IS NOT DISTINCT FROM OLD.payload
     AND NEW.result IS NOT DISTINCT FROM OLD.result
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'go_v2 operation preview history is append-only; only first consumption is allowed'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS go_v2_operation_preview_history_guard
  ON go_v2_operation_previews;
CREATE TRIGGER go_v2_operation_preview_history_guard
BEFORE INSERT OR UPDATE OR DELETE ON go_v2_operation_previews
FOR EACH ROW
EXECUTE FUNCTION go_v2_guard_operation_preview_history();

CREATE OR REPLACE FUNCTION go_v2_guard_red_approval_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'go_v2 red approval history is append-only'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.consumed_at IS NOT NULL THEN
      RAISE EXCEPTION 'go_v2 red approval must be inserted unconsumed'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM go_v2_operation_previews preview
       WHERE preview.id = NEW.preview_id
         AND preview.tournament_id = NEW.tournament_id
         AND preview.risk = 'red'
         AND preview.created_by = NEW.requested_by
         AND preview.input_hash = NEW.reviewed_input_hash
         AND preview.aggregate_version = NEW.reviewed_aggregate_version
         AND preview.consumed_at IS NULL
         AND preview.expires_at > clock_timestamp()
         AND NEW.expires_at <= preview.expires_at
         AND NEW.expires_at > clock_timestamp()
    ) THEN
      RAISE EXCEPTION 'go_v2 red approval does not match a fresh immutable preview'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.consumed_at IS NULL
     AND NEW.consumed_at IS NOT NULL
     AND NEW.consumed_at IS NOT DISTINCT FROM transaction_timestamp()
     AND NEW.expires_at > clock_timestamp()
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.tournament_id IS NOT DISTINCT FROM OLD.tournament_id
     AND NEW.preview_id IS NOT DISTINCT FROM OLD.preview_id
     AND NEW.requested_by IS NOT DISTINCT FROM OLD.requested_by
     AND NEW.approved_by IS NOT DISTINCT FROM OLD.approved_by
     AND NEW.approved_role IS NOT DISTINCT FROM OLD.approved_role
     AND NEW.command_id IS NOT DISTINCT FROM OLD.command_id
     AND NEW.request_hash IS NOT DISTINCT FROM OLD.request_hash
     AND NEW.reviewed_input_hash IS NOT DISTINCT FROM OLD.reviewed_input_hash
     AND NEW.reviewed_aggregate_version IS NOT DISTINCT FROM OLD.reviewed_aggregate_version
     AND NEW.device_id IS NOT DISTINCT FROM OLD.device_id
     AND NEW.reason_code IS NOT DISTINCT FROM OLD.reason_code
     AND NEW.reason_note IS NOT DISTINCT FROM OLD.reason_note
     AND NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'go_v2 red approval history is append-only; only fresh first consumption is allowed'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS go_v2_red_approval_history_guard
  ON go_v2_red_operation_approvals;
CREATE TRIGGER go_v2_red_approval_history_guard
BEFORE INSERT OR UPDATE OR DELETE ON go_v2_red_operation_approvals
FOR EACH ROW
EXECUTE FUNCTION go_v2_guard_red_approval_history();

-- Result provenance is a first-class lifecycle field. Corrections and
-- technical outcomes are never disguised as ordinary judge submissions.
ALTER TABLE go_v2_match_result_revisions
  ADD COLUMN IF NOT EXISTS result_source TEXT NOT NULL DEFAULT 'legacy_admin';
ALTER TABLE go_v2_match_result_revisions
  DROP CONSTRAINT IF EXISTS go_v2_match_result_revisions_result_source_check;
ALTER TABLE go_v2_match_result_revisions
  ADD CONSTRAINT go_v2_match_result_revisions_result_source_check CHECK (
    result_source IN (
      'judge_review', 'paper_import', 'incident', 'withdrawal',
      'cascade', 'undo', 'legacy_admin'
    )
  );

-- A disruption has one explicit scope. expected_end_at is an advisory ETA;
-- an active safety hold remains authoritative until an explicit resolution.
ALTER TABLE go_v2_schedule_disruptions
  ADD COLUMN IF NOT EXISTS scope_kind TEXT NOT NULL DEFAULT 'session',
  ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES go_v2_matches(id) ON DELETE RESTRICT;

UPDATE go_v2_schedule_disruptions
SET scope_kind = CASE WHEN court_id IS NOT NULL THEN 'court' ELSE 'session' END
WHERE match_id IS NULL;

ALTER TABLE go_v2_schedule_disruptions
  DROP CONSTRAINT IF EXISTS go_v2_schedule_disruptions_scope_kind_check,
  DROP CONSTRAINT IF EXISTS go_v2_schedule_disruptions_scope_shape_check;
ALTER TABLE go_v2_schedule_disruptions
  ADD CONSTRAINT go_v2_schedule_disruptions_scope_kind_check
    CHECK (scope_kind IN ('match', 'court', 'session')),
  ADD CONSTRAINT go_v2_schedule_disruptions_scope_shape_check CHECK (
    (scope_kind = 'match' AND match_id IS NOT NULL AND court_id IS NULL) OR
    (scope_kind = 'court' AND court_id IS NOT NULL AND match_id IS NULL) OR
    (scope_kind = 'session' AND court_id IS NULL AND match_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS go_v2_schedule_disruptions_session_active_idx
  ON go_v2_schedule_disruptions(schedule_session_id, status, starts_at, id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS go_v2_schedule_disruptions_match_active_idx
  ON go_v2_schedule_disruptions(match_id, starts_at, id)
  WHERE status = 'active' AND match_id IS NOT NULL;

COMMENT ON COLUMN go_v2_schedule_disruptions.expected_end_at IS
  'Advisory public ETA only. It never resolves or stops enforcing an active hold.';

-- Every published schedule keeps the exact server input and independent
-- validator result that were approved. These fields never change afterwards.
ALTER TABLE go_v2_schedule_versions
  ADD COLUMN IF NOT EXISTS publication_kind TEXT NOT NULL DEFAULT 'replan',
  ADD COLUMN IF NOT EXISTS source_preview_id UUID REFERENCES go_v2_operation_previews(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS validator_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS diff_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE go_v2_schedule_versions
SET publication_kind = CASE WHEN version_no = 1 THEN 'initial' ELSE 'replan' END
WHERE publication_kind NOT IN (
  'initial', 'replan', 'live_transfer', 'court_policy_exception', 'schedule_defer', 'stage_rule_change', 'cascade', 'undo'
);

ALTER TABLE go_v2_schedule_versions
  DROP CONSTRAINT IF EXISTS go_v2_schedule_versions_publication_kind_check;
ALTER TABLE go_v2_schedule_versions
  ADD CONSTRAINT go_v2_schedule_versions_publication_kind_check CHECK (
    publication_kind IN (
      'initial', 'replan', 'live_transfer', 'court_policy_exception', 'schedule_defer', 'stage_rule_change', 'cascade', 'undo'
    )
  );

CREATE OR REPLACE FUNCTION go_v2_guard_schedule_version_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.version_no IS DISTINCT FROM OLD.version_no
     OR NEW.solver_status IS DISTINCT FROM OLD.solver_status
     OR NEW.solver_version IS DISTINCT FROM OLD.solver_version
     OR NEW.input_hash IS DISTINCT FROM OLD.input_hash
     OR NEW.schedule_hash IS DISTINCT FROM OLD.schedule_hash
     OR NEW.elapsed_ms IS DISTINCT FROM OLD.elapsed_ms
     OR NEW.expanded_states IS DISTINCT FROM OLD.expanded_states
     OR NEW.repair_passes IS DISTINCT FROM OLD.repair_passes
     OR NEW.objective IS DISTINCT FROM OLD.objective
     OR NEW.conflicts IS DISTINCT FROM OLD.conflicts
     OR NEW.based_on_version_id IS DISTINCT FROM OLD.based_on_version_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.publication_kind IS DISTINCT FROM OLD.publication_kind
     OR NEW.source_preview_id IS DISTINCT FROM OLD.source_preview_id
     OR NEW.input_snapshot IS DISTINCT FROM OLD.input_snapshot
     OR NEW.validator_result IS DISTINCT FROM OLD.validator_result
     OR NEW.diff_snapshot IS DISTINCT FROM OLD.diff_snapshot THEN
    RAISE EXCEPTION 'go_v2 published schedule provenance is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS go_v2_schedule_version_provenance_guard
  ON go_v2_schedule_versions;
CREATE TRIGGER go_v2_schedule_version_provenance_guard
BEFORE UPDATE ON go_v2_schedule_versions
FOR EACH ROW
EXECUTE FUNCTION go_v2_guard_schedule_version_immutable_fields();

-- A pause decision is append-only. A transfer links the old and successor
-- assignments while the judge command version invalidates stale offline work.
CREATE TABLE IF NOT EXISTS go_v2_match_pause_resolutions (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id              UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  schedule_session_id        UUID NOT NULL REFERENCES go_v2_schedule_sessions(id) ON DELETE RESTRICT,
  match_id                   UUID NOT NULL REFERENCES go_v2_matches(id) ON DELETE RESTRICT,
  disruption_id              UUID REFERENCES go_v2_schedule_disruptions(id) ON DELETE RESTRICT,
  decision                   TEXT NOT NULL CHECK (decision IN ('defer', 'resume_same_court', 'transfer')),
  source_court_id            UUID NOT NULL REFERENCES go_v2_courts(id) ON DELETE RESTRICT,
  target_court_id            UUID REFERENCES go_v2_courts(id) ON DELETE RESTRICT,
  prior_schedule_version_id  UUID NOT NULL REFERENCES go_v2_schedule_versions(id) ON DELETE RESTRICT,
  successor_schedule_version_id UUID REFERENCES go_v2_schedule_versions(id) ON DELETE RESTRICT,
  prior_schedule_assignment_id UUID NOT NULL REFERENCES go_v2_schedule_assignments(id) ON DELETE RESTRICT,
  successor_schedule_assignment_id UUID REFERENCES go_v2_schedule_assignments(id) ON DELETE RESTRICT,
  prior_command_version      BIGINT NOT NULL CHECK (prior_command_version >= 0),
  resulting_command_version  BIGINT NOT NULL CHECK (resulting_command_version >= prior_command_version),
  reason_code                TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note                TEXT,
  actor_id                   TEXT NOT NULL,
  command_id                 TEXT NOT NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, command_id),
  CHECK (
    (decision = 'transfer'
      AND target_court_id IS NOT NULL
      AND target_court_id <> source_court_id
      AND successor_schedule_version_id IS NOT NULL
      AND successor_schedule_assignment_id IS NOT NULL)
    OR
    (decision <> 'transfer'
      AND target_court_id IS NULL
      AND successor_schedule_version_id IS NULL
      AND successor_schedule_assignment_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS go_v2_match_pause_resolutions_match_idx
  ON go_v2_match_pause_resolutions(match_id, created_at DESC, id DESC);

-- Resolving a safety hold is a separate append-only director decision. The
-- mutable status on the disruption remains the fast current-state projection;
-- this ledger is the authoritative explanation of who closed it and against
-- which shared-session snapshot.
CREATE TABLE IF NOT EXISTS go_v2_disruption_resolutions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disruption_id         UUID NOT NULL UNIQUE REFERENCES go_v2_schedule_disruptions(id) ON DELETE RESTRICT,
  schedule_session_id   UUID NOT NULL REFERENCES go_v2_schedule_sessions(id) ON DELETE RESTRICT,
  resolution            TEXT NOT NULL CHECK (resolution IN ('resolved', 'cancelled')),
  prior_status          TEXT NOT NULL CHECK (prior_status = 'active'),
  resulting_status      TEXT NOT NULL CHECK (resulting_status IN ('resolved', 'cancelled')),
  affected_snapshot     JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason_code           TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note           TEXT,
  actor_id              TEXT NOT NULL,
  command_id            TEXT NOT NULL,
  resolved_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_session_id, command_id),
  CHECK (resolution = resulting_status)
);

-- Defer is not a sporting result and never changes play_state to skipped or
-- voided. The latest row for a match is its current scheduling instruction;
-- resume/transfer writes a compensating release row instead of deleting it.
CREATE TABLE IF NOT EXISTS go_v2_schedule_defer_overrides (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id         UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  schedule_session_id   UUID NOT NULL REFERENCES go_v2_schedule_sessions(id) ON DELETE RESTRICT,
  match_id              UUID NOT NULL REFERENCES go_v2_matches(id) ON DELETE RESTRICT,
  action                TEXT NOT NULL CHECK (action IN ('defer', 'release')),
  defer_mode            TEXT CHECK (defer_mode IS NULL OR defer_mode IN ('not_before', 'end_of_queue')),
  not_before            TIMESTAMPTZ,
  pause_resolution_id   UUID REFERENCES go_v2_match_pause_resolutions(id) ON DELETE RESTRICT,
  source_preview_id     UUID REFERENCES go_v2_operation_previews(id) ON DELETE RESTRICT,
  prior_schedule_version_id UUID REFERENCES go_v2_schedule_versions(id) ON DELETE RESTRICT,
  successor_schedule_version_id UUID REFERENCES go_v2_schedule_versions(id) ON DELETE RESTRICT,
  supersedes_id         UUID REFERENCES go_v2_schedule_defer_overrides(id) ON DELETE RESTRICT,
  reason_code           TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note           TEXT,
  actor_id              TEXT NOT NULL,
  command_id            TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, command_id),
  UNIQUE (source_preview_id),
  CONSTRAINT go_v2_schedule_defer_overrides_shape_check CHECK (
    (action = 'defer' AND defer_mode IS NOT NULL AND not_before IS NOT NULL) OR
    (action = 'release' AND defer_mode IS NULL AND not_before IS NULL)
  ),
  CONSTRAINT go_v2_schedule_defer_overrides_lineage_check CHECK (
    pause_resolution_id IS NOT NULL OR (
      source_preview_id IS NOT NULL
      AND prior_schedule_version_id IS NOT NULL
      AND successor_schedule_version_id IS NOT NULL
    )
  )
);

-- Keep repeat execution safe for databases that rehearsed an earlier draft of
-- this migration before generic pending/ready defer was added.
ALTER TABLE go_v2_schedule_defer_overrides
  ALTER COLUMN pause_resolution_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_preview_id UUID REFERENCES go_v2_operation_previews(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS prior_schedule_version_id UUID REFERENCES go_v2_schedule_versions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS successor_schedule_version_id UUID REFERENCES go_v2_schedule_versions(id) ON DELETE RESTRICT;
ALTER TABLE go_v2_schedule_defer_overrides
  DROP CONSTRAINT IF EXISTS go_v2_schedule_defer_overrides_check,
  DROP CONSTRAINT IF EXISTS go_v2_schedule_defer_overrides_shape_check,
  DROP CONSTRAINT IF EXISTS go_v2_schedule_defer_overrides_lineage_check;
ALTER TABLE go_v2_schedule_defer_overrides
  ADD CONSTRAINT go_v2_schedule_defer_overrides_shape_check CHECK (
    (action = 'defer' AND defer_mode IS NOT NULL AND not_before IS NOT NULL) OR
    (action = 'release' AND defer_mode IS NULL AND not_before IS NULL)
  ),
  ADD CONSTRAINT go_v2_schedule_defer_overrides_lineage_check CHECK (
    pause_resolution_id IS NOT NULL OR (
      source_preview_id IS NOT NULL
      AND prior_schedule_version_id IS NOT NULL
      AND successor_schedule_version_id IS NOT NULL
    )
  );
CREATE UNIQUE INDEX IF NOT EXISTS go_v2_schedule_defer_overrides_preview_uidx
  ON go_v2_schedule_defer_overrides(source_preview_id)
  WHERE source_preview_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS go_v2_schedule_defer_overrides_match_idx
  ON go_v2_schedule_defer_overrides(match_id, created_at DESC, id DESC);

-- A transferred live match keeps one continuous score/lineup but gains a new
-- physical-court segment. A target segment may be authorized while the match
-- is paused and receives started_at only when its target-court judge resumes.
CREATE TABLE IF NOT EXISTS go_v2_match_court_segments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id         UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  schedule_session_id   UUID NOT NULL REFERENCES go_v2_schedule_sessions(id) ON DELETE RESTRICT,
  match_id              UUID NOT NULL REFERENCES go_v2_matches(id) ON DELETE RESTRICT,
  segment_no            INT NOT NULL CHECK (segment_no >= 1),
  schedule_version_id   UUID NOT NULL REFERENCES go_v2_schedule_versions(id) ON DELETE RESTRICT,
  schedule_assignment_id UUID NOT NULL REFERENCES go_v2_schedule_assignments(id) ON DELETE RESTRICT,
  court_id              UUID NOT NULL REFERENCES go_v2_courts(id) ON DELETE RESTRICT,
  pause_resolution_id   UUID REFERENCES go_v2_match_pause_resolutions(id) ON DELETE RESTRICT,
  authorized_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at            TIMESTAMPTZ,
  ended_at              TIMESTAMPTZ,
  opening_score         JSONB NOT NULL DEFAULT '{}'::jsonb,
  closing_score         JSONB,
  lineup_snapshot       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by            TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, segment_no),
  UNIQUE (schedule_assignment_id, match_id),
  CHECK (started_at IS NULL OR ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS go_v2_match_court_segments_open_uidx
  ON go_v2_match_court_segments(match_id) WHERE ended_at IS NULL;

CREATE OR REPLACE FUNCTION go_v2_guard_match_court_segment_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tournament_id IS DISTINCT FROM OLD.tournament_id
     OR NEW.schedule_session_id IS DISTINCT FROM OLD.schedule_session_id
     OR NEW.match_id IS DISTINCT FROM OLD.match_id
     OR NEW.segment_no IS DISTINCT FROM OLD.segment_no
     OR NEW.schedule_version_id IS DISTINCT FROM OLD.schedule_version_id
     OR NEW.schedule_assignment_id IS DISTINCT FROM OLD.schedule_assignment_id
     OR NEW.court_id IS DISTINCT FROM OLD.court_id
     OR NEW.pause_resolution_id IS DISTINCT FROM OLD.pause_resolution_id
     OR NEW.authorized_at IS DISTINCT FROM OLD.authorized_at
     OR NEW.opening_score IS DISTINCT FROM OLD.opening_score
     OR NEW.lineup_snapshot IS DISTINCT FROM OLD.lineup_snapshot
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at)
     OR (OLD.ended_at IS NOT NULL AND NEW.ended_at IS DISTINCT FROM OLD.ended_at)
     OR (OLD.closing_score IS NOT NULL AND NEW.closing_score IS DISTINCT FROM OLD.closing_score) THEN
    RAISE EXCEPTION 'go_v2 match court segment provenance is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS go_v2_match_court_segment_update_guard
  ON go_v2_match_court_segments;
CREATE TRIGGER go_v2_match_court_segment_update_guard
BEFORE UPDATE ON go_v2_match_court_segments
FOR EACH ROW
EXECUTE FUNCTION go_v2_guard_match_court_segment_update();

DROP TRIGGER IF EXISTS go_v2_match_court_segment_delete_guard
  ON go_v2_match_court_segments;
CREATE TRIGGER go_v2_match_court_segment_delete_guard
BEFORE DELETE ON go_v2_match_court_segments
FOR EACH ROW
EXECUTE FUNCTION go_v2_reject_immutable_mutation();

DROP TRIGGER IF EXISTS go_v2_immutable_history_guard
  ON go_v2_match_pause_resolutions;
CREATE TRIGGER go_v2_immutable_history_guard
BEFORE UPDATE OR DELETE ON go_v2_match_pause_resolutions
FOR EACH ROW
EXECUTE FUNCTION go_v2_reject_immutable_mutation();

DROP TRIGGER IF EXISTS go_v2_immutable_history_guard
  ON go_v2_disruption_resolutions;
CREATE TRIGGER go_v2_immutable_history_guard
BEFORE UPDATE OR DELETE ON go_v2_disruption_resolutions
FOR EACH ROW
EXECUTE FUNCTION go_v2_reject_immutable_mutation();

DROP TRIGGER IF EXISTS go_v2_immutable_history_guard
  ON go_v2_schedule_defer_overrides;
CREATE TRIGGER go_v2_immutable_history_guard
BEFORE UPDATE OR DELETE ON go_v2_schedule_defer_overrides
FOR EACH ROW
EXECUTE FUNCTION go_v2_reject_immutable_mutation();

-- Tournament-scoped authorization is revisioned independently from the
-- process-wide admin credential. The newest revision for a principal is the
-- current projection; revocation is another immutable row, never a DELETE.
INSERT INTO go_v2_mutation_reason_catalog (code, label, requires_note)
VALUES
  ('tournament_role_changed', 'Tournament role changed', true),
  ('court_policy_changed', 'Court allocation policy changed', true),
  ('court_policy_exception', 'Court allocation exception approved', true),
  ('schedule_deferred', 'Pending or ready match deferred in schedule', true),
  ('schedule_defer_released', 'Schedule defer override released', true),
  ('stage_rule_changed', 'Stage match rule changed', true),
  ('match_rule_changed', 'Match rule changed', true),
  ('publication_state_changed', 'Tournament publication state changed', true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS go_v2_tournament_role_revisions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id         UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  principal_id          TEXT NOT NULL CHECK (NULLIF(btrim(principal_id), '') IS NOT NULL),
  revision_no           INT NOT NULL CHECK (revision_no >= 1),
  decision              TEXT NOT NULL CHECK (decision IN ('assign', 'revoke')),
  role_kind             TEXT NOT NULL CHECK (role_kind IN ('director', 'operator', 'viewer')),
  supersedes_id         UUID REFERENCES go_v2_tournament_role_revisions(id) ON DELETE RESTRICT,
  source_preview_id     UUID REFERENCES go_v2_operation_previews(id) ON DELETE RESTRICT,
  reason_code           TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note           TEXT NOT NULL CHECK (NULLIF(btrim(reason_note), '') IS NOT NULL),
  author_id             TEXT NOT NULL CHECK (NULLIF(btrim(author_id), '') IS NOT NULL),
  author_role           TEXT NOT NULL CHECK (author_role IN ('director', 'admin')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, principal_id, revision_no),
  CHECK (
    (revision_no = 1 AND supersedes_id IS NULL) OR
    (revision_no > 1 AND supersedes_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS go_v2_tournament_role_revisions_current_idx
  ON go_v2_tournament_role_revisions(tournament_id, principal_id, revision_no DESC, id DESC);

DROP TRIGGER IF EXISTS go_v2_immutable_history_guard
  ON go_v2_tournament_role_revisions;
CREATE TRIGGER go_v2_immutable_history_guard
BEFORE UPDATE OR DELETE ON go_v2_tournament_role_revisions
FOR EACH ROW
EXECUTE FUNCTION go_v2_reject_immutable_mutation();

-- The hard court matrix is frozen with the exact schedule preview and
-- successor version that made it effective. The active pointer below is only
-- a current-state projection; every historical policy remains append-only.
CREATE TABLE IF NOT EXISTS go_v2_court_policy_revisions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id         UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  schedule_session_id   UUID NOT NULL REFERENCES go_v2_schedule_sessions(id) ON DELETE RESTRICT,
  revision_no           INT NOT NULL CHECK (revision_no >= 1),
  policy_key            TEXT NOT NULL DEFAULT 'lpv_tier_courts_v1'
                        CHECK (policy_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  tier_profile          TEXT NOT NULL CHECK (tier_profile IN ('hard_light', 'hard_medium_light')),
  policy_snapshot       JSONB NOT NULL CHECK (jsonb_typeof(policy_snapshot) = 'object'),
  policy_hash           TEXT NOT NULL CHECK (policy_hash ~ '^[0-9a-f]{64}$'),
  effective_from        TIMESTAMPTZ NOT NULL,
  supersedes_id         UUID REFERENCES go_v2_court_policy_revisions(id) ON DELETE RESTRICT,
  source_preview_id     UUID NOT NULL REFERENCES go_v2_operation_previews(id) ON DELETE RESTRICT,
  successor_schedule_version_id UUID NOT NULL REFERENCES go_v2_schedule_versions(id) ON DELETE RESTRICT,
  reason_code           TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note           TEXT NOT NULL CHECK (NULLIF(btrim(reason_note), '') IS NOT NULL),
  actor_id              TEXT NOT NULL CHECK (NULLIF(btrim(actor_id), '') IS NOT NULL),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_session_id, tournament_id, revision_no),
  UNIQUE (schedule_session_id, tournament_id, policy_hash),
  FOREIGN KEY (schedule_session_id, tournament_id)
    REFERENCES go_v2_schedule_session_tournaments(session_id, tournament_id)
    ON DELETE RESTRICT,
  CHECK (
    (revision_no = 1 AND supersedes_id IS NULL) OR
    (revision_no > 1 AND supersedes_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS go_v2_court_policy_revisions_current_idx
  ON go_v2_court_policy_revisions(schedule_session_id, tournament_id, revision_no DESC, id DESC);

ALTER TABLE go_v2_schedule_session_tournaments
  ADD COLUMN IF NOT EXISTS active_court_policy_revision_id UUID;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'go_v2_session_tournament_active_court_policy_fk'
      AND conrelid = 'go_v2_schedule_session_tournaments'::regclass
  ) THEN
    ALTER TABLE go_v2_schedule_session_tournaments
      ADD CONSTRAINT go_v2_session_tournament_active_court_policy_fk
      FOREIGN KEY (active_court_policy_revision_id)
      REFERENCES go_v2_court_policy_revisions(id) ON DELETE RESTRICT;
  END IF;
END $$;

DROP TRIGGER IF EXISTS go_v2_immutable_history_guard
  ON go_v2_court_policy_revisions;
CREATE TRIGGER go_v2_immutable_history_guard
BEFORE UPDATE OR DELETE ON go_v2_court_policy_revisions
FOR EACH ROW
EXECUTE FUNCTION go_v2_reject_immutable_mutation();

-- A policy exception is a director/admin-approved, time-bounded expansion of
-- allowed courts. stage_id NULL means every match in the selected tier. The
-- validation trigger prevents unknown courts and cross-session/cross-
-- tournament lineage even though PostgreSQL cannot attach an FK to UUID[].
CREATE TABLE IF NOT EXISTS go_v2_court_policy_exception_revisions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id         UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  schedule_session_id   UUID NOT NULL REFERENCES go_v2_schedule_sessions(id) ON DELETE RESTRICT,
  policy_revision_id    UUID REFERENCES go_v2_court_policy_revisions(id) ON DELETE RESTRICT,
  stage_id              UUID REFERENCES go_v2_stages(id) ON DELETE RESTRICT,
  tier                  TEXT NOT NULL CHECK (tier IN ('hard', 'medium', 'light')),
  decision              TEXT NOT NULL CHECK (decision IN ('approve', 'revoke')),
  allowed_court_ids     UUID[] NOT NULL CHECK (cardinality(allowed_court_ids) BETWEEN 1 AND 6),
  effective_from        TIMESTAMPTZ NOT NULL,
  effective_until       TIMESTAMPTZ NOT NULL,
  supersedes_id         UUID REFERENCES go_v2_court_policy_exception_revisions(id) ON DELETE RESTRICT,
  source_preview_id     UUID NOT NULL REFERENCES go_v2_operation_previews(id) ON DELETE RESTRICT,
  successor_schedule_version_id UUID NOT NULL REFERENCES go_v2_schedule_versions(id) ON DELETE RESTRICT,
  reason_code           TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note           TEXT NOT NULL CHECK (NULLIF(btrim(reason_note), '') IS NOT NULL),
  actor_id              TEXT NOT NULL CHECK (NULLIF(btrim(actor_id), '') IS NOT NULL),
  actor_role            TEXT NOT NULL DEFAULT 'director'
                        CHECK (actor_role IN ('director', 'admin')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_until > effective_from)
);

CREATE INDEX IF NOT EXISTS go_v2_court_policy_exceptions_scope_idx
  ON go_v2_court_policy_exception_revisions(
    schedule_session_id, tournament_id, tier, effective_from, effective_until, created_at DESC
  );
CREATE INDEX IF NOT EXISTS go_v2_court_policy_exceptions_stage_idx
  ON go_v2_court_policy_exception_revisions(stage_id, created_at DESC)
  WHERE stage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS go_v2_court_policy_exceptions_successor_idx
  ON go_v2_court_policy_exception_revisions(successor_schedule_version_id);

CREATE OR REPLACE FUNCTION go_v2_validate_court_policy_exception()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  allowed_count INT;
  distinct_count INT;
BEGIN
  SELECT cardinality(NEW.allowed_court_ids), count(DISTINCT court_id)::int
    INTO allowed_count, distinct_count
    FROM unnest(NEW.allowed_court_ids) AS court_id;

  IF allowed_count IS NULL OR allowed_count <> distinct_count THEN
    RAISE EXCEPTION 'go_v2 court policy exception contains duplicate or empty court ids'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM unnest(NEW.allowed_court_ids) AS allowed(court_id)
      LEFT JOIN go_v2_schedule_session_courts session_court
        ON session_court.session_id = NEW.schedule_session_id
       AND session_court.court_id = allowed.court_id
     WHERE session_court.court_id IS NULL
  ) THEN
    RAISE EXCEPTION 'go_v2 court policy exception court is outside the schedule session'
      USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM go_v2_schedule_session_tournaments linked
     WHERE linked.session_id = NEW.schedule_session_id
       AND linked.tournament_id = NEW.tournament_id
  ) THEN
    RAISE EXCEPTION 'go_v2 court policy exception tournament is outside the schedule session'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.stage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM go_v2_stages stage
     WHERE stage.id = NEW.stage_id
       AND stage.tournament_id = NEW.tournament_id
  ) THEN
    RAISE EXCEPTION 'go_v2 court policy exception stage is outside the tournament'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.policy_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM go_v2_court_policy_revisions policy
     WHERE policy.id = NEW.policy_revision_id
       AND policy.tournament_id = NEW.tournament_id
       AND policy.schedule_session_id = NEW.schedule_session_id
  ) THEN
    RAISE EXCEPTION 'go_v2 court policy exception policy lineage is outside its scope'
      USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM go_v2_operation_previews preview
     WHERE preview.id = NEW.source_preview_id
       AND preview.tournament_id = NEW.tournament_id
  ) THEN
    RAISE EXCEPTION 'go_v2 court policy exception preview is outside the tournament'
      USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM go_v2_schedule_versions version
      JOIN go_v2_schedule_session_tournaments linked
        ON linked.session_id = version.session_id
       AND linked.tournament_id = NEW.tournament_id
     WHERE version.id = NEW.successor_schedule_version_id
       AND version.session_id = NEW.schedule_session_id
  ) THEN
    RAISE EXCEPTION 'go_v2 court policy exception successor schedule is outside its scope'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM go_v2_court_policy_exception_revisions previous
     WHERE previous.id = NEW.supersedes_id
       AND previous.tournament_id = NEW.tournament_id
       AND previous.schedule_session_id = NEW.schedule_session_id
       AND previous.tier = NEW.tier
       AND previous.stage_id IS NOT DISTINCT FROM NEW.stage_id
  ) THEN
    RAISE EXCEPTION 'go_v2 court policy exception supersedes a different scope'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS go_v2_court_policy_exception_validate
  ON go_v2_court_policy_exception_revisions;
CREATE TRIGGER go_v2_court_policy_exception_validate
BEFORE INSERT ON go_v2_court_policy_exception_revisions
FOR EACH ROW
EXECUTE FUNCTION go_v2_validate_court_policy_exception();

DROP TRIGGER IF EXISTS go_v2_immutable_history_guard
  ON go_v2_court_policy_exception_revisions;
CREATE TRIGGER go_v2_immutable_history_guard
BEFORE UPDATE OR DELETE ON go_v2_court_policy_exception_revisions
FOR EACH ROW
EXECUTE FUNCTION go_v2_reject_immutable_mutation();

-- Rule changes use immutable ledgers. The mutable fields on stages/matches are
-- only current projections and point back to the exact committed revision.
CREATE TABLE IF NOT EXISTS go_v2_stage_rule_revisions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id         UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  stage_id              UUID NOT NULL REFERENCES go_v2_stages(id) ON DELETE RESTRICT,
  revision_no           INT NOT NULL CHECK (revision_no >= 1),
  revision_kind         TEXT NOT NULL CHECK (revision_kind IN ('initial', 'future_round', 'compensating')),
  effective_from_round_no INT NOT NULL CHECK (effective_from_round_no >= 1),
  rule_snapshot         JSONB NOT NULL CHECK (jsonb_typeof(rule_snapshot) = 'object'),
  rule_hash             TEXT NOT NULL CHECK (rule_hash ~ '^[0-9a-f]{64}$'),
  supersedes_id         UUID REFERENCES go_v2_stage_rule_revisions(id) ON DELETE RESTRICT,
  source_preview_id     UUID NOT NULL REFERENCES go_v2_operation_previews(id) ON DELETE RESTRICT,
  red_approval_id       UUID REFERENCES go_v2_red_operation_approvals(id) ON DELETE RESTRICT,
  successor_schedule_version_id UUID REFERENCES go_v2_schedule_versions(id) ON DELETE RESTRICT,
  reason_code           TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note           TEXT NOT NULL CHECK (NULLIF(btrim(reason_note), '') IS NOT NULL),
  actor_id              TEXT NOT NULL CHECK (NULLIF(btrim(actor_id), '') IS NOT NULL),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stage_id, revision_no),
  CHECK (
    (revision_no = 1 AND supersedes_id IS NULL) OR
    (revision_no > 1 AND supersedes_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS go_v2_stage_rule_revisions_current_idx
  ON go_v2_stage_rule_revisions(stage_id, revision_no DESC, id DESC);
ALTER TABLE go_v2_stage_rule_revisions
  DROP CONSTRAINT IF EXISTS go_v2_stage_rule_revisions_stage_id_rule_hash_key;
CREATE INDEX IF NOT EXISTS go_v2_stage_rule_revisions_hash_idx
  ON go_v2_stage_rule_revisions(stage_id, rule_hash);

CREATE TABLE IF NOT EXISTS go_v2_match_rule_revisions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id         UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  match_id              UUID NOT NULL REFERENCES go_v2_matches(id) ON DELETE RESTRICT,
  stage_rule_revision_id UUID REFERENCES go_v2_stage_rule_revisions(id) ON DELETE RESTRICT,
  revision_no           INT NOT NULL CHECK (revision_no >= 1),
  revision_kind         TEXT NOT NULL CHECK (revision_kind IN ('stage_projection', 'match_override', 'compensating')),
  rule_snapshot         JSONB NOT NULL CHECK (jsonb_typeof(rule_snapshot) = 'object'),
  rule_hash             TEXT NOT NULL CHECK (rule_hash ~ '^[0-9a-f]{64}$'),
  supersedes_id         UUID REFERENCES go_v2_match_rule_revisions(id) ON DELETE RESTRICT,
  source_preview_id     UUID NOT NULL REFERENCES go_v2_operation_previews(id) ON DELETE RESTRICT,
  successor_schedule_version_id UUID REFERENCES go_v2_schedule_versions(id) ON DELETE RESTRICT,
  reason_code           TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note           TEXT NOT NULL CHECK (NULLIF(btrim(reason_note), '') IS NOT NULL),
  actor_id              TEXT NOT NULL CHECK (NULLIF(btrim(actor_id), '') IS NOT NULL),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, revision_no),
  CHECK (
    (revision_no = 1 AND supersedes_id IS NULL) OR
    (revision_no > 1 AND supersedes_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS go_v2_match_rule_revisions_current_idx
  ON go_v2_match_rule_revisions(match_id, revision_no DESC, id DESC);
ALTER TABLE go_v2_match_rule_revisions
  DROP CONSTRAINT IF EXISTS go_v2_match_rule_revisions_match_id_rule_hash_key;
CREATE INDEX IF NOT EXISTS go_v2_match_rule_revisions_hash_idx
  ON go_v2_match_rule_revisions(match_id, rule_hash);

ALTER TABLE go_v2_stages
  ADD COLUMN IF NOT EXISTS current_rule_revision_id UUID;
ALTER TABLE go_v2_matches
  ADD COLUMN IF NOT EXISTS match_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS current_rule_revision_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'go_v2_stages_current_rule_revision_fk'
      AND conrelid = 'go_v2_stages'::regclass
  ) THEN
    ALTER TABLE go_v2_stages
      ADD CONSTRAINT go_v2_stages_current_rule_revision_fk
      FOREIGN KEY (current_rule_revision_id)
      REFERENCES go_v2_stage_rule_revisions(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'go_v2_matches_current_rule_revision_fk'
      AND conrelid = 'go_v2_matches'::regclass
  ) THEN
    ALTER TABLE go_v2_matches
      ADD CONSTRAINT go_v2_matches_current_rule_revision_fk
      FOREIGN KEY (current_rule_revision_id)
      REFERENCES go_v2_match_rule_revisions(id) ON DELETE RESTRICT;
  END IF;
END $$;

DROP TRIGGER IF EXISTS go_v2_immutable_history_guard
  ON go_v2_stage_rule_revisions;
CREATE TRIGGER go_v2_immutable_history_guard
BEFORE UPDATE OR DELETE ON go_v2_stage_rule_revisions
FOR EACH ROW
EXECUTE FUNCTION go_v2_reject_immutable_mutation();

DROP TRIGGER IF EXISTS go_v2_immutable_history_guard
  ON go_v2_match_rule_revisions;
CREATE TRIGGER go_v2_immutable_history_guard
BEFORE UPDATE OR DELETE ON go_v2_match_rule_revisions
FOR EACH ROW
EXECUTE FUNCTION go_v2_reject_immutable_mutation();

-- Publication has an explicit fail-closed projection plus an immutable
-- transition ledger. Inserting a valid revision atomically advances the
-- projection with aggregate-version CAS; direct projection edits are blocked.
ALTER TABLE go_v2_tournament_state
  ADD COLUMN IF NOT EXISTS publication_state TEXT NOT NULL DEFAULT 'shadow',
  ADD COLUMN IF NOT EXISTS publication_revision_no BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS publication_changed_at TIMESTAMPTZ;
ALTER TABLE go_v2_tournament_state
  DROP CONSTRAINT IF EXISTS go_v2_tournament_state_publication_state_check,
  DROP CONSTRAINT IF EXISTS go_v2_tournament_state_publication_revision_check;
ALTER TABLE go_v2_tournament_state
  ADD CONSTRAINT go_v2_tournament_state_publication_state_check CHECK (
    publication_state IN ('shadow', 'published', 'unpublished')
  ),
  ADD CONSTRAINT go_v2_tournament_state_publication_revision_check
    CHECK (publication_revision_no >= 0);

CREATE TABLE IF NOT EXISTS go_v2_publication_state_revisions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id         UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  revision_no           BIGINT NOT NULL CHECK (revision_no >= 1),
  expected_aggregate_version BIGINT NOT NULL CHECK (expected_aggregate_version >= 0),
  resulting_aggregate_version BIGINT NOT NULL CHECK (
    resulting_aggregate_version = expected_aggregate_version + 1
  ),
  from_state            TEXT NOT NULL CHECK (from_state IN ('shadow', 'published', 'unpublished')),
  to_state              TEXT NOT NULL CHECK (to_state IN ('shadow', 'published', 'unpublished')),
  publish_structure     BOOLEAN NOT NULL DEFAULT false,
  publish_standings     BOOLEAN NOT NULL DEFAULT false,
  publish_brackets      BOOLEAN NOT NULL DEFAULT false,
  publish_live_schedule BOOLEAN NOT NULL DEFAULT false,
  source_preview_id     UUID NOT NULL REFERENCES go_v2_operation_previews(id) ON DELETE RESTRICT,
  successor_schedule_version_id UUID REFERENCES go_v2_schedule_versions(id) ON DELETE RESTRICT,
  red_approval_id       UUID REFERENCES go_v2_red_operation_approvals(id) ON DELETE RESTRICT,
  reason_code           TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note           TEXT NOT NULL CHECK (NULLIF(btrim(reason_note), '') IS NOT NULL),
  actor_id              TEXT NOT NULL CHECK (NULLIF(btrim(actor_id), '') IS NOT NULL),
  command_id            TEXT NOT NULL CHECK (NULLIF(btrim(command_id), '') IS NOT NULL),
  request_hash          TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  input_hash            TEXT NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, revision_no),
  UNIQUE (tournament_id, command_id),
  UNIQUE (source_preview_id),
  UNIQUE (red_approval_id),
  CHECK (from_state <> to_state),
  CHECK (
    (to_state = 'published'
      AND successor_schedule_version_id IS NOT NULL
      AND publish_structure
      AND publish_standings
      AND publish_brackets
      AND publish_live_schedule)
    OR
    (to_state <> 'published'
      AND NOT publish_structure
      AND NOT publish_standings
      AND NOT publish_brackets
      AND NOT publish_live_schedule)
  )
);

CREATE INDEX IF NOT EXISTS go_v2_publication_state_revisions_current_idx
  ON go_v2_publication_state_revisions(tournament_id, revision_no DESC, id DESC);

CREATE OR REPLACE FUNCTION go_v2_guard_publication_projection()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  authorized_revision_id TEXT;
BEGIN
  IF NEW.publication_state IS DISTINCT FROM OLD.publication_state
     OR NEW.publication_revision_no IS DISTINCT FROM OLD.publication_revision_no
     OR NEW.publication_changed_at IS DISTINCT FROM OLD.publication_changed_at THEN
    authorized_revision_id := current_setting('lpv.go_v2_publication_revision_id', true);
    IF authorized_revision_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM go_v2_publication_state_revisions revision
       WHERE revision.id::text = authorized_revision_id
         AND revision.tournament_id = OLD.tournament_id
         AND revision.from_state = OLD.publication_state
         AND revision.to_state = NEW.publication_state
         AND revision.revision_no = NEW.publication_revision_no
         AND revision.expected_aggregate_version = OLD.aggregate_version
         AND revision.resulting_aggregate_version = NEW.aggregate_version
    ) THEN
      RAISE EXCEPTION 'go_v2 publication projection requires an immutable revision'
        USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION go_v2_apply_publication_state_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  current_state go_v2_tournament_state%ROWTYPE;
  preview_risk TEXT;
  requires_red_approval BOOLEAN;
BEGIN
  SELECT state.* INTO current_state
    FROM go_v2_tournament_state state
    JOIN tournaments tournament ON tournament.id = state.tournament_id
   WHERE state.tournament_id = NEW.tournament_id
     AND state.engine_version = 2
     AND tournament.go_engine_version = 2
   FOR UPDATE OF state;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'go_v2 publication requires an engine-version-2 tournament state'
      USING ERRCODE = '23514';
  END IF;

  IF current_state.publication_state <> NEW.from_state
     OR current_state.publication_revision_no + 1 <> NEW.revision_no
     OR current_state.aggregate_version <> NEW.expected_aggregate_version THEN
    RAISE EXCEPTION 'go_v2 publication revision is stale'
      USING ERRCODE = '40001';
  END IF;

  SELECT preview.risk INTO preview_risk
    FROM go_v2_operation_previews preview
   WHERE preview.id = NEW.source_preview_id
     AND preview.tournament_id = NEW.tournament_id
     AND preview.operation_kind = 'publication.preview'
     AND preview.aggregate_version = NEW.expected_aggregate_version
     AND preview.input_hash = NEW.input_hash
     AND preview.consumed_at IS NULL
     AND preview.expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'go_v2 publication preview is stale or outside the tournament'
      USING ERRCODE = '23514';
  END IF;

  requires_red_approval := NEW.to_state = 'published' AND (
    EXISTS (
      SELECT 1 FROM go_v2_entries entry
       WHERE entry.tournament_id = NEW.tournament_id
    )
    OR EXISTS (
      SELECT 1 FROM go_v2_schedule_assignments assignment
       WHERE assignment.schedule_version_id = NEW.successor_schedule_version_id
    )
  );
  IF requires_red_approval AND preview_risk <> 'red' THEN
    RAISE EXCEPTION 'go_v2 publication preview understates disclosure risk'
      USING ERRCODE = '23514';
  END IF;

  IF requires_red_approval THEN
    UPDATE go_v2_red_operation_approvals approval
       SET consumed_at = now()
     WHERE approval.id = NEW.red_approval_id
       AND approval.tournament_id = NEW.tournament_id
       AND approval.preview_id = NEW.source_preview_id
       AND approval.requested_by = NEW.actor_id
       AND approval.approved_by <> NEW.actor_id
       AND approval.reviewed_input_hash = NEW.input_hash
       AND approval.reviewed_aggregate_version = NEW.expected_aggregate_version
       AND approval.consumed_at IS NULL
       AND approval.expires_at > now();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'go_v2 red publication requires a fresh matching second approval'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.red_approval_id IS NOT NULL THEN
    RAISE EXCEPTION 'go_v2 non-red publication must not consume a red approval'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.to_state = 'published' AND NOT EXISTS (
    SELECT 1 FROM tournaments tournament
     WHERE tournament.id = NEW.tournament_id
       AND tournament.go_engine_version = 2
       AND tournament.settings->>'goV2PublicEnabled' = 'true'
  ) THEN
    RAISE EXCEPTION 'go_v2 publication kill switch is disabled'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.successor_schedule_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM go_v2_schedule_versions version
      JOIN go_v2_schedule_session_tournaments linked
        ON linked.session_id = version.session_id
       AND linked.tournament_id = NEW.tournament_id
     WHERE version.id = NEW.successor_schedule_version_id
       AND version.status = 'published'
  ) THEN
    RAISE EXCEPTION 'go_v2 publication successor schedule is not a published tournament schedule'
      USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('lpv.go_v2_publication_revision_id', NEW.id::text, true);
  UPDATE go_v2_tournament_state
     SET publication_state = NEW.to_state,
         publication_revision_no = NEW.revision_no,
         publication_changed_at = NEW.created_at,
         aggregate_version = NEW.resulting_aggregate_version,
         updated_at = now()
   WHERE tournament_id = NEW.tournament_id
     AND aggregate_version = NEW.expected_aggregate_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'go_v2 publication aggregate version changed during commit'
      USING ERRCODE = '40001';
  END IF;

  UPDATE go_v2_operation_previews
     SET consumed_at = now()
   WHERE id = NEW.source_preview_id
     AND consumed_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS go_v2_tournament_state_publication_guard
  ON go_v2_tournament_state;
CREATE TRIGGER go_v2_tournament_state_publication_guard
BEFORE UPDATE OF publication_state, publication_revision_no, publication_changed_at
ON go_v2_tournament_state
FOR EACH ROW
EXECUTE FUNCTION go_v2_guard_publication_projection();

DROP TRIGGER IF EXISTS go_v2_publication_state_apply
  ON go_v2_publication_state_revisions;
CREATE TRIGGER go_v2_publication_state_apply
AFTER INSERT ON go_v2_publication_state_revisions
FOR EACH ROW
EXECUTE FUNCTION go_v2_apply_publication_state_revision();

DROP TRIGGER IF EXISTS go_v2_immutable_history_guard
  ON go_v2_publication_state_revisions;
CREATE TRIGGER go_v2_immutable_history_guard
BEFORE UPDATE OR DELETE ON go_v2_publication_state_revisions
FOR EACH ROW
EXECUTE FUNCTION go_v2_reject_immutable_mutation();

-- The existing external Telegram relay remains the only Bot API sender. The
-- web V2 worker only creates idempotent legacy outbox rows; these functions
-- give the relay an atomic lease/receipt protocol so two polls cannot deliver
-- the same row concurrently.
ALTER TABLE telegram_outbox
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_owner TEXT,
  ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS delivery_receipt JSONB,
  ADD COLUMN IF NOT EXISTS provider_attempt_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_attempt_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_uncertain_at TIMESTAMPTZ;

UPDATE telegram_outbox
SET next_attempt_at = created_at
WHERE next_attempt_at IS NULL;

UPDATE telegram_outbox
SET dead_lettered_at = COALESCE(dead_lettered_at, now()),
    last_error = COALESCE(last_error, 'legacy_max_attempts_exhausted')
WHERE sent_at IS NULL
  AND attempts >= max_attempts;

ALTER TABLE telegram_outbox
  ALTER COLUMN next_attempt_at SET DEFAULT now(),
  ALTER COLUMN next_attempt_at SET NOT NULL,
  DROP CONSTRAINT IF EXISTS telegram_outbox_max_attempts_check;
ALTER TABLE telegram_outbox
  ADD CONSTRAINT telegram_outbox_max_attempts_check
  CHECK (max_attempts BETWEEN 1 AND 100);

DROP INDEX IF EXISTS telegram_outbox_delivery_ready_idx;
CREATE INDEX telegram_outbox_delivery_ready_idx
  ON telegram_outbox(next_attempt_at, created_at, id)
  WHERE sent_at IS NULL
    AND dead_lettered_at IS NULL
    AND provider_attempt_started_at IS NULL;

CREATE OR REPLACE FUNCTION go_v2_claim_telegram_outbox(
  p_worker_id TEXT,
  p_limit INT DEFAULT 25,
  p_lease_seconds INT DEFAULT 900
)
RETURNS TABLE (
  id BIGINT,
  chat_id TEXT,
  kind TEXT,
  message_text TEXT,
  attempts INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  owned_count INT;
BEGIN
  IF NULLIF(btrim(p_worker_id), '') IS NULL THEN
    RAISE EXCEPTION 'worker id is required';
  END IF;
  IF p_limit < 1 OR p_limit > 50 OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'invalid Telegram outbox claim limits';
  END IF;

  -- Telegram Bot API has no idempotency key for sendMessage. Once a provider
  -- attempt was durably started, an expired lease has an unknowable outcome:
  -- retrying it could create a real duplicate. Quarantine instead of retrying.
  UPDATE telegram_outbox queued
     SET dead_lettered_at = COALESCE(queued.dead_lettered_at, now()),
         delivery_uncertain_at = COALESCE(queued.delivery_uncertain_at, now()),
         last_error = COALESCE(queued.last_error, 'relay_lost_after_provider_attempt_started'),
         delivery_receipt = COALESCE(queued.delivery_receipt, '{}'::jsonb)
           || jsonb_build_object(
                'status', 'delivery_unknown',
                'providerAttemptId', queued.provider_attempt_id,
                'quarantinedAt', now(),
                'reason', 'relay_lost_after_provider_attempt_started'
              ),
         claim_owner = NULL,
         claim_expires_at = NULL
   WHERE queued.sent_at IS NULL
     AND queued.dead_lettered_at IS NULL
     AND queued.provider_attempt_started_at IS NOT NULL
     AND (queued.claim_expires_at IS NULL OR queued.claim_expires_at <= now());

  SELECT count(*)::int
    INTO owned_count
    FROM telegram_outbox queued
   WHERE queued.sent_at IS NULL
     AND queued.dead_lettered_at IS NULL
     AND queued.provider_attempt_started_at IS NULL
     AND queued.claim_owner = p_worker_id
     AND queued.claim_expires_at > now();

  WITH candidate AS (
    SELECT queued.id
      FROM telegram_outbox queued
     WHERE queued.sent_at IS NULL
       AND queued.dead_lettered_at IS NULL
       AND queued.provider_attempt_started_at IS NULL
       AND queued.attempts < queued.max_attempts
       AND queued.next_attempt_at <= now()
       AND (queued.claim_expires_at IS NULL OR queued.claim_expires_at <= now())
     ORDER BY queued.next_attempt_at, queued.created_at, queued.id
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(p_limit - owned_count, 0)
  )
  UPDATE telegram_outbox queued
     SET claim_owner = p_worker_id,
         claim_expires_at = now() + make_interval(secs => p_lease_seconds)
    FROM candidate
   WHERE queued.id = candidate.id;

  RETURN QUERY
  SELECT queued.id, queued.chat_id, queued.kind, queued.text,
         queued.attempts
    FROM telegram_outbox queued
   WHERE queued.sent_at IS NULL
     AND queued.dead_lettered_at IS NULL
     AND queued.provider_attempt_started_at IS NULL
     AND queued.claim_owner = p_worker_id
     AND queued.claim_expires_at > now()
   ORDER BY queued.next_attempt_at, queued.created_at, queued.id
   LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION go_v2_begin_telegram_outbox_attempt(
  p_outbox_id BIGINT,
  p_worker_id TEXT,
  p_attempt_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  IF NULLIF(btrim(p_attempt_id), '') IS NULL OR length(p_attempt_id) > 128 THEN
    RAISE EXCEPTION 'provider attempt id is required';
  END IF;

  UPDATE telegram_outbox queued
     SET provider_attempt_id = p_attempt_id,
         provider_attempt_started_at = now(),
         delivery_receipt = jsonb_build_object(
           'status', 'provider_attempt_started',
           'claimOwner', p_worker_id,
           'providerAttemptId', p_attempt_id,
           'startedAt', now()
         )
   WHERE queued.id = p_outbox_id
     AND queued.sent_at IS NULL
     AND queued.dead_lettered_at IS NULL
     AND queued.provider_attempt_started_at IS NULL
     AND queued.claim_owner = p_worker_id
     AND queued.claim_expires_at > now();
  IF FOUND THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM telegram_outbox queued
     WHERE queued.id = p_outbox_id
       AND queued.sent_at IS NULL
       AND queued.dead_lettered_at IS NULL
       AND queued.claim_owner = p_worker_id
       AND queued.provider_attempt_id = p_attempt_id
       AND queued.provider_attempt_started_at IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION go_v2_complete_telegram_outbox(
  p_outbox_id BIGINT,
  p_worker_id TEXT,
  p_delivery_receipt JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE telegram_outbox queued
     SET sent_at = now(),
         last_error = NULL,
         delivery_receipt = COALESCE(p_delivery_receipt, '{}'::jsonb)
           || jsonb_build_object(
                'status', 'sent',
                'claimOwner', p_worker_id,
                'completedAt', now()
              ),
         claim_owner = NULL,
         claim_expires_at = NULL
   WHERE queued.id = p_outbox_id
     AND queued.sent_at IS NULL
     AND queued.dead_lettered_at IS NULL
     AND queued.claim_owner = p_worker_id
     AND queued.provider_attempt_started_at IS NOT NULL;
  IF FOUND THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM telegram_outbox queued
     WHERE queued.id = p_outbox_id
       AND queued.sent_at IS NOT NULL
       AND queued.delivery_receipt->>'status' = 'sent'
       AND queued.delivery_receipt->>'claimOwner' = p_worker_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION go_v2_fail_telegram_outbox(
  p_outbox_id BIGINT,
  p_worker_id TEXT,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE telegram_outbox queued
     SET attempts = queued.attempts + 1,
         last_error = left(COALESCE(NULLIF(p_error, ''), 'telegram_delivery_failed'), 1000),
         next_attempt_at = now() + make_interval(
           secs => LEAST(3600, (30 * power(2, LEAST(queued.attempts, 7)))::int)
         ),
         dead_lettered_at = CASE
           WHEN queued.attempts + 1 >= queued.max_attempts THEN now()
           ELSE NULL
         END,
         delivery_receipt = jsonb_build_object(
            'status', 'failed',
            'claimOwner', p_worker_id,
            'providerAttemptId', queued.provider_attempt_id,
            'providerOutcome', 'rejected',
            'failedAt', now(),
            'error', left(COALESCE(NULLIF(p_error, ''), 'telegram_delivery_failed'), 1000)
          ),
          provider_attempt_id = NULL,
          provider_attempt_started_at = NULL,
          claim_owner = NULL,
          claim_expires_at = NULL
   WHERE queued.id = p_outbox_id
     AND queued.sent_at IS NULL
     AND queued.dead_lettered_at IS NULL
     AND queued.claim_owner = p_worker_id
     AND queued.provider_attempt_started_at IS NOT NULL;
  IF FOUND THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM telegram_outbox queued
     WHERE queued.id = p_outbox_id
       AND queued.sent_at IS NULL
       AND queued.delivery_receipt->>'status' = 'failed'
       AND queued.delivery_receipt->>'claimOwner' = p_worker_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION go_v2_quarantine_unknown_telegram_outbox(
  p_outbox_id BIGINT,
  p_worker_id TEXT,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE telegram_outbox queued
     SET dead_lettered_at = now(),
         delivery_uncertain_at = now(),
         last_error = left(COALESCE(NULLIF(p_error, ''), 'telegram_delivery_outcome_unknown'), 1000),
         delivery_receipt = COALESCE(queued.delivery_receipt, '{}'::jsonb)
           || jsonb_build_object(
                'status', 'delivery_unknown',
                'claimOwner', p_worker_id,
                'providerAttemptId', queued.provider_attempt_id,
                'quarantinedAt', now(),
                'error', left(COALESCE(NULLIF(p_error, ''), 'telegram_delivery_outcome_unknown'), 1000)
              ),
         claim_owner = NULL,
         claim_expires_at = NULL
   WHERE queued.id = p_outbox_id
     AND queued.sent_at IS NULL
     AND queued.dead_lettered_at IS NULL
     AND queued.claim_owner = p_worker_id
     AND queued.provider_attempt_started_at IS NOT NULL;
  IF FOUND THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM telegram_outbox queued
     WHERE queued.id = p_outbox_id
       AND queued.sent_at IS NULL
       AND queued.dead_lettered_at IS NOT NULL
       AND queued.delivery_receipt->>'status' = 'delivery_unknown'
       AND queued.delivery_receipt->>'claimOwner' = p_worker_id
  );
END;
$$;

REVOKE ALL ON FUNCTION go_v2_claim_telegram_outbox(TEXT, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION go_v2_begin_telegram_outbox_attempt(BIGINT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION go_v2_complete_telegram_outbox(BIGINT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION go_v2_fail_telegram_outbox(BIGINT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION go_v2_quarantine_unknown_telegram_outbox(BIGINT, TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    REVOKE UPDATE, DELETE ON TABLE go_v2_operation_previews FROM lpbvolley;
    REVOKE UPDATE, DELETE ON TABLE go_v2_red_operation_approvals FROM lpbvolley;
    GRANT SELECT, INSERT ON TABLE go_v2_operation_previews TO lpbvolley;
    GRANT SELECT, INSERT ON TABLE go_v2_red_operation_approvals TO lpbvolley;
    GRANT UPDATE (consumed_at) ON TABLE go_v2_operation_previews TO lpbvolley;
    GRANT UPDATE (consumed_at) ON TABLE go_v2_red_operation_approvals TO lpbvolley;
    GRANT SELECT, INSERT ON TABLE go_v2_match_pause_resolutions TO lpbvolley;
    GRANT SELECT, INSERT ON TABLE go_v2_disruption_resolutions TO lpbvolley;
    GRANT SELECT, INSERT ON TABLE go_v2_schedule_defer_overrides TO lpbvolley;
    GRANT SELECT, INSERT, UPDATE ON TABLE go_v2_match_court_segments TO lpbvolley;
    GRANT SELECT, INSERT ON TABLE go_v2_tournament_role_revisions TO lpbvolley;
    GRANT SELECT, INSERT ON TABLE go_v2_court_policy_revisions TO lpbvolley;
    GRANT SELECT, INSERT ON TABLE go_v2_court_policy_exception_revisions TO lpbvolley;
    GRANT SELECT, INSERT ON TABLE go_v2_stage_rule_revisions TO lpbvolley;
    GRANT SELECT, INSERT ON TABLE go_v2_match_rule_revisions TO lpbvolley;
    GRANT SELECT, INSERT ON TABLE go_v2_publication_state_revisions TO lpbvolley;
    GRANT EXECUTE ON FUNCTION go_v2_claim_telegram_outbox(TEXT, INT, INT) TO lpbvolley;
    GRANT EXECUTE ON FUNCTION go_v2_begin_telegram_outbox_attempt(BIGINT, TEXT, TEXT) TO lpbvolley;
    GRANT EXECUTE ON FUNCTION go_v2_complete_telegram_outbox(BIGINT, TEXT, JSONB) TO lpbvolley;
    GRANT EXECUTE ON FUNCTION go_v2_fail_telegram_outbox(BIGINT, TEXT, TEXT) TO lpbvolley;
    GRANT EXECUTE ON FUNCTION go_v2_quarantine_unknown_telegram_outbox(BIGINT, TEXT, TEXT) TO lpbvolley;
  END IF;
END $$;

REVOKE UPDATE, DELETE ON TABLE go_v2_operation_previews FROM PUBLIC;
REVOKE UPDATE, DELETE ON TABLE go_v2_red_operation_approvals FROM PUBLIC;

COMMIT;
