-- 103: LPVolley GO V2 live operations, immutable route lineage and reliable delivery.
-- Additive over migration 105; legacy GO/RR/KOTC/Individual Mix remain isolated.

BEGIN;

ALTER TABLE go_v2_match_slot_sources
  ADD COLUMN IF NOT EXISTS route_source_type TEXT,
  ADD COLUMN IF NOT EXISTS route_source_match_id UUID;

-- A database left behind by an interrupted pre-transaction version of this
-- migration may already have the immutable trigger while lineage is still
-- nullable. Remove it inside this transaction before repair/backfill; it is
-- recreated only after every invariant has been validated.
DROP TRIGGER IF EXISTS go_v2_match_slot_route_lineage_immutable
  ON go_v2_match_slot_sources;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM go_v2_match_slot_sources
    WHERE route_source_type IS NULL AND source_type = 'BYE'
  ) THEN
    RAISE EXCEPTION
      'cannot infer immutable route lineage for an existing runtime BYE; restore its MATCH_* source from the audit trail before migration';
  END IF;
END $$;

UPDATE go_v2_match_slot_sources
SET route_source_type = source_type,
    route_source_match_id = source_match_id
WHERE route_source_type IS NULL;

ALTER TABLE go_v2_match_slot_sources
  ALTER COLUMN route_source_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'go_v2_match_slot_route_source_type_check'
      AND conrelid = 'go_v2_match_slot_sources'::regclass
  ) THEN
    ALTER TABLE go_v2_match_slot_sources
      ADD CONSTRAINT go_v2_match_slot_route_source_type_check
      CHECK (route_source_type IN ('ENTRY', 'POOL_RANK', 'MATCH_WINNER', 'MATCH_LOSER', 'BYE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'go_v2_match_slot_route_source_match_fk'
      AND conrelid = 'go_v2_match_slot_sources'::regclass
  ) THEN
    ALTER TABLE go_v2_match_slot_sources
      ADD CONSTRAINT go_v2_match_slot_route_source_match_fk
      FOREIGN KEY (route_source_match_id) REFERENCES go_v2_matches(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'go_v2_match_slot_route_source_shape_check'
      AND conrelid = 'go_v2_match_slot_sources'::regclass
  ) THEN
    ALTER TABLE go_v2_match_slot_sources
      ADD CONSTRAINT go_v2_match_slot_route_source_shape_check
      CHECK (
        (route_source_type IN ('MATCH_WINNER', 'MATCH_LOSER') AND route_source_match_id IS NOT NULL) OR
        (route_source_type NOT IN ('MATCH_WINNER', 'MATCH_LOSER') AND route_source_match_id IS NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'go_v2_match_slot_route_source_self_check'
      AND conrelid = 'go_v2_match_slot_sources'::regclass
  ) THEN
    ALTER TABLE go_v2_match_slot_sources
      ADD CONSTRAINT go_v2_match_slot_route_source_self_check
      CHECK (route_source_match_id IS NULL OR route_source_match_id <> match_id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS go_v2_match_slot_route_source_match_idx
  ON go_v2_match_slot_sources(route_source_match_id)
  WHERE route_source_match_id IS NOT NULL;

CREATE OR REPLACE FUNCTION go_v2_reject_route_lineage_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.route_source_type IS DISTINCT FROM OLD.route_source_type
     OR NEW.route_source_match_id IS DISTINCT FROM OLD.route_source_match_id THEN
    RAISE EXCEPTION 'go_v2 match slot route lineage is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER go_v2_match_slot_route_lineage_immutable
BEFORE UPDATE OF route_source_type, route_source_match_id
ON go_v2_match_slot_sources
FOR EACH ROW
EXECUTE FUNCTION go_v2_reject_route_lineage_update();

INSERT INTO go_v2_mutation_reason_catalog (code, label, requires_note)
VALUES
  ('attendance_confirmed', 'Attendance confirmed', false),
  ('attendance_checked_in', 'Entry checked in', false),
  ('attendance_late_hold', 'Late-arrival hold', true),
  ('attendance_no_show', 'Attendance marked no-show', true),
  ('attendance_reinstated', 'No-show entry reinstated', true),
  ('disruption_recorded', 'Schedule disruption recorded', true),
  ('court_grant_issued', 'Court writer grant issued', false),
  ('court_grant_rotated', 'Court writer grant rotated', true),
  ('court_grant_revoked', 'Court writer grant revoked', true),
  ('red_operation_approved', 'Red-risk operation approved', true),
  ('rating_shadow_projection', 'Rating shadow projection recorded', false),
  ('judge_match_start', 'Judge started match', false),
  ('judge_match_pause', 'Judge paused match', false),
  ('judge_match_resume', 'Judge resumed match', false),
  ('judge_score_entry', 'Judge replaced live score', false),
  ('judge_finish_request', 'Judge requested result confirmation', false)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE go_v2_matches DROP CONSTRAINT IF EXISTS go_v2_matches_play_state_check;
ALTER TABLE go_v2_matches ADD CONSTRAINT go_v2_matches_play_state_check
  CHECK (play_state IN ('pending', 'ready', 'live', 'paused', 'final', 'voided'));

-- Day-of-tournament attendance is deliberately separate from registration.
-- A no-show transition never creates a technical result by itself.
ALTER TABLE go_v2_entries
  ADD COLUMN IF NOT EXISTS attendance_state TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS attendance_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attendance_version BIGINT NOT NULL DEFAULT 0;

ALTER TABLE go_v2_entries
  DROP CONSTRAINT IF EXISTS go_v2_entries_attendance_state_check,
  DROP CONSTRAINT IF EXISTS go_v2_entries_attendance_version_check;
ALTER TABLE go_v2_entries
  ADD CONSTRAINT go_v2_entries_attendance_state_check CHECK (
    attendance_state IN (
      'unknown', 'confirmed', 'checked_in', 'late_hold',
      'no_show', 'withdrawn', 'disqualified'
    )
  ),
  ADD CONSTRAINT go_v2_entries_attendance_version_check CHECK (attendance_version >= 0);

CREATE TABLE IF NOT EXISTS go_v2_attendance_policies (
  tournament_id                    UUID PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  check_in_open_minutes_before     INT NOT NULL DEFAULT 60 CHECK (check_in_open_minutes_before BETWEEN 0 AND 1440),
  check_in_deadline_minutes_before INT NOT NULL DEFAULT 15 CHECK (check_in_deadline_minutes_before BETWEEN 0 AND 1440),
  grace_period_minutes             INT NOT NULL DEFAULT 5 CHECK (grace_period_minutes BETWEEN 0 AND 180),
  technical_result_requires_director BOOLEAN NOT NULL DEFAULT true CHECK (technical_result_requires_director),
  version                          BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_by                       TEXT NOT NULL DEFAULT 'system',
  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS go_v2_attendance_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id     UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  entry_id          UUID NOT NULL REFERENCES go_v2_entries(id) ON DELETE RESTRICT,
  aggregate_version BIGINT NOT NULL CHECK (aggregate_version >= 1),
  attendance_version BIGINT NOT NULL CHECK (attendance_version >= 1),
  from_state        TEXT NOT NULL,
  to_state          TEXT NOT NULL,
  effective_at      TIMESTAMPTZ NOT NULL,
  reason_code       TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note       TEXT,
  actor_id          TEXT NOT NULL,
  command_id        TEXT NOT NULL,
  device_id         TEXT NOT NULL,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, command_id),
  UNIQUE (entry_id, attendance_version)
);

CREATE INDEX IF NOT EXISTS go_v2_attendance_events_entry_idx
  ON go_v2_attendance_events(entry_id, attendance_version DESC);

-- Physical venue/court identity and planned/predicted/actual timing are kept
-- independently so a live replan never overwrites the published baseline.
ALTER TABLE go_v2_courts
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES play_venues(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS go_v2_courts_venue_no_uidx
  ON go_v2_courts(venue_id, court_no) WHERE venue_id IS NOT NULL;

ALTER TABLE go_v2_schedule_sessions
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES play_venues(id) ON DELETE RESTRICT;

ALTER TABLE go_v2_schedule_assignments
  ADD COLUMN IF NOT EXISTS predicted_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS predicted_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_end TIMESTAMPTZ;

ALTER TABLE go_v2_schedule_assignments
  DROP CONSTRAINT IF EXISTS go_v2_schedule_assignments_predicted_window_check,
  DROP CONSTRAINT IF EXISTS go_v2_schedule_assignments_actual_window_check;
ALTER TABLE go_v2_schedule_assignments
  ADD CONSTRAINT go_v2_schedule_assignments_predicted_window_check CHECK (
    predicted_end IS NULL OR (predicted_start IS NOT NULL AND predicted_end > predicted_start)
  ),
  ADD CONSTRAINT go_v2_schedule_assignments_actual_window_check CHECK (
    actual_end IS NULL OR (actual_start IS NOT NULL AND actual_end >= actual_start)
  );

CREATE TABLE IF NOT EXISTS go_v2_schedule_disruptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id       UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  schedule_session_id UUID REFERENCES go_v2_schedule_sessions(id) ON DELETE RESTRICT,
  court_id            UUID REFERENCES go_v2_courts(id) ON DELETE RESTRICT,
  disruption_kind     TEXT NOT NULL CHECK (disruption_kind IN (
    'rain_hold', 'lightning_hold', 'court_damage', 'medical_delay',
    'security_pause', 'court_close', 'court_reopen', 'global_pause'
  )),
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'cancelled')),
  starts_at            TIMESTAMPTZ NOT NULL,
  expected_end_at      TIMESTAMPTZ,
  resolved_at          TIMESTAMPTZ,
  reason_code          TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note          TEXT,
  created_by           TEXT NOT NULL,
  resolved_by          TEXT,
  impact_snapshot      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expected_end_at IS NULL OR expected_end_at > starts_at),
  CHECK ((disruption_kind IN ('court_close', 'court_reopen', 'court_damage')) = (court_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS go_v2_schedule_disruptions_active_idx
  ON go_v2_schedule_disruptions(tournament_id, starts_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS go_v2_disruption_matches (
  disruption_id UUID NOT NULL REFERENCES go_v2_schedule_disruptions(id) ON DELETE RESTRICT,
  match_id      UUID NOT NULL REFERENCES go_v2_matches(id) ON DELETE RESTRICT,
  prior_schedule_assignment_id UUID REFERENCES go_v2_schedule_assignments(id) ON DELETE RESTRICT,
  action        TEXT NOT NULL CHECK (action IN ('pause_live', 'replan', 'retain', 'review_incomplete')),
  risk          TEXT NOT NULL CHECK (risk IN ('green', 'amber', 'red')),
  PRIMARY KEY (disruption_id, match_id)
);

-- Single-writer court grants. Only hashes and a short diagnostic prefix are
-- stored; a rotated/revoked token can never become active again.
CREATE TABLE IF NOT EXISTS go_v2_court_grants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  schedule_session_id UUID NOT NULL REFERENCES go_v2_schedule_sessions(id) ON DELETE RESTRICT,
  court_id         UUID NOT NULL REFERENCES go_v2_courts(id) ON DELETE RESTRICT,
  device_id        TEXT NOT NULL,
  actor_id         TEXT NOT NULL,
  token_hash       TEXT NOT NULL UNIQUE,
  token_prefix     TEXT NOT NULL,
  issued_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  last_used_at     TIMESTAMPTZ,
  rotated_from_id UUID REFERENCES go_v2_court_grants(id) ON DELETE RESTRICT,
  revoked_at      TIMESTAMPTZ,
  revoked_by      TEXT,
  revoke_reason   TEXT,
  CHECK (expires_at > issued_at),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS go_v2_court_grants_single_writer_uidx
  ON go_v2_court_grants(schedule_session_id, court_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS go_v2_court_grants_lookup_idx
  ON go_v2_court_grants(token_hash) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS go_v2_court_grant_rate_limits (
  grant_id       UUID NOT NULL REFERENCES go_v2_court_grants(id) ON DELETE CASCADE,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count  INT NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (grant_id, window_started_at)
);

CREATE TABLE IF NOT EXISTS go_v2_live_match_state (
  match_id          UUID PRIMARY KEY REFERENCES go_v2_matches(id) ON DELETE RESTRICT,
  command_version   BIGINT NOT NULL DEFAULT 0 CHECK (command_version >= 0),
  live_score        JSONB NOT NULL DEFAULT '{}'::jsonb,
  finish_requested  BOOLEAN NOT NULL DEFAULT false,
  active_device_id  TEXT,
  started_at        TIMESTAMPTZ,
  paused_at         TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS go_v2_judge_command_journal (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id     UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  match_id           UUID NOT NULL REFERENCES go_v2_matches(id) ON DELETE RESTRICT,
  court_id           UUID NOT NULL REFERENCES go_v2_courts(id) ON DELETE RESTRICT,
  grant_id           UUID NOT NULL REFERENCES go_v2_court_grants(id) ON DELETE RESTRICT,
  command_id         TEXT NOT NULL,
  request_hash       TEXT NOT NULL,
  expected_version  BIGINT NOT NULL CHECK (expected_version >= 0),
  resulting_version BIGINT NOT NULL CHECK (resulting_version >= 0),
  device_id          TEXT NOT NULL,
  command_kind       TEXT NOT NULL CHECK (command_kind IN (
    'match.start', 'match.pause', 'match.resume', 'score.replace', 'match.finish.request'
  )),
  reason_code        TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  command_payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, command_id)
);

CREATE INDEX IF NOT EXISTS go_v2_judge_command_match_idx
  ON go_v2_judge_command_journal(match_id, resulting_version DESC);

-- Red operations require an approval from a different privileged actor.
CREATE TABLE IF NOT EXISTS go_v2_red_operation_approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  preview_id    UUID NOT NULL REFERENCES go_v2_operation_previews(id) ON DELETE RESTRICT,
  requested_by  TEXT NOT NULL,
  approved_by   TEXT NOT NULL,
  approved_role TEXT NOT NULL CHECK (approved_role IN ('tournament_director', 'admin')),
  command_id    TEXT NOT NULL,
  request_hash  TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  reviewed_input_hash TEXT NOT NULL CHECK (reviewed_input_hash ~ '^[0-9a-f]{64}$'),
  reviewed_aggregate_version BIGINT NOT NULL CHECK (reviewed_aggregate_version >= 0),
  device_id     TEXT NOT NULL,
  reason_code   TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note   TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (preview_id),
  UNIQUE (tournament_id, command_id),
  CHECK (requested_by <> approved_by),
  CHECK (expires_at > created_at)
);

-- Rating projection is shadow-only by default. The unique sports snapshot key
-- prevents duplicate application if a later rollout enables the projector.
ALTER TABLE go_v2_tournament_state
  ADD COLUMN IF NOT EXISTS rating_projection_mode TEXT NOT NULL DEFAULT 'shadow';
ALTER TABLE go_v2_tournament_state
  DROP CONSTRAINT IF EXISTS go_v2_tournament_state_rating_projection_mode_check;
ALTER TABLE go_v2_tournament_state
  ADD CONSTRAINT go_v2_tournament_state_rating_projection_mode_check
  CHECK (rating_projection_mode IN ('shadow', 'apply_enabled'));

-- Authoritative finished-tournament classification. The snapshot hash includes
-- the active result-revision lineage, so a corrected score/result always
-- creates a new append-only snapshot even when the resulting places are equal.
-- SE/DE and the separately materialized classification strategy append
-- immutable snapshots through the same final-placement ledger.
CREATE TABLE IF NOT EXISTS go_v2_final_placement_snapshots (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id              UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  schema_version             INT NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  aggregate_version          BIGINT NOT NULL CHECK (aggregate_version >= 0),
  source_kind                TEXT NOT NULL DEFAULT 'bracket_v1'
                             CHECK (source_kind IN ('bracket_v1', 'classification_v1')),
  source_results_hash        TEXT NOT NULL CHECK (source_results_hash ~ '^[0-9a-f]{64}$'),
  standings_hash             TEXT NOT NULL CHECK (standings_hash ~ '^[0-9a-f]{64}$'),
  source_stage_ids           UUID[] NOT NULL DEFAULT '{}'::uuid[],
  source_result_revision_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  source_revision_lineage    JSONB NOT NULL DEFAULT '[]'::jsonb,
  rating_policy_snapshot     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by                 TEXT NOT NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, source_results_hash)
);

CREATE INDEX IF NOT EXISTS go_v2_final_placement_snapshots_current_idx
  ON go_v2_final_placement_snapshots(tournament_id, aggregate_version DESC, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS go_v2_final_placement_snapshots_standings_idx
  ON go_v2_final_placement_snapshots(tournament_id, standings_hash);
CREATE INDEX IF NOT EXISTS go_v2_final_placement_snapshots_revision_ids_gin
  ON go_v2_final_placement_snapshots USING GIN(source_result_revision_ids);

CREATE TABLE IF NOT EXISTS go_v2_final_placement_rows (
  snapshot_id                    UUID NOT NULL REFERENCES go_v2_final_placement_snapshots(id) ON DELETE RESTRICT,
  entry_id                       UUID NOT NULL REFERENCES go_v2_entries(id) ON DELETE RESTRICT,
  source_stage_id                UUID NOT NULL REFERENCES go_v2_stages(id) ON DELETE RESTRICT,
  tier                           TEXT NOT NULL CHECK (tier IN ('hard', 'medium', 'light')),
  tier_place                     INT NOT NULL CHECK (tier_place >= 1),
  overall_place                  INT NOT NULL CHECK (overall_place >= 1),
  sporting_tier_place_from       INT NOT NULL CHECK (sporting_tier_place_from >= 1),
  sporting_tier_place_to         INT NOT NULL CHECK (sporting_tier_place_to >= sporting_tier_place_from),
  sporting_overall_place_from    INT NOT NULL CHECK (sporting_overall_place_from >= 1),
  sporting_overall_place_to      INT NOT NULL CHECK (sporting_overall_place_to >= sporting_overall_place_from),
  initial_seed                   INT NOT NULL CHECK (initial_seed >= 1),
  games_played                   INT NOT NULL CHECK (games_played >= 0),
  losses                         INT NOT NULL CHECK (losses >= 0),
  eliminated_by_match_id         UUID REFERENCES go_v2_matches(id) ON DELETE RESTRICT,
  basis                          TEXT NOT NULL CHECK (basis IN (
                                   'championship_match', 'placement_match',
                                   'elimination_round', 'initial_seed_tiebreak'
                                 )),
  lineup_snapshot                JSONB NOT NULL,
  PRIMARY KEY (snapshot_id, entry_id),
  UNIQUE (snapshot_id, overall_place),
  UNIQUE (snapshot_id, tier, tier_place),
  CHECK (sporting_tier_place_from <= tier_place AND tier_place <= sporting_tier_place_to),
  CHECK (sporting_overall_place_from <= overall_place AND overall_place <= sporting_overall_place_to)
);

CREATE INDEX IF NOT EXISTS go_v2_final_placement_rows_entry_idx
  ON go_v2_final_placement_rows(entry_id, snapshot_id);
CREATE INDEX IF NOT EXISTS go_v2_final_placement_rows_tier_idx
  ON go_v2_final_placement_rows(snapshot_id, tier, tier_place);

CREATE TABLE IF NOT EXISTS go_v2_rating_projection_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  standings_hash  TEXT NOT NULL CHECK (standings_hash ~ '^[0-9a-f]{64}$'),
  projection_mode TEXT NOT NULL DEFAULT 'shadow' CHECK (projection_mode IN ('shadow', 'applied')),
  status          TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'validated', 'applied', 'rejected')),
  source_snapshot_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  projection_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at      TIMESTAMPTZ,
  UNIQUE (tournament_id, standings_hash),
  CHECK ((projection_mode = 'applied') = (applied_at IS NOT NULL))
);

