-- 097: deterministic LP Coach workout recommendations with explainable plan items.
BEGIN;

CREATE TABLE IF NOT EXISTS coach_workout_recommendation_runs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_plan_id          UUID NOT NULL REFERENCES coach_workout_plans(id) ON DELETE CASCADE,
  training_session_id      UUID NOT NULL REFERENCES coach_training_sessions(id) ON DELETE CASCADE,
  algorithm_version        TEXT NOT NULL DEFAULT 'deterministic-v1',
  duration_minutes         SMALLINT NOT NULL CHECK (duration_minutes BETWEEN 15 AND 360),
  court_count              SMALLINT NOT NULL CHECK (court_count BETWEEN 1 AND 20),
  participant_ids          UUID[] NOT NULL DEFAULT '{}',
  focus_skill_id           UUID REFERENCES coach_skills(id) ON DELETE RESTRICT,
  level_code               TEXT NOT NULL CHECK (level_code IN ('auto', 'light', 'medium', 'hard')),
  intensity                TEXT NOT NULL CHECK (intensity IN ('auto', 'low', 'medium', 'high')),
  selected_count           SMALLINT NOT NULL DEFAULT 0 CHECK (selected_count BETWEEN 0 AND 100),
  planned_duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (planned_duration_seconds BETWEEN 0 AND 86400),
  created_by_actor         TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, workout_plan_id)
);

ALTER TABLE coach_workout_plan_items
  ADD COLUMN IF NOT EXISTS recommendation_run_id UUID,
  ADD COLUMN IF NOT EXISTS recommendation_source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS recommendation_score INTEGER,
  ADD COLUMN IF NOT EXISTS recommendation_reasons TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'coach_workout_plan_items_recommendation_source_check'
       AND conrelid = 'coach_workout_plan_items'::regclass
  ) THEN
    ALTER TABLE coach_workout_plan_items
      ADD CONSTRAINT coach_workout_plan_items_recommendation_source_check
      CHECK (recommendation_source IN ('manual', 'deterministic'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'coach_workout_plan_items_recommendation_run_fk'
       AND conrelid = 'coach_workout_plan_items'::regclass
  ) THEN
    ALTER TABLE coach_workout_plan_items
      ADD CONSTRAINT coach_workout_plan_items_recommendation_run_fk
      FOREIGN KEY (recommendation_run_id)
      REFERENCES coach_workout_recommendation_runs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS coach_workout_recommendation_runs_session_idx
  ON coach_workout_recommendation_runs(training_session_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS coach_workout_plan_items_recommendation_run_idx
  ON coach_workout_plan_items(recommendation_run_id)
  WHERE recommendation_run_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE coach_workout_recommendation_runs TO lpbvolley';
  END IF;
END $$;

COMMIT;
