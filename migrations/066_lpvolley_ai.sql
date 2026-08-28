-- 066: Private LPVolley AI video analysis queue and review dataset.
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS ai_analysis_job (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                TEXT NOT NULL CHECK (kind IN ('match', 'training')),
  status              TEXT NOT NULL DEFAULT 'uploading'
                      CHECK (status IN ('uploading', 'queued', 'processing', 'review', 'confirmed', 'failed', 'cancelled')),
  title               TEXT NOT NULL,
  source_match_ref    TEXT,
  source_file_name    TEXT NOT NULL,
  source_content_type TEXT NOT NULL DEFAULT 'video/mp4',
  source_size_bytes   BIGINT NOT NULL CHECK (source_size_bytes > 0),
  source_sha256       TEXT,
  source_storage_path TEXT,
  calibration_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
  progress_percent    NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  progress_stage      TEXT NOT NULL DEFAULT 'uploading',
  model_version       TEXT,
  created_by_actor    TEXT NOT NULL,
  leased_by           TEXT,
  lease_token_hash    TEXT,
  lease_expires_at    TIMESTAMPTZ,
  heartbeat_at        TIMESTAMPTZ,
  error_message       TEXT,
  confirmed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_upload_session (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID NOT NULL UNIQUE REFERENCES ai_analysis_job(id) ON DELETE CASCADE,
  chunk_size_bytes    INTEGER NOT NULL CHECK (chunk_size_bytes BETWEEN 1048576 AND 16777216),
  total_chunks        INTEGER NOT NULL CHECK (total_chunks > 0),
  received_chunks     INTEGER[] NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assembling', 'complete', 'failed')),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT now() + interval '48 hours',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_analysis_player (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID NOT NULL REFERENCES ai_analysis_job(id) ON DELETE CASCADE,
  slot                TEXT NOT NULL CHECK (slot IN ('A1', 'A2', 'B1', 'B2')),
  player_id           UUID REFERENCES players(id) ON DELETE SET NULL,
  display_name        TEXT NOT NULL,
  seed_x              NUMERIC,
  seed_y              NUMERIC,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, slot)
);

CREATE TABLE IF NOT EXISTS ai_rally (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID NOT NULL REFERENCES ai_analysis_job(id) ON DELETE CASCADE,
  rally_no            INTEGER NOT NULL CHECK (rally_no > 0),
  start_sec           NUMERIC NOT NULL CHECK (start_sec >= 0),
  end_sec             NUMERIC NOT NULL CHECK (end_sec > start_sec),
  winner_team         TEXT CHECK (winner_team IS NULL OR winner_team IN ('A', 'B')),
  score_before_json   JSONB,
  score_after_json    JSONB,
  confidence          NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  review_status       TEXT NOT NULL DEFAULT 'review' CHECK (review_status IN ('review', 'confirmed', 'rejected')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, rally_no)
);

CREATE TABLE IF NOT EXISTS ai_event (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID NOT NULL REFERENCES ai_analysis_job(id) ON DELETE CASCADE,
  rally_id            UUID REFERENCES ai_rally(id) ON DELETE CASCADE,
  event_type          TEXT NOT NULL CHECK (event_type IN (
                        'serve', 'reception', 'dig', 'set', 'attack', 'block', 'contact',
                        'landing', 'out', 'rally_end', 'training_attempt', 'technique_finding'
                      )),
  event_time_sec      NUMERIC NOT NULL CHECK (event_time_sec >= 0),
  team                TEXT CHECK (team IS NULL OR team IN ('A', 'B')),
  player_id           UUID REFERENCES players(id) ON DELETE SET NULL,
  outcome             TEXT,
  confidence          NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  metrics_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_status       TEXT NOT NULL DEFAULT 'review' CHECK (review_status IN ('review', 'confirmed', 'rejected')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_artifact (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID NOT NULL REFERENCES ai_analysis_job(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN ('proxy', 'thumbnail', 'highlight', 'evidence', 'diagnostic')),
  file_name           TEXT NOT NULL,
  content_type        TEXT NOT NULL,
  size_bytes          BIGINT NOT NULL CHECK (size_bytes >= 0),
  sha256              TEXT,
  storage_path        TEXT,
  upload_status       TEXT NOT NULL DEFAULT 'open' CHECK (upload_status IN ('open', 'complete', 'failed', 'deleted')),
  chunk_size_bytes    INTEGER NOT NULL DEFAULT 8388608,
  total_chunks        INTEGER NOT NULL CHECK (total_chunks > 0),
  received_chunks     INTEGER[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_correction (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID NOT NULL REFERENCES ai_analysis_job(id) ON DELETE CASCADE,
  entity_type         TEXT NOT NULL CHECK (entity_type IN ('job', 'player', 'rally', 'event', 'metric')),
  entity_id           UUID,
  field_name          TEXT NOT NULL,
  before_json         JSONB,
  after_json          JSONB,
  model_version       TEXT,
  original_confidence NUMERIC(5,4),
  use_for_training    BOOLEAN NOT NULL DEFAULT true,
  corrected_by_actor  TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_job_queue_idx ON ai_analysis_job(status, created_at);
CREATE INDEX IF NOT EXISTS ai_job_lease_idx ON ai_analysis_job(lease_expires_at) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS ai_rally_job_idx ON ai_rally(job_id, rally_no);
CREATE INDEX IF NOT EXISTS ai_event_job_time_idx ON ai_event(job_id, event_time_sec);
CREATE INDEX IF NOT EXISTS ai_correction_training_idx ON ai_correction(job_id, created_at) WHERE use_for_training;
CREATE INDEX IF NOT EXISTS ai_artifact_job_idx ON ai_artifact(job_id, kind, created_at);

CREATE OR REPLACE FUNCTION ai_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ai_analysis_job', 'ai_upload_session', 'ai_rally', 'ai_event', 'ai_artifact'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION ai_set_updated_at()',
      table_name, table_name
    );
  END LOOP;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      ai_analysis_job, ai_upload_session, ai_analysis_player, ai_rally,
      ai_event, ai_artifact, ai_correction
    TO lpbvolley;
  END IF;
END
$$;

COMMIT;
