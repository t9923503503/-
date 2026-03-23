-- ============================================================
-- 008: Tournament Results + Rating History
-- Phase 8 (S8.1 + S8.2)
-- ============================================================

-- Each row = one player's result in one tournament.
CREATE TABLE IF NOT EXISTS tournament_results (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  TEXT NOT NULL,
  player_id      TEXT NOT NULL,
  placement      INT NOT NULL,
  points         NUMERIC NOT NULL DEFAULT 0,
  format         TEXT NOT NULL DEFAULT '',
  division       TEXT DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_tr_tournament ON tournament_results(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tr_player ON tournament_results(player_id);

ALTER TABLE tournament_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE tournament_results FROM PUBLIC, anon;

-- Authenticated users can read all results
CREATE POLICY tr_select ON tournament_results FOR SELECT TO authenticated USING (true);
-- Only insert/update via RPC (SECURITY DEFINER)
GRANT SELECT ON tournament_results TO authenticated;

-- ── Rating History ──────────────────────────────────────────
-- Each row = a snapshot of a player's rating after a tournament.
CREATE TABLE IF NOT EXISTS rating_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id      TEXT NOT NULL,
  tournament_id  TEXT NOT NULL,
  delta          NUMERIC NOT NULL DEFAULT 0,
  new_total      NUMERIC NOT NULL DEFAULT 0,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rh_player ON rating_history(player_id);
CREATE INDEX IF NOT EXISTS idx_rh_tournament ON rating_history(tournament_id);
CREATE INDEX IF NOT EXISTS idx_rh_recorded ON rating_history(recorded_at DESC);

ALTER TABLE rating_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE rating_history FROM PUBLIC, anon;

CREATE POLICY rh_select ON rating_history FOR SELECT TO authenticated USING (true);
GRANT SELECT ON rating_history TO authenticated;
