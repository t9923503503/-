BEGIN;

ALTER TABLE individual_mix_sessions
  DROP CONSTRAINT IF EXISTS individual_mix_sessions_current_round_check;

ALTER TABLE individual_mix_sessions
  ADD CONSTRAINT individual_mix_sessions_current_round_check
  CHECK (current_round BETWEEN 1 AND 9);

ALTER TABLE individual_mix_commands
  DROP CONSTRAINT IF EXISTS individual_mix_commands_command_type_check;

ALTER TABLE individual_mix_commands
  ADD CONSTRAINT individual_mix_commands_command_type_check
  CHECK (command_type IN (
    'record_score',
    'undo_last',
    'correct_score',
    'replace_player',
    'rebuild_schedule',
    'restore_snapshot',
    'start_postseason',
    'finalize'
  ));

COMMIT;