ALTER TABLE go_v2_rating_projection_runs
  ADD COLUMN IF NOT EXISTS source_final_placement_snapshot_id UUID
  REFERENCES go_v2_final_placement_snapshots(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS go_v2_rating_projection_runs_final_snapshot_idx
  ON go_v2_rating_projection_runs(source_final_placement_snapshot_id);

CREATE TABLE IF NOT EXISTS go_v2_rating_projection_rows (
  projection_run_id UUID NOT NULL REFERENCES go_v2_rating_projection_runs(id) ON DELETE RESTRICT,
  player_id         UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  before_value      INT,
  delta_value       INT NOT NULL,
  after_value       INT,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (projection_run_id, player_id),
  CHECK (before_value IS NULL OR after_value = before_value + delta_value)
);

-- Enrich the original receipt with the complete authenticated command context.
ALTER TABLE go_v2_command_receipts
  ADD COLUMN IF NOT EXISTS command_id TEXT,
  ADD COLUMN IF NOT EXISTS client_request_hash TEXT,
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS actor_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS court_grant_id UUID REFERENCES go_v2_court_grants(id) ON DELETE RESTRICT;
UPDATE go_v2_command_receipts
SET command_id = idempotency_key,
    device_id = COALESCE(device_id, 'legacy-admin-web'),
    actor_snapshot = CASE
      WHEN actor_snapshot = '{}'::jsonb THEN jsonb_build_object('id', actor_id, 'role', 'operator')
      ELSE actor_snapshot
    END
WHERE command_id IS NULL OR device_id IS NULL OR actor_snapshot = '{}'::jsonb;
ALTER TABLE go_v2_command_receipts
  ALTER COLUMN command_id SET NOT NULL,
  ALTER COLUMN device_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS go_v2_command_receipts_command_uidx
  ON go_v2_command_receipts(tournament_id, command_id);

-- Reliable outbox delivery: short leases, exponential backoff, dead-lettering
-- and a durable provider receipt. available_at remains as a compatibility alias.
ALTER TABLE go_v2_notification_outbox
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_receipt JSONB,
  ADD COLUMN IF NOT EXISTS legacy_outbox_id BIGINT REFERENCES telegram_outbox(id) ON DELETE SET NULL;
UPDATE go_v2_notification_outbox
SET next_attempt_at = available_at
WHERE next_attempt_at IS NULL;
ALTER TABLE go_v2_notification_outbox
  ALTER COLUMN next_attempt_at SET NOT NULL,
  DROP CONSTRAINT IF EXISTS go_v2_notification_outbox_max_attempts_check;
ALTER TABLE go_v2_notification_outbox
  ADD CONSTRAINT go_v2_notification_outbox_max_attempts_check CHECK (max_attempts BETWEEN 1 AND 100);
DROP INDEX IF EXISTS go_v2_notification_outbox_pending_idx;
CREATE INDEX go_v2_notification_outbox_pending_idx
  ON go_v2_notification_outbox(next_attempt_at, created_at)
  WHERE sent_at IS NULL AND dead_lettered_at IS NULL;

-- One V2 domain event can fan out to multiple private Telegram recipients.
-- Keep every hand-off as durable lineage instead of overloading the historical
-- singular legacy_outbox_id compatibility column.
CREATE TABLE IF NOT EXISTS go_v2_notification_delivery_bridges (
  notification_id       UUID NOT NULL REFERENCES go_v2_notification_outbox(id) ON DELETE CASCADE,
  recipient_key         TEXT NOT NULL CHECK (recipient_key ~ '^[1-9][0-9]{0,19}$'),
  telegram_outbox_id    BIGINT NOT NULL REFERENCES telegram_outbox(id) ON DELETE RESTRICT,
  recipient_dedup_key   TEXT NOT NULL UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, recipient_key)
);
CREATE INDEX IF NOT EXISTS go_v2_notification_delivery_bridges_legacy_idx
  ON go_v2_notification_delivery_bridges(telegram_outbox_id);

