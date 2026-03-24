-- ============================================================
-- 014: Fix permissions on tournament_results & rating_history
--
-- Migration 008 only granted SELECT to the 'authenticated' role
-- (Supabase convention), but Next.js connects as the table owner
-- or a direct Postgres user who needs INSERT/UPDATE/DELETE too.
--
-- This migration grants full access to the current DB user
-- and disables RLS for the service/admin connection so that
-- Next.js route handlers can write results without restrictions.
-- ============================================================

-- Ensure the tables exist (idempotent — safe to run even if 008 already ran)
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
CREATE INDEX IF NOT EXISTS idx_tr_player     ON tournament_results(player_id);

CREATE TABLE IF NOT EXISTS rating_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id      TEXT NOT NULL,
  tournament_id  TEXT NOT NULL,
  delta          NUMERIC NOT NULL DEFAULT 0,
  new_total      NUMERIC NOT NULL DEFAULT 0,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rh_player     ON rating_history(player_id);
CREATE INDEX IF NOT EXISTS idx_rh_tournament ON rating_history(tournament_id);
CREATE INDEX IF NOT EXISTS idx_rh_recorded   ON rating_history(recorded_at DESC);

-- Grant full access to the current user (whoever runs the migration = DB owner)
GRANT ALL ON TABLE tournament_results TO CURRENT_USER;
GRANT ALL ON TABLE rating_history     TO CURRENT_USER;
GRANT ALL ON TABLE player_requests    TO CURRENT_USER;

-- If RLS is enabled, bypass it for the owner connection
ALTER TABLE tournament_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE rating_history     DISABLE ROW LEVEL SECURITY;
