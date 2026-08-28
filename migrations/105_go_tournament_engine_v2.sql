-- 102: LPVolley tournament engine V2.
-- Additive and intentionally isolated from the legacy go_* workflow.

BEGIN;

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS go_engine_version SMALLINT NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tournaments_go_engine_version_check'
      AND conrelid = 'tournaments'::regclass
  ) THEN
    ALTER TABLE tournaments
      ADD CONSTRAINT tournaments_go_engine_version_check
      CHECK (go_engine_version IN (1, 2));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS go_v2_mutation_reason_catalog (
  code          TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  requires_note BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (code ~ '^[a-z][a-z0-9_]{1,63}$')
);

INSERT INTO go_v2_mutation_reason_catalog (code, label, requires_note)
VALUES
  ('registration_lock', 'Registration locked', false),
  ('draw_generated', 'Draw generated', false),
  ('draw_adjusted', 'Draw adjusted by operator', true),
  ('stage_materialized', 'Stage materialized', false),
  ('bracket_generated', 'Bracket generated', false),
  ('bracket_locked', 'Bracket locked', false),
  ('schedule_generated', 'Schedule generated', false),
  ('schedule_replanned', 'Schedule replanned', true),
  ('referee_typo', 'Referee input correction', true),
  ('protest_accepted', 'Protest accepted', true),
  ('injury_retirement', 'Injury retirement', true),
  ('disqualification', 'Disqualification', true),
  ('no_show', 'No show', true),
  ('late_roster_swap', 'Late roster replacement', true),
  ('admin_override', 'Administrative override', true),
  ('incident_recorded', 'Incident recorded', true),
  ('cascade_replay', 'Cascade void and replay', true),
  ('retain_progression_override', 'Progression retained by override', true),
  ('undo_mutation', 'Compensating undo mutation', true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS go_v2_tournament_state (
  tournament_id             UUID PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  engine_version            SMALLINT NOT NULL DEFAULT 2 CHECK (engine_version = 2),
  aggregate_version         BIGINT NOT NULL DEFAULT 0 CHECK (aggregate_version >= 0),
  lifecycle_state           TEXT NOT NULL DEFAULT 'draft'
                            CHECK (lifecycle_state IN (
                              'draft', 'registration_locked', 'draw_preview', 'draw_locked',
                              'stages_ready', 'bracket_preview', 'bracket_locked',
                              'schedule_draft', 'schedule_published', 'live', 'finished', 'cancelled'
                            )),
  active_stage_snapshot_id  UUID,
  active_schedule_version_id UUID,
  metadata                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS go_v2_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id         UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  entry_no              INT NOT NULL CHECK (entry_no >= 1),
  display_name          TEXT NOT NULL,
  registration_state    TEXT NOT NULL DEFAULT 'confirmed'
                        CHECK (registration_state IN ('pending', 'confirmed', 'waitlist', 'withdrawn', 'disqualified')),
  rating_snapshot_value INT NOT NULL DEFAULT 0,
  initial_seed          INT CHECK (initial_seed IS NULL OR initial_seed >= 1),
  confirmed_at          TIMESTAMPTZ,
  current_roster_revision_id UUID,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, entry_no)
);

CREATE INDEX IF NOT EXISTS go_v2_entries_tournament_state_idx
  ON go_v2_entries(tournament_id, registration_state, entry_no);

CREATE TABLE IF NOT EXISTS go_v2_roster_revisions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id           UUID NOT NULL REFERENCES go_v2_entries(id) ON DELETE CASCADE,
  revision_no        INT NOT NULL CHECK (revision_no >= 1),
  effective_from     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason_code        TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note        TEXT,
  author_id          TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, revision_no)
);

CREATE TABLE IF NOT EXISTS go_v2_roster_revision_members (
  roster_revision_id UUID NOT NULL REFERENCES go_v2_roster_revisions(id) ON DELETE CASCADE,
  member_order       SMALLINT NOT NULL CHECK (member_order BETWEEN 1 AND 4),
  player_id          UUID REFERENCES players(id) ON DELETE RESTRICT,
  display_name       TEXT,
  rating_value       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (roster_revision_id, member_order),
  CHECK (player_id IS NOT NULL OR NULLIF(btrim(display_name), '') IS NOT NULL)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'go_v2_entries_current_roster_revision_fk'
      AND conrelid = 'go_v2_entries'::regclass
  ) THEN
    ALTER TABLE go_v2_entries
      ADD CONSTRAINT go_v2_entries_current_roster_revision_fk
      FOREIGN KEY (current_roster_revision_id)
      REFERENCES go_v2_roster_revisions(id) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS go_v2_rating_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  schema_version INT NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  source_kind    TEXT NOT NULL DEFAULT 'lpvolley_rating',
  captured_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_by    TEXT NOT NULL,
  input_hash     TEXT NOT NULL,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tournament_id, input_hash)
);

