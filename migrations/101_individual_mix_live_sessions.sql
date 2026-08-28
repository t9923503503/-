-- 101: revision-safe, offline-capable live control for Individual Mix presets.

BEGIN;

ALTER TABLE tournament_results
  ADD COLUMN IF NOT EXISTS rating_excluded BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tournament_results.rating_excluded IS
  'Explicitly excludes a result from automatic rating points while preserving tournament history and placement.';

-- Keep the PostgREST archive publication path aligned with direct PostgreSQL
-- writes: a replacement slot must remain excluded even after an admin re-saves
-- the tournament results.
CREATE OR REPLACE FUNCTION publish_tournament_results(
  p_external_id  TEXT,
  p_name         TEXT,
  p_date         TEXT,
  p_format       TEXT,
  p_division     TEXT,
  p_results      JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_response JSONB;
  v_tournament_id UUID;
  v_existing_player_wins JSONB;
BEGIN
  SELECT COALESCE(
           jsonb_agg(jsonb_build_object('id', p.id, 'wins', p.wins)),
           '[]'::JSONB
         )
    INTO v_existing_player_wins
    FROM players p
    JOIN jsonb_to_recordset(p_results) AS src(name TEXT, gender TEXT)
      ON LOWER(TRIM(p.name)) = LOWER(TRIM(src.name))
     AND p.gender = src.gender;

  v_response := publish_tournament_results_without_match_stats(
    p_external_id,
    p_name,
    p_date,
    p_format,
    p_division,
    p_results
  );

  IF COALESCE((v_response->>'ok')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RETURN v_response;
  END IF;

  v_tournament_id := NULLIF(v_response->>'tournament_id', '')::UUID;
  IF v_tournament_id IS NULL THEN
    RETURN v_response;
  END IF;

  UPDATE players p
     SET wins = saved.wins
    FROM jsonb_to_recordset(v_existing_player_wins) AS saved(id UUID, wins INT)
   WHERE p.id = saved.id;

  UPDATE tournament_results tr
     SET wins = COALESCE(src.result_wins, 0),
         diff = COALESCE(src.diff, 0),
         balls = COALESCE(src.balls, 0),
         rating_excluded = COALESCE(src.rating_excluded, FALSE)
    FROM players p,
         jsonb_to_recordset(p_results) AS src(
           name TEXT,
           gender TEXT,
           result_wins INT,
           diff INT,
           balls INT,
           rating_excluded BOOLEAN
         )
   WHERE tr.tournament_id = v_tournament_id
     AND p.id = tr.player_id
     AND LOWER(TRIM(p.name)) = LOWER(TRIM(src.name))
     AND p.gender = src.gender;

  RETURN v_response;
END;
$$;

CREATE TABLE IF NOT EXISTS individual_mix_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL UNIQUE REFERENCES tournaments(id) ON DELETE CASCADE,
  preset_version TEXT NOT NULL,
  state_schema_version INTEGER NOT NULL CHECK (state_schema_version > 0),
  schedule_revision UUID NOT NULL,
  roster_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finalized', 'cancelled')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  current_round INTEGER NOT NULL DEFAULT 1 CHECK (current_round BETWEEN 1 AND 7),
  state JSONB NOT NULL,
  created_by_actor TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS individual_mix_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES individual_mix_sessions(id) ON DELETE CASCADE,
  command_id UUID NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'record_score',
    'undo_last',
    'correct_score',
    'replace_player',
    'rebuild_schedule',
    'restore_snapshot',
    'finalize'
  )),
  expected_revision INTEGER NOT NULL CHECK (expected_revision >= 0),
  applied_revision INTEGER NOT NULL CHECK (applied_revision > 0),
  expected_schedule_revision UUID NOT NULL,
  device_id TEXT NOT NULL,
  court_no INTEGER CHECK (court_no IN (1, 2)),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('admin', 'operator', 'judge', 'offline_master', 'system')),
  actor_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  before_state JSONB NOT NULL,
  after_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, command_id)
);

CREATE TABLE IF NOT EXISTS individual_mix_court_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES individual_mix_sessions(id) ON DELETE CASCADE,
  court_no INTEGER NOT NULL CHECK (court_no IN (1, 2)),
  pin_code TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, court_no)
);

CREATE TABLE IF NOT EXISTS individual_mix_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES individual_mix_sessions(id) ON DELETE CASCADE,
  source_revision INTEGER NOT NULL CHECK (source_revision >= 0),
  label TEXT NOT NULL,
  reason TEXT NOT NULL,
  state JSONB NOT NULL,
  created_by_actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS individual_mix_sessions_status_idx
  ON individual_mix_sessions(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS individual_mix_commands_session_revision_idx
  ON individual_mix_commands(session_id, applied_revision DESC);
CREATE INDEX IF NOT EXISTS individual_mix_commands_device_idx
  ON individual_mix_commands(session_id, device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS individual_mix_snapshots_session_idx
  ON individual_mix_snapshots(session_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE individual_mix_sessions TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE individual_mix_commands TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE individual_mix_court_access TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE individual_mix_snapshots TO lpbvolley';
  END IF;
END $$;

COMMIT;
