-- KOTC Next: server-backed judge module tables
-- Mirrors Thai Next structure but for King-of-the-Court mechanics

BEGIN;

-- Round (R1 / R2)
CREATE TABLE IF NOT EXISTS kotcn_round (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_no      INT  NOT NULL CHECK (round_no IN (1, 2)),  -- 1=R1, 2=R2
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'live', 'finished')),
  seed          INT  NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round_no)
);

-- Court within a round (1–4 courts; in R2 labelled by zone)
CREATE TABLE IF NOT EXISTS kotcn_court (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id  UUID NOT NULL REFERENCES kotcn_round(id) ON DELETE CASCADE,
  court_no  INT  NOT NULL CHECK (court_no BETWEEN 1 AND 4),
  label     TEXT NOT NULL,           -- 'К1'/'К2' for R1; 'КИН'/'АДАНС'/'МЕДИУМ'/'ЛАЙТ' for R2
  pin_code  TEXT NOT NULL,           -- deterministic 8-char PIN (SHA1-based)
  status    TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'live', 'finished')),
  UNIQUE (round_id, court_no)
);

-- Fixed pairs per court (set at bootstrap, never change during round)
CREATE TABLE IF NOT EXISTS kotcn_pair (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id            UUID NOT NULL REFERENCES kotcn_court(id) ON DELETE CASCADE,
  pair_idx            INT  NOT NULL,   -- 0-based index within the court (0..ppc-1)
  player_primary_id   UUID REFERENCES players(id),
  player_secondary_id UUID REFERENCES players(id),  -- NULL for MM/WW single-gender pairs
  UNIQUE (court_id, pair_idx)
);

-- Timed period within a court (one raund = one timer + one rotation set)
CREATE TABLE IF NOT EXISTS kotcn_raund (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id             UUID NOT NULL REFERENCES kotcn_court(id) ON DELETE CASCADE,
  raund_no             INT  NOT NULL,   -- 1-based (1..raundCount)
  timer_minutes        INT  NOT NULL DEFAULT 10,
  started_at           TIMESTAMPTZ,
  finished_at          TIMESTAMPTZ,
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'running', 'finished')),
  -- initial positions (set at start of raund via getInitialKotcNextCourtState)
  king_pair_idx        INT  NOT NULL DEFAULT 0,
  challenger_pair_idx  INT  NOT NULL DEFAULT 1,
  queue_order          INT[] NOT NULL DEFAULT '{}',  -- remaining pair indices
  UNIQUE (court_id, raund_no)
);

-- Individual game event log (every king-point or takeover)
CREATE TABLE IF NOT EXISTS kotcn_game (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raund_id             UUID NOT NULL REFERENCES kotcn_raund(id) ON DELETE CASCADE,
  seq_no               INT  NOT NULL,   -- monotonically increasing per raund
  event_type           TEXT NOT NULL CHECK (event_type IN ('king_point', 'takeover')),
  king_pair_idx        INT  NOT NULL,   -- who was King at the moment of this event
  challenger_pair_idx  INT  NOT NULL,   -- who was Challenger
  played_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (raund_id, seq_no)
);

-- Aggregated statistics per pair per raund (updated incrementally)
CREATE TABLE IF NOT EXISTS kotcn_raund_stat (
  raund_id     UUID NOT NULL REFERENCES kotcn_raund(id) ON DELETE CASCADE,
  pair_idx     INT  NOT NULL,
  king_wins    INT  NOT NULL DEFAULT 0,   -- points scored while on throne
  takeovers    INT  NOT NULL DEFAULT 0,   -- times challenger took the throne (tiebreak)
  games_played INT  NOT NULL DEFAULT 0,   -- total games participated in
  PRIMARY KEY (raund_id, pair_idx)
);

-- Aggregated statistics per pair per round (R1 / R2), computed at finishR1/R2
CREATE TABLE IF NOT EXISTS kotcn_player_round_stat (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id    UUID NOT NULL REFERENCES kotcn_round(id) ON DELETE CASCADE,
  player_id   UUID REFERENCES players(id),
  pair_idx    INT  NOT NULL,
  king_wins   INT  NOT NULL DEFAULT 0,
  takeovers   INT  NOT NULL DEFAULT 0,
  games_played INT NOT NULL DEFAULT 0,
  position    INT,         -- rank within court
  zone        TEXT         -- 'kin'|'advance'|'medium'|'lite' (set after finish_r1)
);

-- Indexes
CREATE INDEX IF NOT EXISTS kotcn_round_tournament_idx ON kotcn_round(tournament_id);
CREATE INDEX IF NOT EXISTS kotcn_court_round_idx      ON kotcn_court(round_id);
CREATE INDEX IF NOT EXISTS kotcn_pair_court_idx       ON kotcn_pair(court_id);
CREATE INDEX IF NOT EXISTS kotcn_raund_court_idx      ON kotcn_raund(court_id);
CREATE INDEX IF NOT EXISTS kotcn_game_raund_idx       ON kotcn_game(raund_id);
CREATE INDEX IF NOT EXISTS kotcn_raund_stat_raund_idx ON kotcn_raund_stat(raund_id);
CREATE INDEX IF NOT EXISTS kotcn_player_round_stat_round_idx ON kotcn_player_round_stat(round_id);

COMMIT;