CREATE TABLE IF NOT EXISTS go_v2_rating_snapshot_entries (
  snapshot_id UUID NOT NULL REFERENCES go_v2_rating_snapshots(id) ON DELETE CASCADE,
  entry_id    UUID NOT NULL REFERENCES go_v2_entries(id) ON DELETE CASCADE,
  rating_sum  INT NOT NULL,
  seed        INT NOT NULL CHECK (seed >= 1),
  tie_break   JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (snapshot_id, entry_id),
  UNIQUE (snapshot_id, seed)
);

CREATE TABLE IF NOT EXISTS go_v2_stage_lock_snapshots (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id          UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  schema_version         INT NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  seed_snapshot          JSONB NOT NULL DEFAULT '[]'::jsonb,
  ranking_rules_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  format_snapshot        JSONB NOT NULL DEFAULT '{}'::jsonb,
  policy_snapshot        JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_hash          TEXT NOT NULL,
  locked_by              TEXT NOT NULL,
  locked_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, snapshot_hash)
);

CREATE TABLE IF NOT EXISTS go_v2_stages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id      UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  stage_key          TEXT NOT NULL,
  stage_order        INT NOT NULL CHECK (stage_order >= 1),
  stage_type         TEXT NOT NULL CHECK (stage_type IN (
                       'round_robin_pool', 'modified_pool_4', 'tier_split',
                       'single_elimination', 'double_elimination', 'placement_match'
                     )),
  tier               TEXT CHECK (tier IS NULL OR tier IN ('hard', 'medium', 'light')),
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'preview', 'locked', 'live', 'finished', 'voided')),
  lock_snapshot_id   UUID REFERENCES go_v2_stage_lock_snapshots(id) ON DELETE RESTRICT,
  match_rule         JSONB NOT NULL DEFAULT '{}'::jsonb,
  configuration      JSONB NOT NULL DEFAULT '{}'::jsonb,
  version            BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, stage_key),
  UNIQUE (tournament_id, stage_order, tier)
);

CREATE INDEX IF NOT EXISTS go_v2_stages_tournament_order_idx
  ON go_v2_stages(tournament_id, stage_order);

CREATE TABLE IF NOT EXISTS go_v2_stage_edges (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id    UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  from_stage_id    UUID NOT NULL REFERENCES go_v2_stages(id) ON DELETE CASCADE,
  to_stage_id      UUID NOT NULL REFERENCES go_v2_stages(id) ON DELETE CASCADE,
  routing_kind     TEXT NOT NULL CHECK (routing_kind IN ('all', 'pool_rank', 'tier_split', 'winner', 'loser', 'custom')),
  routing_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_stage_id, to_stage_id, routing_kind),
  CHECK (from_stage_id <> to_stage_id)
);

CREATE INDEX IF NOT EXISTS go_v2_stage_edges_to_idx ON go_v2_stage_edges(to_stage_id);

CREATE TABLE IF NOT EXISTS go_v2_pools (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id     UUID NOT NULL REFERENCES go_v2_stages(id) ON DELETE CASCADE,
  pool_no      INT NOT NULL CHECK (pool_no >= 1),
  label        TEXT NOT NULL,
  capacity     SMALLINT NOT NULL CHECK (capacity IN (3, 4)),
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'locked', 'live', 'finished', 'voided')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stage_id, pool_no)
);

CREATE TABLE IF NOT EXISTS go_v2_pool_assignments (
  pool_id       UUID NOT NULL REFERENCES go_v2_pools(id) ON DELETE CASCADE,
  entry_id      UUID NOT NULL REFERENCES go_v2_entries(id) ON DELETE RESTRICT,
  slot_no       SMALLINT NOT NULL CHECK (slot_no BETWEEN 1 AND 4),
  source_seed   INT CHECK (source_seed IS NULL OR source_seed >= 1),
  assigned_by   TEXT NOT NULL,
  assignment_reason TEXT NOT NULL DEFAULT 'snake_seed',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_id, entry_id),
  UNIQUE (pool_id, slot_no)
);

