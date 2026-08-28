-- Mobile control, idempotent commands, court PINs and reversible history.
BEGIN;

CREATE TABLE IF NOT EXISTS classification_command (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('judge', 'operator', 'admin', 'system')),
  actor_id TEXT,
  request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (tournament_id, command_id)
);

CREATE TABLE IF NOT EXISTS classification_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  command_id TEXT,
  event_type TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('judge', 'operator', 'admin', 'system')),
  actor_id TEXT,
  reason TEXT NOT NULL DEFAULT '',
  affected_match_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  before_state JSONB,
  after_state JSONB,
  version_before INT,
  version_after INT,
  reverted_event_id UUID REFERENCES classification_event(id),
  reverted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS classification_court_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  court_no INT NOT NULL CHECK (court_no BETWEEN 1 AND 32),
  pin_code TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, court_no)
);

CREATE INDEX IF NOT EXISTS classification_event_tournament_created_idx
  ON classification_event(tournament_id, created_at DESC);
CREATE INDEX IF NOT EXISTS classification_command_tournament_created_idx
  ON classification_command(tournament_id, created_at DESC);
CREATE INDEX IF NOT EXISTS classification_court_pin_idx
  ON classification_court_access(pin_code) WHERE active;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON classification_command TO lpbvolley;
    GRANT SELECT, INSERT, UPDATE, DELETE ON classification_event TO lpbvolley;
    GRANT SELECT, INSERT, UPDATE, DELETE ON classification_court_access TO lpbvolley;
  END IF;
END
$$;

COMMIT;
