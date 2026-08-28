-- KOTC Next control safety, audit log and lightweight judge presence.

BEGIN;

ALTER TABLE kotcn_round
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;

ALTER TABLE kotcn_raund
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accumulated_pause_ms BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_phase TEXT,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_controlled_by TEXT,
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;

ALTER TABLE kotcn_raund DROP CONSTRAINT IF EXISTS kotcn_raund_status_check;
ALTER TABLE kotcn_raund
  ADD CONSTRAINT kotcn_raund_status_check
  CHECK (status IN ('pending', 'running', 'paused', 'finished'));

ALTER TABLE kotcn_raund DROP CONSTRAINT IF EXISTS kotcn_raund_paused_phase_check;
ALTER TABLE kotcn_raund
  ADD CONSTRAINT kotcn_raund_paused_phase_check
  CHECK (paused_phase IS NULL OR paused_phase IN ('countdown', 'running'));

ALTER TABLE kotcn_raund DROP CONSTRAINT IF EXISTS kotcn_raund_controller_check;
ALTER TABLE kotcn_raund
  ADD CONSTRAINT kotcn_raund_controller_check
  CHECK (last_controlled_by IS NULL OR last_controlled_by IN ('judge', 'operator', 'admin', 'system'));

CREATE TABLE IF NOT EXISTS kotcn_control_command (
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('judge', 'operator', 'admin', 'system')),
  actor_id TEXT,
  request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (tournament_id, command_id)
);

CREATE TABLE IF NOT EXISTS kotcn_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_id UUID REFERENCES kotcn_round(id) ON DELETE SET NULL,
  court_id UUID REFERENCES kotcn_court(id) ON DELETE SET NULL,
  raund_id UUID REFERENCES kotcn_raund(id) ON DELETE SET NULL,
  command_id TEXT,
  event_type TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('judge', 'operator', 'admin', 'system')),
  actor_id TEXT,
  reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  before_state JSONB,
  after_state JSONB,
  revision_before BIGINT,
  revision_after BIGINT,
  reverted_event_id UUID REFERENCES kotcn_event_log(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, command_id)
);

CREATE INDEX IF NOT EXISTS kotcn_event_log_tournament_created_idx
  ON kotcn_event_log (tournament_id, created_at DESC);

CREATE TABLE IF NOT EXISTS kotcn_presence (
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  court_id UUID NOT NULL REFERENCES kotcn_court(id) ON DELETE CASCADE,
  device_id UUID NOT NULL,
  selected_raund_no INT NOT NULL CHECK (selected_raund_no >= 1),
  app_version TEXT,
  platform TEXT,
  user_agent TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (court_id, device_id)
);

CREATE INDEX IF NOT EXISTS kotcn_presence_tournament_last_seen_idx
  ON kotcn_presence (tournament_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS kotcn_presence_last_seen_idx
  ON kotcn_presence (last_seen_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE kotcn_control_command TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE kotcn_event_log TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE kotcn_presence TO lpbvolley;

COMMIT;
