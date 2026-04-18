-- 053: Judge Scoreboard server-backed shared state

CREATE TABLE IF NOT EXISTS judge_scoreboard_state (
  court_id    TEXT PRIMARY KEY,
  state_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  version     BIGINT NOT NULL DEFAULT 0,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_judge_scoreboard_state_updated_at
  ON judge_scoreboard_state (updated_at DESC);
