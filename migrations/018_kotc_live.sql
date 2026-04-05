-- ============================================================
-- 018: KOTC live sessions (hub + judges)
-- ============================================================

CREATE TABLE IF NOT EXISTS live_kotc_session (
  session_id        TEXT PRIMARY KEY,
  tournament_id     UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  format            TEXT NOT NULL DEFAULT 'KOTC' CHECK (format = 'KOTC'),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'finished', 'cancelled')),
  phase             TEXT NOT NULL DEFAULT 'setup',
  nc                INTEGER NOT NULL DEFAULT 4 CHECK (nc BETWEEN 1 AND 4),
  ppc               INTEGER NOT NULL DEFAULT 4 CHECK (ppc = 4),
  session_version   BIGINT NOT NULL DEFAULT 1,
  structure_epoch   BIGINT NOT NULL DEFAULT 0,
  state_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  hub_seat_id       BIGINT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_live_kotc_session_tournament
  ON live_kotc_session (tournament_id);

CREATE INDEX IF NOT EXISTS idx_live_kotc_session_status
  ON live_kotc_session (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS live_kotc_court_state (
  session_id         TEXT NOT NULL REFERENCES live_kotc_session(session_id) ON DELETE CASCADE,
  court_idx          INTEGER NOT NULL CHECK (court_idx BETWEEN 1 AND 4),
  court_version      BIGINT NOT NULL DEFAULT 0,
  round_idx          INTEGER NOT NULL DEFAULT 0,
  roster_m_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
  roster_w_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
  scores_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  timer_status       TEXT NOT NULL DEFAULT 'idle' CHECK (timer_status IN ('idle', 'running', 'paused')),
  timer_duration_ms  INTEGER NOT NULL DEFAULT 0,
  timer_ends_at      TIMESTAMPTZ NULL,
  timer_paused_at    TIMESTAMPTZ NULL,
  last_command_id    TEXT NULL,
  last_updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_by    TEXT NULL,
  PRIMARY KEY (session_id, court_idx)
);

CREATE INDEX IF NOT EXISTS idx_live_kotc_court_state_updated
  ON live_kotc_court_state (session_id, last_updated_at DESC);

CREATE TABLE IF NOT EXISTS live_kotc_division_state (
  session_id        TEXT NOT NULL REFERENCES live_kotc_session(session_id) ON DELETE CASCADE,
  division_key      TEXT NOT NULL,
  division_version  BIGINT NOT NULL DEFAULT 0,
  roster_json       JSONB NOT NULL DEFAULT '[]'::jsonb,
  scores_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  round_idx         INTEGER NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, division_key)
);

CREATE TABLE IF NOT EXISTS live_kotc_seat (
  seat_id          BIGSERIAL PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES live_kotc_session(session_id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('hub', 'judge')),
  court_idx        INTEGER NULL CHECK (court_idx BETWEEN 1 AND 4),
  device_id        TEXT NOT NULL,
  display_name     TEXT NOT NULL DEFAULT '',
  user_id          TEXT NULL,
  seat_nonce       TEXT NOT NULL,
  lease_until      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '45 seconds'),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at      TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_kotc_hub_single
  ON live_kotc_seat (session_id)
  WHERE role = 'hub' AND released_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_kotc_judge_single
  ON live_kotc_seat (session_id, court_idx)
  WHERE role = 'judge' AND released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_live_kotc_seat_device
  ON live_kotc_seat (session_id, device_id)
  WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_live_kotc_seat_lease
  ON live_kotc_seat (lease_until)
  WHERE released_at IS NULL;

ALTER TABLE live_kotc_session
  ADD CONSTRAINT fk_live_kotc_hub_seat
  FOREIGN KEY (hub_seat_id) REFERENCES live_kotc_seat(seat_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS live_kotc_command_log (
  command_log_id      BIGSERIAL PRIMARY KEY,
  session_id          TEXT NOT NULL REFERENCES live_kotc_session(session_id) ON DELETE CASCADE,
  seat_id             BIGINT NULL REFERENCES live_kotc_seat(seat_id) ON DELETE SET NULL,
  command_id          TEXT NOT NULL,
  command_type        TEXT NOT NULL,
  scope               TEXT NOT NULL CHECK (scope IN ('session', 'structure', 'court', 'division', 'global', 'seat')),
  court_idx           INTEGER NULL CHECK (court_idx BETWEEN 1 AND 4),
  before_version      BIGINT NOT NULL DEFAULT 0,
  after_version       BIGINT NOT NULL DEFAULT 0,
  delta_json          JSONB NULL,
  applied_result_json JSONB NULL,
  seat_nonce          TEXT NULL,
  ip                  TEXT NULL,
  user_agent          TEXT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, command_id)
);

CREATE INDEX IF NOT EXISTS idx_live_kotc_command_log_session_time
  ON live_kotc_command_log (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_kotc_command_log_session_court
  ON live_kotc_command_log (session_id, court_idx, created_at DESC);
