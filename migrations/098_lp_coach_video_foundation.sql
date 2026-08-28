-- 098: LP Coach video foundation: assets, clips, frames, manual annotations and before/after comparisons.
BEGIN;

CREATE TABLE IF NOT EXISTS coach_video_assets (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                    TEXT NOT NULL,
  athlete_id               UUID REFERENCES coach_athlete_profiles(player_id) ON DELETE SET NULL,
  training_session_id      UUID REFERENCES coach_training_sessions(id) ON DELETE SET NULL,
  exercise_id              UUID REFERENCES coach_exercises(id) ON DELETE SET NULL,
  source                   TEXT NOT NULL DEFAULT 'own_video'
                           CHECK (source IN ('youtube', 'instagram', 'telegram', 'own_video', 'upload', 'other')),
  original_url             TEXT NOT NULL DEFAULT '',
  storage_url              TEXT NOT NULL DEFAULT '',
  thumbnail_url            TEXT NOT NULL DEFAULT '',
  duration_ms              BIGINT CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 86400000),
  recorded_at              TIMESTAMPTZ,
  status                   TEXT NOT NULL DEFAULT 'ready'
                           CHECK (status IN ('processing', 'ready', 'error', 'archived')),
  notes                    TEXT NOT NULL DEFAULT '',
  tags                     TEXT[] NOT NULL DEFAULT '{}',
  metadata                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_actor         TEXT NOT NULL,
  updated_by_actor         TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(btrim(title)) BETWEEN 3 AND 160),
  CHECK (length(original_url) <= 2000),
  CHECK (length(storage_url) <= 2000),
  CHECK (length(thumbnail_url) <= 2000),
  CHECK (length(notes) <= 4000),
  CHECK (original_url <> '' OR storage_url <> ''),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS coach_video_clips (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_asset_id           UUID NOT NULL REFERENCES coach_video_assets(id) ON DELETE CASCADE,
  start_ms                 BIGINT NOT NULL CHECK (start_ms BETWEEN 0 AND 86400000),
  end_ms                   BIGINT NOT NULL CHECK (end_ms BETWEEN 1 AND 86400000),
  title                    TEXT NOT NULL,
  skill_id                 UUID REFERENCES coach_skills(id) ON DELETE RESTRICT,
  issue_id                 UUID REFERENCES coach_issues(id) ON DELETE SET NULL,
  notes                    TEXT NOT NULL DEFAULT '',
  sort_order               SMALLINT NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 1000),
  created_by_actor         TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_ms > start_ms),
  CHECK (length(btrim(title)) BETWEEN 2 AND 160),
  CHECK (length(notes) <= 2000)
);

CREATE TABLE IF NOT EXISTS coach_video_frames (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_asset_id           UUID NOT NULL REFERENCES coach_video_assets(id) ON DELETE CASCADE,
  clip_id                  UUID REFERENCES coach_video_clips(id) ON DELETE SET NULL,
  timestamp_ms             BIGINT NOT NULL CHECK (timestamp_ms BETWEEN 0 AND 86400000),
  image_url                TEXT NOT NULL,
  kind                     TEXT NOT NULL DEFAULT 'key'
                           CHECK (kind IN ('key', 'before', 'after', 'error', 'phase')),
  label                    TEXT NOT NULL DEFAULT '',
  notes                    TEXT NOT NULL DEFAULT '',
  created_by_actor         TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(image_url) BETWEEN 1 AND 2000),
  CHECK (length(label) <= 160),
  CHECK (length(notes) <= 2000)
);

CREATE TABLE IF NOT EXISTS coach_video_annotations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_asset_id           UUID NOT NULL REFERENCES coach_video_assets(id) ON DELETE CASCADE,
  clip_id                  UUID REFERENCES coach_video_clips(id) ON DELETE SET NULL,
  timestamp_ms             BIGINT NOT NULL CHECK (timestamp_ms BETWEEN 0 AND 86400000),
  type                     TEXT NOT NULL DEFAULT 'note'
                           CHECK (type IN ('technique', 'error', 'cue', 'decision', 'measurement', 'note')),
  skill_id                 UUID REFERENCES coach_skills(id) ON DELETE RESTRICT,
  issue_id                 UUID REFERENCES coach_issues(id) ON DELETE SET NULL,
  text                     TEXT NOT NULL,
  source                   TEXT NOT NULL DEFAULT 'coach' CHECK (source IN ('coach', 'ai')),
  confidence               NUMERIC(4,3) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  created_by_actor         TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(btrim(text)) BETWEEN 2 AND 2000)
);

CREATE TABLE IF NOT EXISTS coach_video_comparisons (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id               UUID REFERENCES coach_athlete_profiles(player_id) ON DELETE SET NULL,
  before_clip_id           UUID NOT NULL REFERENCES coach_video_clips(id) ON DELETE RESTRICT,
  after_clip_id            UUID NOT NULL REFERENCES coach_video_clips(id) ON DELETE RESTRICT,
  skill_id                 UUID REFERENCES coach_skills(id) ON DELETE RESTRICT,
  issue_id                 UUID REFERENCES coach_issues(id) ON DELETE SET NULL,
  title                    TEXT NOT NULL,
  notes                    TEXT NOT NULL DEFAULT '',
  created_by_actor         TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (before_clip_id <> after_clip_id),
  CHECK (length(btrim(title)) BETWEEN 3 AND 160),
  CHECK (length(notes) <= 4000)
);

CREATE INDEX IF NOT EXISTS coach_video_assets_active_idx
  ON coach_video_assets(updated_at DESC, id DESC) WHERE status <> 'archived';
CREATE INDEX IF NOT EXISTS coach_video_assets_athlete_idx
  ON coach_video_assets(athlete_id, recorded_at DESC NULLS LAST) WHERE status <> 'archived';
CREATE INDEX IF NOT EXISTS coach_video_assets_session_idx
  ON coach_video_assets(training_session_id, created_at DESC) WHERE training_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS coach_video_clips_asset_idx ON coach_video_clips(video_asset_id, sort_order, start_ms);
CREATE INDEX IF NOT EXISTS coach_video_frames_asset_idx ON coach_video_frames(video_asset_id, timestamp_ms);
CREATE INDEX IF NOT EXISTS coach_video_annotations_asset_idx ON coach_video_annotations(video_asset_id, timestamp_ms);
CREATE INDEX IF NOT EXISTS coach_video_annotations_issue_idx ON coach_video_annotations(issue_id, created_at DESC) WHERE issue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS coach_video_comparisons_athlete_idx ON coach_video_comparisons(athlete_id, created_at DESC);

DROP TRIGGER IF EXISTS coach_video_assets_updated_at ON coach_video_assets;
CREATE TRIGGER coach_video_assets_updated_at
  BEFORE UPDATE ON coach_video_assets
  FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coach_challenge_attempts_video_asset_fk'
  ) THEN
    ALTER TABLE coach_challenge_attempts
      ADD CONSTRAINT coach_challenge_attempts_video_asset_fk
      FOREIGN KEY (video_asset_id) REFERENCES coach_video_assets(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE coach_video_assets TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_video_clips TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_video_frames TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_video_annotations TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_video_comparisons TO lpbvolley';
  END IF;
END $$;

COMMIT;