CREATE TABLE IF NOT EXISTS go_v2_matches (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id      UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  stage_id           UUID NOT NULL REFERENCES go_v2_stages(id) ON DELETE CASCADE,
  pool_id            UUID REFERENCES go_v2_pools(id) ON DELETE CASCADE,
  match_key          TEXT NOT NULL,
  round_no           INT NOT NULL DEFAULT 1 CHECK (round_no >= 1),
  position           INT NOT NULL DEFAULT 1 CHECK (position >= 1),
  bracket_side       TEXT CHECK (bracket_side IS NULL OR bracket_side IN ('upper', 'lower', 'grand_final', 'bronze', 'placement')),
  schedule_state     TEXT NOT NULL DEFAULT 'unscheduled'
                     CHECK (schedule_state IN ('unscheduled', 'scheduled', 'locked', 'skipped', 'cancelled')),
  play_state         TEXT NOT NULL DEFAULT 'pending'
                     CHECK (play_state IN ('pending', 'ready', 'live', 'final', 'voided')),
  is_conditional     BOOLEAN NOT NULL DEFAULT false,
  condition_kind     TEXT CHECK (condition_kind IS NULL OR condition_kind IN ('grand_final_reset', 'admin_condition')),
  condition_state    TEXT NOT NULL DEFAULT 'not_applicable'
                     CHECK (condition_state IN ('not_applicable', 'pending', 'true', 'false')),
  winner_entry_id    UUID REFERENCES go_v2_entries(id) ON DELETE RESTRICT,
  loser_entry_id     UUID REFERENCES go_v2_entries(id) ON DELETE RESTRICT,
  current_result_revision_no INT NOT NULL DEFAULT 0 CHECK (current_result_revision_no >= 0),
  version            BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stage_id, match_key),
  CHECK (NOT is_conditional OR condition_kind IS NOT NULL),
  CHECK (winner_entry_id IS NULL OR loser_entry_id IS NULL OR winner_entry_id <> loser_entry_id)
);

CREATE INDEX IF NOT EXISTS go_v2_matches_tournament_state_idx
  ON go_v2_matches(tournament_id, play_state, schedule_state);
CREATE INDEX IF NOT EXISTS go_v2_matches_stage_round_idx
  ON go_v2_matches(stage_id, round_no, position);
-- Pool matches reuse round/position inside each pool. Bracket coordinates are
-- unique only for non-pool stages; older pre-pilot runs of this additive
-- migration may already have the generated table constraint, so remove it.
ALTER TABLE go_v2_matches
  DROP CONSTRAINT IF EXISTS go_v2_matches_stage_id_round_no_position_bracket_side_key;
CREATE UNIQUE INDEX IF NOT EXISTS go_v2_matches_bracket_coordinate_uidx
  ON go_v2_matches(stage_id, round_no, position, bracket_side)
  WHERE pool_id IS NULL;

CREATE TABLE IF NOT EXISTS go_v2_match_slot_sources (
  match_id        UUID NOT NULL REFERENCES go_v2_matches(id) ON DELETE CASCADE,
  slot_no         SMALLINT NOT NULL CHECK (slot_no IN (1, 2)),
  source_type     TEXT NOT NULL CHECK (source_type IN ('ENTRY', 'POOL_RANK', 'MATCH_WINNER', 'MATCH_LOSER', 'BYE')),
  source_entry_id UUID REFERENCES go_v2_entries(id) ON DELETE RESTRICT,
  source_pool_id  UUID REFERENCES go_v2_pools(id) ON DELETE RESTRICT,
  source_match_id UUID REFERENCES go_v2_matches(id) ON DELETE RESTRICT,
  source_rank     SMALLINT,
  -- Active source_* fields may temporarily become BYE after a no-winner
  -- result. These two columns preserve the immutable bracket/DAG lineage so a
  -- later append-only correction can restore MATCH_WINNER/MATCH_LOSER routes.
  route_source_type TEXT NOT NULL
                    CONSTRAINT go_v2_match_slot_route_source_type_check
                    CHECK (route_source_type IN ('ENTRY', 'POOL_RANK', 'MATCH_WINNER', 'MATCH_LOSER', 'BYE')),
  route_source_match_id UUID
                    CONSTRAINT go_v2_match_slot_route_source_match_fk
                    REFERENCES go_v2_matches(id) ON DELETE RESTRICT,
  resolved_entry_id UUID REFERENCES go_v2_entries(id) ON DELETE RESTRICT,
  resolution_version BIGINT NOT NULL DEFAULT 0 CHECK (resolution_version >= 0),
  PRIMARY KEY (match_id, slot_no),
  CHECK (
    (source_type = 'ENTRY' AND source_entry_id IS NOT NULL AND source_pool_id IS NULL AND source_match_id IS NULL AND source_rank IS NULL) OR
    (source_type = 'POOL_RANK' AND source_entry_id IS NULL AND source_pool_id IS NOT NULL AND source_match_id IS NULL AND source_rank BETWEEN 1 AND 4) OR
    (source_type IN ('MATCH_WINNER', 'MATCH_LOSER') AND source_entry_id IS NULL AND source_pool_id IS NULL AND source_match_id IS NOT NULL AND source_rank IS NULL) OR
    (source_type = 'BYE' AND source_entry_id IS NULL AND source_pool_id IS NULL AND source_match_id IS NULL AND source_rank IS NULL)
  ),
  CHECK (source_match_id IS NULL OR source_match_id <> match_id),
  CONSTRAINT go_v2_match_slot_route_source_shape_check CHECK (
    (route_source_type IN ('MATCH_WINNER', 'MATCH_LOSER') AND route_source_match_id IS NOT NULL) OR
    (route_source_type NOT IN ('MATCH_WINNER', 'MATCH_LOSER') AND route_source_match_id IS NULL)
  ),
  CONSTRAINT go_v2_match_slot_route_source_self_check
    CHECK (route_source_match_id IS NULL OR route_source_match_id <> match_id)
);

