-- 092: LP Coach exercise library, structured media and skill/issue links.
BEGIN;

CREATE TABLE IF NOT EXISTS coach_exercises (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                TEXT NOT NULL,
  short_description    TEXT NOT NULL DEFAULT '',
  goal                 TEXT NOT NULL DEFAULT '',
  category             TEXT NOT NULL
                       CHECK (category IN (
                         'warmup', 'ball_control', 'reception', 'setting', 'attack',
                         'serve', 'defense', 'block', 'transitions', 'tactics',
                         'game', 'physical', 'coordination', 'combined'
                       )),
  level_code           TEXT NOT NULL DEFAULT 'all'
                       CHECK (level_code IN ('all', 'light', 'medium', 'hard')),
  player_min           SMALLINT NOT NULL DEFAULT 1 CHECK (player_min BETWEEN 1 AND 100),
  player_max           SMALLINT NOT NULL DEFAULT 2 CHECK (player_max BETWEEN 1 AND 100),
  court_count          SMALLINT NOT NULL DEFAULT 1 CHECK (court_count BETWEEN 0 AND 20),
  ball_count           SMALLINT NOT NULL DEFAULT 1 CHECK (ball_count BETWEEN 0 AND 200),
  equipment            TEXT[] NOT NULL DEFAULT '{}',
  duration_minutes     SMALLINT NOT NULL DEFAULT 10 CHECK (duration_minutes BETWEEN 1 AND 360),
  intensity            TEXT NOT NULL DEFAULT 'medium'
                       CHECK (intensity IN ('low', 'medium', 'high')),
  coach_required       BOOLEAN NOT NULL DEFAULT false,
  organization         TEXT NOT NULL DEFAULT '',
  steps                TEXT[] NOT NULL DEFAULT '{}',
  coach_cues           TEXT[] NOT NULL DEFAULT '{}',
  typical_errors       TEXT[] NOT NULL DEFAULT '{}',
  progression          TEXT NOT NULL DEFAULT '',
  simplification       TEXT NOT NULL DEFAULT '',
  complication         TEXT NOT NULL DEFAULT '',
  variants             TEXT[] NOT NULL DEFAULT '{}',
  tags                 TEXT[] NOT NULL DEFAULT '{}',
  favorite             BOOLEAN NOT NULL DEFAULT false,
  recommended          BOOLEAN NOT NULL DEFAULT false,
  coach_rating         SMALLINT CHECK (coach_rating BETWEEN 1 AND 5),
  coach_comment        TEXT NOT NULL DEFAULT '',
  archived_at          TIMESTAMPTZ,
  created_by_actor     TEXT NOT NULL,
  updated_by_actor     TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(btrim(title)) BETWEEN 3 AND 160),
  CHECK (player_min <= player_max)
);

CREATE TABLE IF NOT EXISTS coach_exercise_skills (
  exercise_id          UUID NOT NULL REFERENCES coach_exercises(id) ON DELETE CASCADE,
  skill_id             UUID NOT NULL REFERENCES coach_skills(id) ON DELETE RESTRICT,
  is_primary           BOOLEAN NOT NULL DEFAULT false,
  sort_order           SMALLINT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (exercise_id, skill_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS coach_exercise_one_primary_skill_unique
  ON coach_exercise_skills(exercise_id)
  WHERE is_primary;

CREATE TABLE IF NOT EXISTS coach_exercise_issues (
  exercise_id          UUID NOT NULL REFERENCES coach_exercises(id) ON DELETE CASCADE,
  issue_id             UUID NOT NULL REFERENCES coach_issues(id) ON DELETE RESTRICT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (exercise_id, issue_id)
);

CREATE TABLE IF NOT EXISTS coach_exercise_photos (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id          UUID NOT NULL REFERENCES coach_exercises(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL CHECK (type IN ('correct', 'error', 'phase')),
  phase_index          SMALLINT CHECK (phase_index BETWEEN 1 AND 50),
  title                TEXT NOT NULL DEFAULT '',
  caption              TEXT NOT NULL DEFAULT '',
  related_issue_id     UUID REFERENCES coach_issues(id) ON DELETE RESTRICT,
  storage_url          TEXT NOT NULL,
  sort_order           SMALLINT NOT NULL DEFAULT 0,
  created_by_actor     TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(btrim(storage_url)) BETWEEN 1 AND 2000),
  CHECK ((type = 'phase' AND phase_index IS NOT NULL) OR type <> 'phase')
);

CREATE UNIQUE INDEX IF NOT EXISTS coach_exercise_photos_url_unique
  ON coach_exercise_photos(exercise_id, storage_url);

CREATE TABLE IF NOT EXISTS coach_exercise_videos (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id          UUID NOT NULL REFERENCES coach_exercises(id) ON DELETE CASCADE,
  platform             TEXT NOT NULL
                       CHECK (platform IN ('youtube', 'instagram', 'telegram', 'own_video', 'other')),
  url                  TEXT NOT NULL,
  title                TEXT NOT NULL DEFAULT '',
  author               TEXT NOT NULL DEFAULT '',
  duration_seconds     INTEGER CHECK (duration_seconds BETWEEN 0 AND 86400),
  language             TEXT NOT NULL DEFAULT '',
  timestamp_start_sec  INTEGER NOT NULL DEFAULT 0 CHECK (timestamp_start_sec BETWEEN 0 AND 86400),
  coach_note           TEXT NOT NULL DEFAULT '',
  rating               SMALLINT CHECK (rating BETWEEN 1 AND 5),
  tags                 TEXT[] NOT NULL DEFAULT '{}',
  sort_order           SMALLINT NOT NULL DEFAULT 0,
  created_by_actor     TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(btrim(url)) BETWEEN 1 AND 2000)
);

CREATE UNIQUE INDEX IF NOT EXISTS coach_exercise_videos_url_unique
  ON coach_exercise_videos(exercise_id, url);

CREATE INDEX IF NOT EXISTS coach_exercises_library_idx
  ON coach_exercises(archived_at, favorite DESC, category, level_code, title);
CREATE INDEX IF NOT EXISTS coach_exercises_tags_idx
  ON coach_exercises USING gin(tags);
CREATE INDEX IF NOT EXISTS coach_exercise_skills_skill_idx
  ON coach_exercise_skills(skill_id, exercise_id);
CREATE INDEX IF NOT EXISTS coach_exercise_issues_issue_idx
  ON coach_exercise_issues(issue_id, exercise_id);
CREATE INDEX IF NOT EXISTS coach_exercise_photos_exercise_idx
  ON coach_exercise_photos(exercise_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS coach_exercise_videos_exercise_idx
  ON coach_exercise_videos(exercise_id, sort_order, created_at);

DROP TRIGGER IF EXISTS coach_exercises_updated_at ON coach_exercises;
CREATE TRIGGER coach_exercises_updated_at
  BEFORE UPDATE ON coach_exercises
  FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE coach_exercises TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_exercise_skills TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON TABLE coach_exercise_issues TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON TABLE coach_exercise_photos TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON TABLE coach_exercise_videos TO lpbvolley';
  END IF;
END $$;

COMMIT;
