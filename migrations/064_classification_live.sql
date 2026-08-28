BEGIN;

CREATE TABLE IF NOT EXISTS classification_live_state (
  tournament_id UUID PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'setup'
    CHECK (status IN ('setup', 'groups_live', 'groups_finished', 'classification_live', 'finished')),
  version INT NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classification_live_state_status_idx
  ON classification_live_state(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE classification_live_state TO lpbvolley;

COMMIT;