-- Compatibility for databases where an earlier pre-pilot revision of migration
-- Earlier statements in migration 105 create the slot-source table before
-- route lineage is attached and backfilled below.
-- Drop a trigger from any partially upgraded run before the one-time backfill.
DROP TRIGGER IF EXISTS go_v2_match_slot_route_lineage_immutable
  ON go_v2_match_slot_sources;
ALTER TABLE go_v2_match_slot_sources
  ADD COLUMN IF NOT EXISTS route_source_type TEXT,
  ADD COLUMN IF NOT EXISTS route_source_match_id UUID;
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
END $$;

CREATE INDEX IF NOT EXISTS go_v2_match_slot_source_match_idx
  ON go_v2_match_slot_sources(source_match_id) WHERE source_match_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS go_v2_match_slot_route_source_match_idx
  ON go_v2_match_slot_sources(route_source_match_id) WHERE route_source_match_id IS NOT NULL;

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

DROP TRIGGER IF EXISTS go_v2_match_slot_route_lineage_immutable
  ON go_v2_match_slot_sources;
CREATE TRIGGER go_v2_match_slot_route_lineage_immutable
BEFORE UPDATE OF route_source_type, route_source_match_id
ON go_v2_match_slot_sources
FOR EACH ROW
EXECUTE FUNCTION go_v2_reject_route_lineage_update();

CREATE TABLE IF NOT EXISTS go_v2_match_lineup_snapshots (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id           UUID NOT NULL REFERENCES go_v2_matches(id) ON DELETE CASCADE,
  result_revision_no INT NOT NULL DEFAULT 1 CHECK (result_revision_no >= 1),
  entry_id           UUID NOT NULL REFERENCES go_v2_entries(id) ON DELETE RESTRICT,
  roster_revision_id UUID NOT NULL REFERENCES go_v2_roster_revisions(id) ON DELETE RESTRICT,
  side               SMALLINT NOT NULL CHECK (side IN (1, 2)),
  captured_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, result_revision_no, side),
  UNIQUE (match_id, result_revision_no, entry_id)
);

-- A replay/cascade is a new append-only result revision. Preserve the lineup of
-- every historical revision instead of mutating a single match-level snapshot.
ALTER TABLE go_v2_match_lineup_snapshots
  ADD COLUMN IF NOT EXISTS result_revision_no INT;
UPDATE go_v2_match_lineup_snapshots
SET result_revision_no = 1
WHERE result_revision_no IS NULL;
ALTER TABLE go_v2_match_lineup_snapshots
  ALTER COLUMN result_revision_no SET DEFAULT 1,
  ALTER COLUMN result_revision_no SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'go_v2_match_lineup_snapshots_result_revision_no_check'
      AND conrelid = 'go_v2_match_lineup_snapshots'::regclass
  ) THEN
    ALTER TABLE go_v2_match_lineup_snapshots
      ADD CONSTRAINT go_v2_match_lineup_snapshots_result_revision_no_check
      CHECK (result_revision_no >= 1);
  END IF;
END $$;
ALTER TABLE go_v2_match_lineup_snapshots
  DROP CONSTRAINT IF EXISTS go_v2_match_lineup_snapshots_match_id_side_key,
  DROP CONSTRAINT IF EXISTS go_v2_match_lineup_snapshots_match_id_entry_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS go_v2_match_lineup_revision_side_uidx
  ON go_v2_match_lineup_snapshots(match_id, result_revision_no, side);
CREATE UNIQUE INDEX IF NOT EXISTS go_v2_match_lineup_revision_entry_uidx
  ON go_v2_match_lineup_snapshots(match_id, result_revision_no, entry_id);

