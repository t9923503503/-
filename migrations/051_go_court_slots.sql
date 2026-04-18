BEGIN;

-- Court player slots (8 per court: 1-4 M, 5-8 W by default for mixed)
CREATE TABLE IF NOT EXISTS go_court_slot (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id    UUID NOT NULL REFERENCES go_court(id) ON DELETE CASCADE,
  slot_order  INT NOT NULL CHECK (slot_order BETWEEN 1 AND 8),
  gender      CHAR(1) NOT NULL CHECK (gender IN ('M', 'W')),
  player_id   UUID REFERENCES players(id) ON DELETE SET NULL,
  player_name TEXT,
  assigned_at TIMESTAMPTZ,
  assigned_by UUID,
  UNIQUE (court_id, slot_order)
);

CREATE INDEX IF NOT EXISTS go_court_slot_court_idx ON go_court_slot(court_id);

-- Analytics: when was court last cleared
ALTER TABLE go_court ADD COLUMN IF NOT EXISTS last_cleared_at TIMESTAMPTZ;

-- History: snapshot of who was in slots before each clear (for undo)
CREATE TABLE IF NOT EXISTS go_court_slot_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id   UUID NOT NULL REFERENCES go_court(id) ON DELETE CASCADE,
  cleared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleared_by UUID,
  snapshot   JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS go_court_slot_history_court_idx ON go_court_slot_history(court_id);

-- Finalized settings snapshot at bootstrap_groups time (immutable during tournament)
ALTER TABLE go_round ADD COLUMN IF NOT EXISTS finalized_settings JSONB;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE go_court_slot TO lpbvolley;
GRANT SELECT, INSERT ON TABLE go_court_slot_history TO lpbvolley;

COMMIT;
