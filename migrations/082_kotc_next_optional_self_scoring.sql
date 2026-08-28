-- KOTC Next optional player self-scoring.
-- The immutable score audit stays enabled regardless of tournament UI settings.

BEGIN;

ALTER TABLE kotcn_event_log
  DROP CONSTRAINT IF EXISTS kotcn_event_log_actor_kind_check;
ALTER TABLE kotcn_event_log
  ADD CONSTRAINT kotcn_event_log_actor_kind_check
  CHECK (actor_kind IN ('player', 'judge', 'operator', 'admin', 'system'));

ALTER TABLE kotcn_control_command
  DROP CONSTRAINT IF EXISTS kotcn_control_command_actor_kind_check;
ALTER TABLE kotcn_control_command
  ADD CONSTRAINT kotcn_control_command_actor_kind_check
  CHECK (actor_kind IN ('player', 'judge', 'operator', 'admin', 'system'));

CREATE INDEX IF NOT EXISTS kotcn_event_log_raund_score_created_idx
  ON kotcn_event_log (raund_id, created_at DESC)
  WHERE event_type IN ('pair_point', 'undo', 'correct_score', 'revert_correction');

COMMIT;
