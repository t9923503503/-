-- 094: LP Coach workout planning and factual exercise execution.
BEGIN;

CREATE TABLE IF NOT EXISTS coach_workout_plans (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_session_id      UUID NOT NULL UNIQUE REFERENCES coach_training_sessions(id) ON DELETE CASCADE,
  title                    TEXT NOT NULL DEFAULT '',
  status                   TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'ready', 'in_progress', 'completed')),
  started_at               TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  created_by_actor         TEXT NOT NULL,
  updated_by_actor         TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, training_session_id),
  CHECK (completed_at IS NULL OR started_at IS NOT NULL),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS coach_workout_plan_items (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_plan_id          UUID NOT NULL REFERENCES coach_workout_plans(id) ON DELETE CASCADE,
  exercise_id              UUID NOT NULL REFERENCES coach_exercises(id) ON DELETE RESTRICT,
  sort_order               SMALLINT NOT NULL CHECK (sort_order BETWEEN -1 AND 500),
  planned_duration_seconds INTEGER NOT NULL CHECK (planned_duration_seconds BETWEEN 60 AND 21600),
  court_label              TEXT NOT NULL DEFAULT '',
  coach_note               TEXT NOT NULL DEFAULT '',
  created_by_actor         TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workout_plan_id, sort_order),
  UNIQUE (id, workout_plan_id),
  CHECK (length(court_label) <= 80),
  CHECK (length(coach_note) <= 1000)
);

CREATE TABLE IF NOT EXISTS coach_workout_plan_item_athletes (
  workout_plan_item_id     UUID NOT NULL,
  workout_plan_id          UUID NOT NULL,
  training_session_id      UUID NOT NULL,
  training_participant_id  UUID NOT NULL,
  player_id                UUID REFERENCES players(id) ON DELETE RESTRICT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workout_plan_item_id, training_participant_id),
  FOREIGN KEY (workout_plan_item_id, workout_plan_id)
    REFERENCES coach_workout_plan_items(id, workout_plan_id) ON DELETE CASCADE,
  FOREIGN KEY (workout_plan_id, training_session_id)
    REFERENCES coach_workout_plans(id, training_session_id) ON DELETE CASCADE,
  FOREIGN KEY (training_participant_id, training_session_id)
    REFERENCES coach_training_participants(id, training_session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS coach_exercise_executions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_session_id      UUID NOT NULL REFERENCES coach_training_sessions(id) ON DELETE CASCADE,
  workout_plan_item_id     UUID REFERENCES coach_workout_plan_items(id) ON DELETE SET NULL,
  exercise_id              UUID NOT NULL REFERENCES coach_exercises(id) ON DELETE RESTRICT,
  status                   TEXT NOT NULL DEFAULT 'running'
                           CHECK (status IN ('running', 'paused', 'completed', 'cancelled')),
  target_duration_seconds  INTEGER NOT NULL CHECK (target_duration_seconds BETWEEN 60 AND 21600),
  elapsed_seconds          INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_seconds BETWEEN 0 AND 86400),
  duration_seconds         INTEGER CHECK (duration_seconds BETWEEN 0 AND 86400),
  started_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  resumed_at               TIMESTAMPTZ,
  paused_at                TIMESTAMPTZ,
  ended_at                 TIMESTAMPTZ,
  court_label              TEXT NOT NULL DEFAULT '',
  coach_rating             SMALLINT CHECK (coach_rating BETWEEN 1 AND 5),
  coach_comment            TEXT NOT NULL DEFAULT '',
  revision                 INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_actor         TEXT NOT NULL,
  updated_by_actor         TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, training_session_id),
  CHECK (length(court_label) <= 80),
  CHECK (length(coach_comment) <= 2000),
  CHECK ((status = 'running' AND resumed_at IS NOT NULL AND ended_at IS NULL)
      OR (status = 'paused' AND resumed_at IS NULL AND paused_at IS NOT NULL AND ended_at IS NULL)
      OR (status IN ('completed', 'cancelled') AND resumed_at IS NULL AND ended_at IS NOT NULL)),
  CHECK (status <> 'completed' OR duration_seconds IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS coach_exercise_executions_one_active
  ON coach_exercise_executions(training_session_id)
  WHERE status IN ('running', 'paused');

CREATE TABLE IF NOT EXISTS coach_exercise_execution_athletes (
  execution_id             UUID NOT NULL,
  training_session_id      UUID NOT NULL,
  training_participant_id  UUID NOT NULL,
  player_id                UUID REFERENCES players(id) ON DELETE RESTRICT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (execution_id, training_participant_id),
  FOREIGN KEY (execution_id, training_session_id)
    REFERENCES coach_exercise_executions(id, training_session_id) ON DELETE CASCADE,
  FOREIGN KEY (training_participant_id, training_session_id)
    REFERENCES coach_training_participants(id, training_session_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS coach_workout_plan_items_plan_idx
  ON coach_workout_plan_items(workout_plan_id, sort_order, id);
CREATE INDEX IF NOT EXISTS coach_workout_plan_item_athletes_participant_idx
  ON coach_workout_plan_item_athletes(training_participant_id, workout_plan_item_id);
CREATE INDEX IF NOT EXISTS coach_exercise_executions_session_idx
  ON coach_exercise_executions(training_session_id, started_at, id);
CREATE INDEX IF NOT EXISTS coach_exercise_executions_exercise_idx
  ON coach_exercise_executions(exercise_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS coach_exercise_execution_athletes_participant_idx
  ON coach_exercise_execution_athletes(training_participant_id, execution_id);

DROP TRIGGER IF EXISTS coach_workout_plans_updated_at ON coach_workout_plans;
CREATE TRIGGER coach_workout_plans_updated_at
  BEFORE UPDATE ON coach_workout_plans
  FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();

DROP TRIGGER IF EXISTS coach_workout_plan_items_updated_at ON coach_workout_plan_items;
CREATE TRIGGER coach_workout_plan_items_updated_at
  BEFORE UPDATE ON coach_workout_plan_items
  FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();

DROP TRIGGER IF EXISTS coach_exercise_executions_updated_at ON coach_exercise_executions;
CREATE TRIGGER coach_exercise_executions_updated_at
  BEFORE UPDATE ON coach_exercise_executions
  FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_workout_plans TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_workout_plan_items TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_workout_plan_item_athletes TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_exercise_executions TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_exercise_execution_athletes TO lpbvolley';
  END IF;
END $$;

COMMIT;
