-- ============================================================
-- 021: Thai judge v2 (normalized judge state for Next.js flow)
-- ============================================================

CREATE TABLE IF NOT EXISTS thai_round (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id     UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_no          INTEGER NOT NULL CHECK (round_no >= 1),
  round_type        TEXT NOT NULL CHECK (round_type IN ('r1', 'r2')),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'live', 'finished')),
  current_tour_no   INTEGER NOT NULL DEFAULT 1 CHECK (current_tour_no >= 1),
  seed              INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ NULL,
  finished_at       TIMESTAMPTZ NULL,
  UNIQUE (tournament_id, round_no),
  UNIQUE (tournament_id, round_type)
);

CREATE INDEX IF NOT EXISTS idx_thai_round_tournament
  ON thai_round (tournament_id, round_no, status);

CREATE TABLE IF NOT EXISTS thai_court (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id     UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_id          UUID NOT NULL REFERENCES thai_round(id) ON DELETE CASCADE,
  court_no          INTEGER NOT NULL CHECK (court_no >= 1),
  label             TEXT NOT NULL,
  pin_code          TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'live', 'finished')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, court_no),
  UNIQUE (round_id, label)
);

CREATE INDEX IF NOT EXISTS idx_thai_court_round
  ON thai_court (round_id, court_no, status);

CREATE TABLE IF NOT EXISTS thai_tour (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id          UUID NOT NULL REFERENCES thai_court(id) ON DELETE CASCADE,
  tour_no           INTEGER NOT NULL CHECK (tour_no >= 1),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  confirmed_at      TIMESTAMPTZ NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (court_id, tour_no)
);

CREATE INDEX IF NOT EXISTS idx_thai_tour_court
  ON thai_tour (court_id, tour_no, status);

CREATE TABLE IF NOT EXISTS thai_match (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id           UUID NOT NULL REFERENCES thai_tour(id) ON DELETE CASCADE,
  match_no          INTEGER NOT NULL CHECK (match_no IN (1, 2)),
  team1_score       INTEGER NULL CHECK (team1_score IS NULL OR team1_score >= 0),
  team2_score       INTEGER NULL CHECK (team2_score IS NULL OR team2_score >= 0),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tour_id, match_no)
);

CREATE INDEX IF NOT EXISTS idx_thai_match_tour
  ON thai_match (tour_id, match_no, status);

CREATE TABLE IF NOT EXISTS thai_match_player (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id          UUID NOT NULL REFERENCES thai_match(id) ON DELETE CASCADE,
  player_id         UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_side         INTEGER NOT NULL CHECK (team_side IN (1, 2)),
  player_role       TEXT NOT NULL CHECK (player_role IN ('primary', 'secondary')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id),
  UNIQUE (match_id, team_side, player_role)
);

CREATE INDEX IF NOT EXISTS idx_thai_match_player_match
  ON thai_match_player (match_id, team_side, player_role);

CREATE TABLE IF NOT EXISTS thai_player_round_stat (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id     UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_id          UUID NOT NULL REFERENCES thai_round(id) ON DELETE CASCADE,
  player_id         UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  total_diff        INTEGER NOT NULL DEFAULT 0,
  total_scored      INTEGER NOT NULL DEFAULT 0,
  points_p          INTEGER NOT NULL DEFAULT 0,
  kef               NUMERIC(12, 6) NOT NULL DEFAULT 1.0,
  wins              INTEGER NOT NULL DEFAULT 0,
  position          INTEGER NULL,
  zone              TEXT NULL CHECK (zone IN ('hard', 'advance', 'medium', 'light')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_thai_player_round_stat_round
  ON thai_player_round_stat (round_id, points_p DESC, total_diff DESC, wins DESC);