CREATE TABLE IF NOT EXISTS go_v2_match_result_revisions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id           UUID NOT NULL REFERENCES go_v2_matches(id) ON DELETE CASCADE,
  revision_no        INT NOT NULL CHECK (revision_no >= 1),
  supersedes_revision_id UUID REFERENCES go_v2_match_result_revisions(id) ON DELETE RESTRICT,
  result_kind        TEXT NOT NULL CHECK (result_kind IN (
                       'played', 'walkover', 'forfeit', 'incomplete',
                       'mutual_no_show', 'admin_award', 'voided'
                     )),
  incident_cause     TEXT,
  actual_score       JSONB,
  declared_result    JSONB NOT NULL DEFAULT '{}'::jsonb,
  winner_entry_id    UUID REFERENCES go_v2_entries(id) ON DELETE RESTRICT,
  loser_entry_id     UUID REFERENCES go_v2_entries(id) ON DELETE RESTRICT,
  advancement_effect TEXT NOT NULL DEFAULT 'advance_winner'
                     CHECK (advancement_effect IN ('advance_winner', 'retain_existing', 'none')),
  rating_eligibility TEXT NOT NULL DEFAULT 'eligible'
                     CHECK (rating_eligibility IN ('eligible', 'ineligible', 'profile_controlled')),
  reason_code        TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note        TEXT,
  evidence           JSONB NOT NULL DEFAULT '{}'::jsonb,
  author_id          TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, revision_no),
  CHECK (winner_entry_id IS NULL OR loser_entry_id IS NULL OR winner_entry_id <> loser_entry_id)
);

CREATE INDEX IF NOT EXISTS go_v2_result_revisions_match_created_idx
  ON go_v2_match_result_revisions(match_id, revision_no DESC);

CREATE TABLE IF NOT EXISTS go_v2_match_standing_contributions (
  result_revision_id UUID NOT NULL REFERENCES go_v2_match_result_revisions(id) ON DELETE CASCADE,
  entry_id           UUID NOT NULL REFERENCES go_v2_entries(id) ON DELETE RESTRICT,
  matches_played     SMALLINT NOT NULL DEFAULT 0 CHECK (matches_played BETWEEN 0 AND 1),
  match_points       INT NOT NULL DEFAULT 0,
  sets_for           INT NOT NULL DEFAULT 0 CHECK (sets_for >= 0),
  sets_against       INT NOT NULL DEFAULT 0 CHECK (sets_against >= 0),
  rallies_for        INT NOT NULL DEFAULT 0 CHECK (rallies_for >= 0),
  rallies_against    INT NOT NULL DEFAULT 0 CHECK (rallies_against >= 0),
  counts_for_ranking BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (result_revision_id, entry_id)
);

