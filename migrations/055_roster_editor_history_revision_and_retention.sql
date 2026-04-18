-- 055: Roster editor optimistic locking metadata + retention helper index

ALTER TABLE roster_editor_history_state
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;

ALTER TABLE roster_editor_history_state
  ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_roster_editor_history_state_updated_at
  ON roster_editor_history_state (updated_at DESC);

-- Retention helper for service job (delete old action logs by created_at):
-- DELETE FROM roster_editor_action_log
--  WHERE created_at < now() - interval '30 days';
