-- 096: LP Coach standardized challenges, attempts and problem links.
BEGIN;

CREATE TABLE IF NOT EXISTS coach_challenges (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                    TEXT NOT NULL,
  description              TEXT NOT NULL DEFAULT '',
  type                     TEXT NOT NULL DEFAULT 'control'
                           CHECK (type IN ('control', 'training', 'competitive')),
  scoring_type             TEXT NOT NULL DEFAULT 'score'
                           CHECK (scoring_type IN ('count', 'time', 'distance', 'score', 'percent', 'custom')),
  attempt_count            SMALLINT NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 500),
  max_score                NUMERIC(12,3) CHECK (max_score IS NULL OR max_score > 0),
  unit_label               TEXT NOT NULL DEFAULT 'балл',
  higher_is_better         BOOLEAN NOT NULL DEFAULT true,
  metrics                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  rules                    TEXT[] NOT NULL DEFAULT '{}',
  repeat_interval_days     SMALLINT CHECK (repeat_interval_days BETWEEN 1 AND 3650),
  archived_at              TIMESTAMPTZ,
  created_by_actor         TEXT NOT NULL,
  updated_by_actor         TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(btrim(title)) BETWEEN 3 AND 160),
  CHECK (length(description) <= 4000),
  CHECK (length(unit_label) BETWEEN 1 AND 40),
  CHECK (jsonb_typeof(metrics) = 'array')
);

CREATE TABLE IF NOT EXISTS coach_challenge_skills (
  challenge_id             UUID NOT NULL REFERENCES coach_challenges(id) ON DELETE CASCADE,
  skill_id                 UUID NOT NULL REFERENCES coach_skills(id) ON DELETE RESTRICT,
  is_primary               BOOLEAN NOT NULL DEFAULT false,
  sort_order               SMALLINT NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, skill_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS coach_challenge_skills_one_primary
  ON coach_challenge_skills(challenge_id) WHERE is_primary;

CREATE TABLE IF NOT EXISTS coach_challenge_issues (
  challenge_id             UUID NOT NULL REFERENCES coach_challenges(id) ON DELETE CASCADE,
  issue_id                 UUID NOT NULL REFERENCES coach_issues(id) ON DELETE RESTRICT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, issue_id)
);

CREATE TABLE IF NOT EXISTS coach_challenge_attempts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id             UUID NOT NULL REFERENCES coach_challenges(id) ON DELETE RESTRICT,
  player_id                UUID NOT NULL REFERENCES coach_athlete_profiles(player_id) ON DELETE RESTRICT,
  training_session_id      UUID REFERENCES coach_training_sessions(id) ON DELETE SET NULL,
  started_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  score                    NUMERIC(12,3) NOT NULL,
  max_score                NUMERIC(12,3) CHECK (max_score IS NULL OR max_score > 0),
  details                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  coach_comment            TEXT NOT NULL DEFAULT '',
  video_asset_id           UUID,
  recorded_by_actor        TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (completed_at >= started_at),
  CHECK (length(coach_comment) <= 2000),
  CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX IF NOT EXISTS coach_challenges_active_idx
  ON coach_challenges(type, updated_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS coach_challenge_issues_issue_idx
  ON coach_challenge_issues(issue_id, challenge_id);
CREATE INDEX IF NOT EXISTS coach_challenge_attempts_challenge_idx
  ON coach_challenge_attempts(challenge_id, completed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS coach_challenge_attempts_player_idx
  ON coach_challenge_attempts(player_id, completed_at DESC, id DESC);

DROP TRIGGER IF EXISTS coach_challenges_updated_at ON coach_challenges;
CREATE TRIGGER coach_challenges_updated_at
  BEFORE UPDATE ON coach_challenges
  FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE coach_challenges TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_challenge_skills TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_challenge_issues TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE coach_challenge_attempts TO lpbvolley';
  END IF;
END $$;

COMMIT;