CREATE TABLE IF NOT EXISTS go_v2_standing_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id       UUID NOT NULL REFERENCES go_v2_stages(id) ON DELETE CASCADE,
  supersedes_snapshot_id UUID REFERENCES go_v2_standing_snapshots(id) ON DELETE RESTRICT,
  aggregate_version BIGINT NOT NULL CHECK (aggregate_version >= 0),
  profile_code   TEXT NOT NULL,
  input_hash     TEXT NOT NULL,
  lineage_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS go_v2_standing_snapshots
  ADD COLUMN IF NOT EXISTS supersedes_snapshot_id UUID
    REFERENCES go_v2_standing_snapshots(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS lineage_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

-- A repeated lock of an older input must create a new immutable snapshot at the
-- current aggregate version.  Do not deduplicate snapshots by their content hash.
ALTER TABLE IF EXISTS go_v2_standing_snapshots
  DROP CONSTRAINT IF EXISTS go_v2_standing_snapshots_stage_id_input_hash_key;
CREATE INDEX IF NOT EXISTS go_v2_standing_snapshots_stage_input_idx
  ON go_v2_standing_snapshots(stage_id, input_hash);

CREATE TABLE IF NOT EXISTS go_v2_standing_snapshot_rows (
  snapshot_id     UUID NOT NULL REFERENCES go_v2_standing_snapshots(id) ON DELETE CASCADE,
  pool_id         UUID REFERENCES go_v2_pools(id) ON DELETE CASCADE,
  entry_id        UUID NOT NULL REFERENCES go_v2_entries(id) ON DELETE RESTRICT,
  pool_rank       SMALLINT CHECK (pool_rank IS NULL OR pool_rank BETWEEN 1 AND 4),
  comparison_rank INT,
  metrics         JSONB NOT NULL DEFAULT '{}'::jsonb,
  tie_break_trace JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (snapshot_id, entry_id)
);

CREATE TABLE IF NOT EXISTS go_v2_qualification_snapshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_stage_id  UUID NOT NULL REFERENCES go_v2_stages(id) ON DELETE CASCADE,
  standing_snapshot_id UUID REFERENCES go_v2_standing_snapshots(id) ON DELETE RESTRICT,
  supersedes_snapshot_id UUID REFERENCES go_v2_qualification_snapshots(id) ON DELETE RESTRICT,
  aggregate_version BIGINT NOT NULL CHECK (aggregate_version >= 0),
  rules_snapshot   JSONB NOT NULL,
  input_hash       TEXT NOT NULL,
  lineage_payload  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS go_v2_qualification_snapshots
  ADD COLUMN IF NOT EXISTS standing_snapshot_id UUID
    REFERENCES go_v2_standing_snapshots(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS supersedes_snapshot_id UUID
    REFERENCES go_v2_qualification_snapshots(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS lineage_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS go_v2_qualification_snapshots
  DROP CONSTRAINT IF EXISTS go_v2_qualification_snapshots_source_stage_id_input_hash_key;
CREATE INDEX IF NOT EXISTS go_v2_qualification_snapshots_stage_input_idx
  ON go_v2_qualification_snapshots(source_stage_id, input_hash);

CREATE TABLE IF NOT EXISTS go_v2_qualification_snapshot_rows (
  snapshot_id UUID NOT NULL REFERENCES go_v2_qualification_snapshots(id) ON DELETE CASCADE,
  entry_id    UUID NOT NULL REFERENCES go_v2_entries(id) ON DELETE RESTRICT,
  tier        TEXT NOT NULL CHECK (tier IN ('hard', 'medium', 'light')),
  seed        INT NOT NULL CHECK (seed >= 1),
  source_pool_id UUID REFERENCES go_v2_pools(id) ON DELETE RESTRICT,
  source_pool_rank SMALLINT CHECK (source_pool_rank IS NULL OR source_pool_rank BETWEEN 1 AND 4),
  metrics     JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (snapshot_id, entry_id),
  UNIQUE (snapshot_id, tier, seed)
);

CREATE TABLE IF NOT EXISTS go_v2_courts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_key      TEXT NOT NULL DEFAULT 'default',
  court_no       SMALLINT NOT NULL CHECK (court_no BETWEEN 1 AND 6),
  label          TEXT NOT NULL,
  affinity       JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_key, court_no)
);

CREATE TABLE IF NOT EXISTS go_v2_schedule_sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key          TEXT NOT NULL UNIQUE,
  label                TEXT NOT NULL,
  timezone             TEXT NOT NULL,
  window_start         TIMESTAMPTZ NOT NULL,
  window_end           TIMESTAMPTZ NOT NULL,
  freeze_horizon_minutes INT NOT NULL DEFAULT 60 CHECK (freeze_horizon_minutes BETWEEN 0 AND 1440),
  time_quantum_minutes INT NOT NULL DEFAULT 5 CHECK (time_quantum_minutes BETWEEN 1 AND 60),
  referee_mode         TEXT NOT NULL DEFAULT 'none'
                       CHECK (referee_mode IN ('court_judge', 'working_team', 'hybrid', 'none')),
  configuration        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (window_end > window_start)
);

CREATE TABLE IF NOT EXISTS go_v2_schedule_session_tournaments (
  session_id    UUID NOT NULL REFERENCES go_v2_schedule_sessions(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  priority      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, tournament_id)
);

CREATE TABLE IF NOT EXISTS go_v2_schedule_session_courts (
  session_id    UUID NOT NULL REFERENCES go_v2_schedule_sessions(id) ON DELETE CASCADE,
  court_id      UUID NOT NULL REFERENCES go_v2_courts(id) ON DELETE RESTRICT,
  available_windows JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (session_id, court_id)
);

CREATE TABLE IF NOT EXISTS go_v2_schedule_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES go_v2_schedule_sessions(id) ON DELETE CASCADE,
  version_no      INT NOT NULL CHECK (version_no >= 1),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validated', 'published', 'superseded')),
  solver_status   TEXT NOT NULL CHECK (solver_status IN ('feasible', 'feasible_with_warnings', 'infeasible', 'timeout')),
  solver_version  TEXT NOT NULL,
  input_hash      TEXT NOT NULL,
  schedule_hash   TEXT,
  elapsed_ms      INT NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),
  expanded_states INT NOT NULL DEFAULT 0 CHECK (expanded_states >= 0),
  repair_passes   INT NOT NULL DEFAULT 0 CHECK (repair_passes BETWEEN 0 AND 8),
  objective       JSONB NOT NULL DEFAULT '{}'::jsonb,
  conflicts       JSONB NOT NULL DEFAULT '[]'::jsonb,
  based_on_version_id UUID REFERENCES go_v2_schedule_versions(id) ON DELETE RESTRICT,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at    TIMESTAMPTZ,
  UNIQUE (session_id, version_no)
);

CREATE INDEX IF NOT EXISTS go_v2_schedule_versions_session_status_idx
  ON go_v2_schedule_versions(session_id, status, version_no DESC);