CREATE OR REPLACE FUNCTION go_v2_claim_notification_outbox(
  p_worker_id TEXT,
  p_limit INT DEFAULT 50,
  p_lease_seconds INT DEFAULT 60
)
RETURNS SETOF go_v2_notification_outbox
LANGUAGE plpgsql
AS $$
BEGIN
  IF NULLIF(btrim(p_worker_id), '') IS NULL THEN
    RAISE EXCEPTION 'worker id is required';
  END IF;
  IF p_limit < 1 OR p_limit > 500 OR p_lease_seconds < 5 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'invalid outbox claim limits';
  END IF;
  RETURN QUERY
  WITH candidate AS (
    SELECT id
    FROM go_v2_notification_outbox
    WHERE sent_at IS NULL
      AND dead_lettered_at IS NULL
      AND next_attempt_at <= now()
      AND (lease_expires_at IS NULL OR lease_expires_at <= now())
    ORDER BY next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE go_v2_notification_outbox outbox
  SET lease_owner = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds)
  FROM candidate
  WHERE outbox.id = candidate.id
  RETURNING outbox.*;
END;
$$;

-- The application resolves current roster player ids to real users first.
-- recipient_key on the source row is a scope such as tournament:<uuid> and is
-- intentionally never accepted as a Telegram chat id by this function.
DROP FUNCTION IF EXISTS go_v2_bridge_telegram_notification(UUID);
CREATE OR REPLACE FUNCTION go_v2_bridge_telegram_notification(
  p_outbox_id UUID,
  p_worker_id TEXT,
  p_private_chat_id TEXT,
  p_rendered_text TEXT,
  p_recipient_dedup_key TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  item go_v2_notification_outbox%ROWTYPE;
  bridged_id BIGINT;
BEGIN
  SELECT * INTO item
  FROM go_v2_notification_outbox
  WHERE id = p_outbox_id
  FOR UPDATE;
  IF NOT FOUND OR item.channel <> 'telegram' OR item.dead_lettered_at IS NOT NULL
     OR item.sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'telegram notification is unavailable for bridging';
  END IF;
  IF NULLIF(btrim(p_worker_id), '') IS NULL
     OR item.lease_owner IS DISTINCT FROM p_worker_id
     OR item.lease_expires_at IS NULL
     OR item.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'telegram notification lease is not owned by this worker';
  END IF;
  IF COALESCE(p_private_chat_id, '') !~ '^[1-9][0-9]{0,19}$' THEN
    RAISE EXCEPTION 'a valid private Telegram chat id is required';
  END IF;
  IF NULLIF(btrim(p_rendered_text), '') IS NULL OR NULLIF(btrim(p_recipient_dedup_key), '') IS NULL THEN
    RAISE EXCEPTION 'rendered text and recipient dedup key are required';
  END IF;

  SELECT bridge.telegram_outbox_id INTO bridged_id
  FROM go_v2_notification_delivery_bridges bridge
  WHERE bridge.notification_id = p_outbox_id
    AND bridge.recipient_key = p_private_chat_id;
  IF FOUND THEN
    RETURN bridged_id;
  END IF;

  INSERT INTO telegram_outbox(chat_id, kind, text, dedup_key)
  VALUES (p_private_chat_id, item.event_type, p_rendered_text, p_recipient_dedup_key)
  ON CONFLICT (dedup_key) DO UPDATE SET dedup_key = EXCLUDED.dedup_key
  RETURNING id INTO bridged_id;

  INSERT INTO go_v2_notification_delivery_bridges(
    notification_id, recipient_key, telegram_outbox_id, recipient_dedup_key
  ) VALUES (p_outbox_id, p_private_chat_id, bridged_id, p_recipient_dedup_key)
  ON CONFLICT (notification_id, recipient_key) DO UPDATE SET
    telegram_outbox_id = EXCLUDED.telegram_outbox_id,
    recipient_dedup_key = EXCLUDED.recipient_dedup_key
  RETURNING telegram_outbox_id INTO bridged_id;

  UPDATE go_v2_notification_outbox
  SET legacy_outbox_id = COALESCE(legacy_outbox_id, bridged_id)
  WHERE id = p_outbox_id;
  RETURN bridged_id;
END;
$$;

CREATE OR REPLACE FUNCTION go_v2_complete_notification_outbox(
  p_outbox_id UUID,
  p_worker_id TEXT,
  p_delivery_receipt JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE go_v2_notification_outbox
  SET sent_at = now(),
      delivery_receipt = COALESCE(p_delivery_receipt, '{}'::jsonb),
      lease_owner = NULL,
      lease_expires_at = NULL,
      last_error = NULL
  WHERE id = p_outbox_id
    AND lease_owner = p_worker_id
    AND lease_expires_at > now()
    AND sent_at IS NULL
    AND dead_lettered_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION go_v2_fail_notification_outbox(
  p_outbox_id UUID,
  p_worker_id TEXT,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE go_v2_notification_outbox
  SET attempts = attempts + 1,
      next_attempt_at = now() + make_interval(
        secs => LEAST(3600, (5 * power(2, LEAST(attempts, 9)))::int)
      ),
      dead_lettered_at = CASE WHEN attempts + 1 >= max_attempts THEN now() ELSE NULL END,
      last_error = left(COALESCE(p_error, 'delivery failed'), 2000),
      lease_owner = NULL,
      lease_expires_at = NULL
  WHERE id = p_outbox_id
    AND lease_owner = p_worker_id
    AND lease_expires_at > now()
    AND sent_at IS NULL
    AND dead_lettered_at IS NULL;
  RETURN FOUND;
END;
$$;

-- Result history, lineups, command journals and audit are append-only. Undo is
-- represented by compensating rows and never by rewriting history.
CREATE OR REPLACE FUNCTION go_v2_reject_immutable_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'go_v2 immutable history is append-only'
    USING ERRCODE = '55000';
END;
$$;

DO $$
DECLARE
  immutable_table TEXT;
BEGIN
  FOREACH immutable_table IN ARRAY ARRAY[
    'go_v2_rating_snapshots',
    'go_v2_rating_snapshot_entries',
    'go_v2_stage_lock_snapshots',
    'go_v2_match_result_revisions',
    'go_v2_match_standing_contributions',
    'go_v2_match_lineup_snapshots',
    'go_v2_standing_snapshots',
    'go_v2_standing_snapshot_rows',
    'go_v2_qualification_snapshots',
    'go_v2_qualification_snapshot_rows',
    'go_v2_final_placement_snapshots',
    'go_v2_final_placement_rows',
    'go_v2_rating_projection_runs',
    'go_v2_rating_projection_rows',
    'go_v2_cascade_mutation_batches',
    'go_v2_cascade_mutation_matches',
    'go_v2_command_receipts',
    'go_v2_audit_events',
    'go_v2_attendance_events',
    'go_v2_judge_command_journal'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS go_v2_immutable_history_guard ON %I', immutable_table);
    EXECUTE format(
      'CREATE TRIGGER go_v2_immutable_history_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION go_v2_reject_immutable_mutation()',
      immutable_table
    );
  END LOOP;
END $$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    FOREACH table_name IN ARRAY ARRAY[
      'go_v2_attendance_policies', 'go_v2_attendance_events',
      'go_v2_schedule_disruptions', 'go_v2_disruption_matches',
      'go_v2_court_grants', 'go_v2_court_grant_rate_limits',
      'go_v2_live_match_state', 'go_v2_judge_command_journal',
      'go_v2_red_operation_approvals'
      , 'go_v2_rating_projection_runs', 'go_v2_rating_projection_rows',
      'go_v2_notification_delivery_bridges'
    ] LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO lpbvolley', table_name);
    END LOOP;
    GRANT EXECUTE ON FUNCTION go_v2_claim_notification_outbox(TEXT, INT, INT) TO lpbvolley;
    GRANT EXECUTE ON FUNCTION go_v2_bridge_telegram_notification(UUID, TEXT, TEXT, TEXT, TEXT) TO lpbvolley;
    GRANT EXECUTE ON FUNCTION go_v2_complete_notification_outbox(UUID, TEXT, JSONB) TO lpbvolley;
    GRANT EXECUTE ON FUNCTION go_v2_fail_notification_outbox(UUID, TEXT, TEXT) TO lpbvolley;
    GRANT SELECT, INSERT ON TABLE go_v2_final_placement_snapshots TO lpbvolley;
    GRANT SELECT, INSERT ON TABLE go_v2_final_placement_rows TO lpbvolley;
  END IF;
END $$;

COMMIT;
