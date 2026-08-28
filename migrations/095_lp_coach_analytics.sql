-- 095: LP Coach factual analytics query indexes.
BEGIN;

CREATE INDEX IF NOT EXISTS coach_exercise_executions_completed_period_idx
  ON coach_exercise_executions(ended_at DESC, training_session_id, exercise_id)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS coach_exercise_execution_athletes_player_idx
  ON coach_exercise_execution_athletes(player_id, execution_id)
  WHERE player_id IS NOT NULL;

COMMIT;
