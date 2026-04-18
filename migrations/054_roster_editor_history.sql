-- 054: Admin roster editor per-user persistent undo/redo history

CREATE TABLE IF NOT EXISTS roster_editor_history_state (
  tournament_id TEXT NOT NULL,
  actor_id      TEXT NOT NULL,
  cursor        INTEGER NOT NULL DEFAULT -1,
  stack_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, actor_id)
);

CREATE TABLE IF NOT EXISTS roster_editor_action_log (
  id            BIGSERIAL PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  actor_id      TEXT NOT NULL,
  action_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_json JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roster_editor_action_log_tournament_actor_created
  ON roster_editor_action_log (tournament_id, actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_roster_editor_action_log_created_at
  ON roster_editor_action_log (created_at DESC);