CREATE TABLE IF NOT EXISTS go_v2_schedule_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_version_id UUID NOT NULL REFERENCES go_v2_schedule_versions(id) ON DELETE CASCADE,
  match_id            UUID NOT NULL REFERENCES go_v2_matches(id) ON DELETE CASCADE,
  court_id            UUID NOT NULL REFERENCES go_v2_courts(id) ON DELETE RESTRICT,
  planned_start       TIMESTAMPTZ NOT NULL,
  planned_end         TIMESTAMPTZ NOT NULL,
  live_eta            TIMESTAMPTZ,
  is_locked           BOOLEAN NOT NULL DEFAULT false,
  lock_reason         TEXT,
  is_conditional      BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_version_id, match_id),
  CHECK (planned_end > planned_start)
);

CREATE INDEX IF NOT EXISTS go_v2_schedule_assignments_court_time_idx
  ON go_v2_schedule_assignments(schedule_version_id, court_id, planned_start);

CREATE TABLE IF NOT EXISTS go_v2_referee_duties (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_assignment_id UUID NOT NULL REFERENCES go_v2_schedule_assignments(id) ON DELETE CASCADE,
  duty_kind             TEXT NOT NULL CHECK (duty_kind IN ('staff', 'entry', 'loser_previous_same_court', 'reserved_candidates')),
  referee_entry_id      UUID REFERENCES go_v2_entries(id) ON DELETE RESTRICT,
  source_match_id       UUID REFERENCES go_v2_matches(id) ON DELETE RESTRICT,
  candidate_entry_ids   UUID[] NOT NULL DEFAULT '{}'::uuid[],
  status                TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'confirmed', 'completed', 'released')),
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (duty_kind = 'staff' AND referee_entry_id IS NULL AND source_match_id IS NULL) OR
    (duty_kind = 'entry' AND referee_entry_id IS NOT NULL AND source_match_id IS NULL) OR
    (duty_kind = 'loser_previous_same_court' AND referee_entry_id IS NULL AND source_match_id IS NOT NULL) OR
    (duty_kind = 'reserved_candidates' AND referee_entry_id IS NULL AND cardinality(candidate_entry_ids) >= 1)
  )
);

