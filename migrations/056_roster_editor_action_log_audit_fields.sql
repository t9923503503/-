-- 056: Add audit metadata fields to roster_editor_action_log

ALTER TABLE roster_editor_action_log
  ADD COLUMN IF NOT EXISTS session_id TEXT;

ALTER TABLE roster_editor_action_log
  ADD COLUMN IF NOT EXISTS request_id TEXT;

ALTER TABLE roster_editor_action_log
  ADD COLUMN IF NOT EXISTS revision_before BIGINT;

ALTER TABLE roster_editor_action_log
  ADD COLUMN IF NOT EXISTS revision_after BIGINT;

CREATE INDEX IF NOT EXISTS idx_roster_editor_action_log_request_id
  ON roster_editor_action_log (request_id)
  WHERE request_id IS NOT NULL;