CREATE TABLE IF NOT EXISTS go_v2_incidents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  match_id       UUID REFERENCES go_v2_matches(id) ON DELETE SET NULL,
  entry_id       UUID REFERENCES go_v2_entries(id) ON DELETE SET NULL,
  incident_type  TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  reason_code    TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  details        JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by     TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS go_v2_incidents_tournament_status_idx
  ON go_v2_incidents(tournament_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS go_v2_cascade_mutation_batches (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id      UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  trigger_match_id   UUID REFERENCES go_v2_matches(id) ON DELETE SET NULL,
  parent_batch_id    UUID REFERENCES go_v2_cascade_mutation_batches(id) ON DELETE RESTRICT,
  mutation_kind      TEXT NOT NULL CHECK (mutation_kind IN (
                       'result_correction', 'incident', 'cascade_void_and_replay',
                       'retain_progression_override', 'compensating_undo'
                     )),
  risk               TEXT NOT NULL CHECK (risk IN ('green', 'amber', 'red')),
  state              TEXT NOT NULL DEFAULT 'preview' CHECK (state IN ('preview', 'committed', 'cancelled')),
  reason_code        TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note        TEXT,
  author_id          TEXT NOT NULL,
  expected_version   BIGINT NOT NULL CHECK (expected_version >= 0),
  committed_version  BIGINT CHECK (committed_version IS NULL OR committed_version >= 1),
  diff_payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS go_v2_cascade_batches_tournament_idx
  ON go_v2_cascade_mutation_batches(tournament_id, created_at DESC);

CREATE TABLE IF NOT EXISTS go_v2_cascade_mutation_matches (
  batch_id                    UUID NOT NULL REFERENCES go_v2_cascade_mutation_batches(id) ON DELETE CASCADE,
  match_id                    UUID NOT NULL REFERENCES go_v2_matches(id) ON DELETE CASCADE,
  prior_result_revision_id    UUID REFERENCES go_v2_match_result_revisions(id) ON DELETE RESTRICT,
  new_result_revision_id      UUID REFERENCES go_v2_match_result_revisions(id) ON DELETE RESTRICT,
  prior_schedule_assignment_id UUID REFERENCES go_v2_schedule_assignments(id) ON DELETE RESTRICT,
  new_schedule_assignment_id  UUID REFERENCES go_v2_schedule_assignments(id) ON DELETE RESTRICT,
  action                      TEXT NOT NULL CHECK (action IN ('unchanged', 'reroute', 'void', 'replay', 'reschedule', 'retain')),
  risk                        TEXT NOT NULL CHECK (risk IN ('green', 'amber', 'red')),
  diff_payload                JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (batch_id, match_id)
);

CREATE TABLE IF NOT EXISTS go_v2_operation_previews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id    UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  operation_kind   TEXT NOT NULL,
  aggregate_version BIGINT NOT NULL CHECK (aggregate_version >= 0),
  input_hash       TEXT NOT NULL,
  risk             TEXT NOT NULL DEFAULT 'green' CHECK (risk IN ('green', 'amber', 'red')),
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  result           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by       TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  consumed_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS go_v2_operation_previews_active_input_uidx
  ON go_v2_operation_previews(tournament_id, operation_kind, input_hash, aggregate_version)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS go_v2_operation_previews_active_expiry_idx
  ON go_v2_operation_previews(tournament_id, operation_kind, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS go_v2_command_receipts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id     UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  idempotency_key   TEXT NOT NULL,
  operation_kind    TEXT NOT NULL,
  expected_version  BIGINT NOT NULL CHECK (expected_version >= 0),
  resulting_version BIGINT NOT NULL CHECK (resulting_version >= 0),
  request_hash      TEXT NOT NULL,
  response_payload  JSONB NOT NULL,
  actor_id          TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS go_v2_audit_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id     UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  aggregate_version BIGINT NOT NULL CHECK (aggregate_version >= 1),
  event_type         TEXT NOT NULL,
  entity_type        TEXT,
  entity_id          UUID,
  reason_code        TEXT NOT NULL REFERENCES go_v2_mutation_reason_catalog(code),
  reason_note        TEXT,
  actor_id           TEXT NOT NULL,
  idempotency_key    TEXT NOT NULL,
  diff_payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, aggregate_version),
  UNIQUE (tournament_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS go_v2_audit_events_tournament_created_idx
  ON go_v2_audit_events(tournament_id, created_at DESC);

CREATE TABLE IF NOT EXISTS go_v2_notification_outbox (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id    UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  aggregate_version BIGINT NOT NULL CHECK (aggregate_version >= 1),
  channel          TEXT NOT NULL CHECK (channel IN ('website', 'telegram')),
  recipient_key    TEXT NOT NULL,
  event_type       TEXT NOT NULL,
  payload          JSONB NOT NULL,
  dedup_key        TEXT NOT NULL UNIQUE,
  attempts         INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ,
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS go_v2_notification_outbox_pending_idx
  ON go_v2_notification_outbox(available_at, created_at)
  WHERE sent_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'go_v2_tournament_state_stage_snapshot_fk'
      AND conrelid = 'go_v2_tournament_state'::regclass
  ) THEN
    ALTER TABLE go_v2_tournament_state
      ADD CONSTRAINT go_v2_tournament_state_stage_snapshot_fk
      FOREIGN KEY (active_stage_snapshot_id)
      REFERENCES go_v2_stage_lock_snapshots(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'go_v2_tournament_state_schedule_version_fk'
      AND conrelid = 'go_v2_tournament_state'::regclass
  ) THEN
    ALTER TABLE go_v2_tournament_state
      ADD CONSTRAINT go_v2_tournament_state_schedule_version_fk
      FOREIGN KEY (active_schedule_version_id)
      REFERENCES go_v2_schedule_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    FOREACH table_name IN ARRAY ARRAY[
      'go_v2_mutation_reason_catalog', 'go_v2_tournament_state', 'go_v2_entries',
      'go_v2_roster_revisions', 'go_v2_roster_revision_members',
      'go_v2_rating_snapshots', 'go_v2_rating_snapshot_entries',
      'go_v2_stage_lock_snapshots', 'go_v2_stages', 'go_v2_stage_edges',
      'go_v2_pools', 'go_v2_pool_assignments', 'go_v2_matches',
      'go_v2_match_slot_sources', 'go_v2_match_lineup_snapshots',
      'go_v2_match_result_revisions', 'go_v2_match_standing_contributions',
      'go_v2_standing_snapshots', 'go_v2_standing_snapshot_rows',
      'go_v2_qualification_snapshots', 'go_v2_qualification_snapshot_rows',
      'go_v2_courts', 'go_v2_schedule_sessions', 'go_v2_schedule_session_tournaments',
      'go_v2_schedule_session_courts', 'go_v2_schedule_versions',
      'go_v2_schedule_assignments', 'go_v2_referee_duties', 'go_v2_incidents',
      'go_v2_cascade_mutation_batches', 'go_v2_cascade_mutation_matches',
      'go_v2_operation_previews', 'go_v2_command_receipts', 'go_v2_audit_events',
      'go_v2_notification_outbox'
    ] LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO lpbvolley', table_name);
    END LOOP;
  END IF;
END $$;

COMMIT;
